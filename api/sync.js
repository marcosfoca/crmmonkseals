import { db } from './_lib/db.js'
import { authMiddleware } from './_lib/jwt.js'
import { loginTopF2F, fetchIndivHtml, discoverTeamUrl, fetchTeamHtml, parseProductionTable } from './_lib/topf2f.js'

async function getVisibleUserIds(supabase, userId, role) {
  if (role === 99) return null
  const { data: rows } = await supabase.from('users').select('id, parent_id')
  const visible = new Set([userId])
  let changed = true
  while (changed) {
    changed = false
    for (const u of rows || []) {
      if (u.parent_id && visible.has(u.parent_id) && !visible.has(u.id)) {
        visible.add(u.id); changed = true
      }
    }
  }
  return [...visible]
}

// Fetch + parse one topf2f account's production page
async function syncAccount(topf2f_user, topf2f_pass_b64) {
  const pass    = Buffer.from(topf2f_pass_b64, 'base64').toString('utf8')
  const cookies = await loginTopF2F(topf2f_user, pass)
  const indivHtml = await fetchIndivHtml(cookies)
  const teamUrl   = discoverTeamUrl(indivHtml)
  let html = indivHtml, hasTeam = false
  if (teamUrl) {
    const teamHtml = await fetchTeamHtml(cookies, teamUrl)
    if (teamHtml) { html = teamHtml; hasTeam = true }
  }
  const { socios } = parseProductionTable(html)
  return { socios, hasTeam }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })

  const supabase = db()

  try {
    const visibleIds = await getVisibleUserIds(supabase, claim.id, claim.role)

    // Collect all topf2f accounts in the visible tree (admins only sync self to avoid runaway)
    let credQuery = supabase.from('users')
      .select('id, topf2f_user, topf2f_pass')
      .not('topf2f_user', 'is', null)
      .not('topf2f_pass', 'is', null)
    if (visibleIds) credQuery = credQuery.in('id', visibleIds)
    else            credQuery = credQuery.eq('id', claim.id)

    const { data: accounts } = await credQuery
    if (!accounts?.length) return res.status(400).json({ error: 'No tienes credenciales de topf2f configuradas.' })

    console.log(`[sync] syncing ${accounts.length} account(s)`)

    // Sync all accounts in parallel
    const results = await Promise.allSettled(
      accounts.map(a => syncAccount(a.topf2f_user, a.topf2f_pass))
    )

    // Merge socios across all accounts (non-null values win)
    const sociosMap = {}
    let anyTeam = false
    for (const r of results) {
      if (r.status === 'rejected') { console.warn('[sync] account failed:', r.reason?.message); continue }
      if (r.value.hasTeam) anyTeam = true
      for (const s of r.value.socios) {
        const prev = sociosMap[s.num_formulario]
        sociosMap[s.num_formulario] = prev ? {
          ...prev, ...s,
          fecha_nacimiento: s.fecha_nacimiento || prev.fecha_nacimiento || null,
          sexo: s.sexo || prev.sexo || null,
          nif:  s.nif  || prev.nif  || null,
        } : s
      }
    }

    const socios = Object.values(sociosMap)
    console.log(`[sync] total merged socios=${socios.length}`)

    if (socios.length === 0) {
      return res.status(200).json({ ok: true, new: 0, updated: 0, total: 0, debug: 'Sin socios en producción.' })
    }

    // Captador name → CRM user ID map
    const { data: captUsers } = await supabase
      .from('users').select('id, topf2f_captador_nombre').not('topf2f_captador_nombre', 'is', null)
    const captadorMap = {}
    for (const u of captUsers || [])
      if (u.topf2f_captador_nombre)
        captadorMap[u.topf2f_captador_nombre.toLowerCase().trim()] = u.id

    // Fetch existing DB records for these socios
    const nums = socios.map(s => s.num_formulario)
    const { data: existingRows } = await supabase
      .from('socios').select('num_formulario, fecha_nacimiento, sexo, captador_id, nif').in('num_formulario', nums)
    const existingMap = {}
    for (const row of existingRows || []) existingMap[row.num_formulario] = row
    const existingNums = new Set(Object.keys(existingMap))

    // Build upsert records
    const records = socios.map(s => {
      const ex = existingMap[s.num_formulario]
      const captadorId =
        (s.captador_nombre && captadorMap[s.captador_nombre.toLowerCase().trim()]) ||
        ex?.captador_id ||
        claim.id
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

    const newCount     = records.filter(r => !existingNums.has(r.num_formulario)).length
    const updatedCount = records.length - newCount

    const { error: upsertErr } = await supabase
      .from('socios').upsert(records, { onConflict: 'num_formulario' })
    if (upsertErr) throw new Error('Upsert error: ' + upsertErr.message)

    const debugParts = []
    if (anyTeam) debugParts.push('producción de equipo')
    if (accounts.length > 1) debugParts.push(`${accounts.length} cuentas`)
    const newlyLinked = records.filter(r => r.captador_id && !existingMap[r.num_formulario]?.captador_id).length
    if (newlyLinked > 0) debugParts.push(`${newlyLinked} enlazados`)

    return res.status(200).json({
      ok: true, new: newCount, updated: updatedCount, total: socios.length,
      ...(debugParts.length ? { debug: debugParts.join(' · ') } : {})
    })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
