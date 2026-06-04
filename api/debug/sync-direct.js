import { db } from '../_lib/db.js'
import { authMiddleware } from '../_lib/jwt.js'
import { loginTopF2F, fetchIndivHtml, discoverTeamUrl, fetchAllTeamSocios, parseProductionTable, TEAM_URL } from '../_lib/topf2f.js'

// Temporary: sync a specific topf2f account using provided credentials.
// POST /api/debug/sync-direct  { topf2f_user, topf2f_pass }
// Requires any valid JWT. Used to import accounts whose CRM owner is unknown.
export const config = { maxDuration: 120 }

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })

  const { topf2f_user, topf2f_pass } = req.body || {}
  if (!topf2f_user || !topf2f_pass) return res.status(400).json({ error: 'Faltan topf2f_user / topf2f_pass' })

  const supabase = db()

  try {
    const cookies = await loginTopF2F(topf2f_user, topf2f_pass)
    const indivHtml = await fetchIndivHtml(cookies)
    const teamUrl = discoverTeamUrl(indivHtml) || TEAM_URL

    let socios = await fetchAllTeamSocios(cookies, '2025-01-01', '2026-12-31', teamUrl)
    if (!socios?.length) {
      const { socios: fb } = parseProductionTable(indivHtml)
      socios = fb
    }
    if (!socios?.length) return res.status(200).json({ ok: true, synced: 0, teamUrl })

    // Deduplicate by num_formulario (last occurrence wins, non-null fields win)
    const sociosMap = {}
    for (const s of socios) {
      const prev = sociosMap[s.num_formulario]
      sociosMap[s.num_formulario] = prev ? {
        ...prev, ...s,
        fecha_nacimiento: s.fecha_nacimiento || prev.fecha_nacimiento || null,
        sexo: s.sexo || prev.sexo || null,
        nif:  s.nif  || prev.nif  || null,
      } : s
    }
    socios = Object.values(sociosMap)

    // Captador name → CRM user ID map
    const { data: captUsers } = await supabase
      .from('users').select('id, topf2f_captador_nombre').not('topf2f_captador_nombre', 'is', null)
    const captadorMap = {}
    for (const u of captUsers || [])
      if (u.topf2f_captador_nombre)
        captadorMap[u.topf2f_captador_nombre.toLowerCase().trim()] = u.id

    // Find CRM user who owns this topf2f account (to use as fallback captador_id)
    const { data: ownerRow } = await supabase
      .from('users').select('id').eq('topf2f_user', topf2f_user).maybeSingle()
    const fallbackCaptadorId = ownerRow?.id || claim.id

    // Fetch existing records
    const nums = socios.map(s => s.num_formulario)
    const { data: existingRows } = await supabase
      .from('socios').select('num_formulario, fecha_nacimiento, sexo, captador_id, nif').in('num_formulario', nums)
    const existingMap = {}
    for (const row of existingRows || []) existingMap[row.num_formulario] = row

    const records = socios.map(s => {
      const ex = existingMap[s.num_formulario]
      const captadorId =
        (s.captador_nombre && captadorMap[s.captador_nombre.toLowerCase().trim()]) ||
        ex?.captador_id ||
        fallbackCaptadorId
      const { captador_nombre, ...rest } = s
      return {
        ...rest,
        captador_id: captadorId,
        last_sync: new Date().toISOString(),
        fecha_nacimiento: s.fecha_nacimiento || ex?.fecha_nacimiento || null,
        sexo: s.sexo || ex?.sexo || null,
        nif:  s.nif  || ex?.nif  || null,
      }
    })

    const { error: upsertErr } = await supabase
      .from('socios').upsert(records, { onConflict: 'num_formulario' })
    if (upsertErr) throw new Error('Upsert error: ' + upsertErr.message)

    const newCount = records.filter(r => !existingMap[r.num_formulario]).length
    return res.status(200).json({
      ok: true, synced: socios.length, new: newCount, updated: records.length - newCount, teamUrl
    })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
