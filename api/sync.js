import { db } from './_lib/db.js'
import { authMiddleware } from './_lib/jwt.js'
import { loginTopF2F, fetchIndivHtml, discoverTeamUrl, fetchTeamHtml, parseProductionTable } from './_lib/topf2f.js'

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })

  const supabase = db()

  try {
    const { data: user } = await supabase
      .from('users').select('topf2f_user, topf2f_pass').eq('id', claim.id).single()

    if (!user?.topf2f_user || !user?.topf2f_pass)
      return res.status(400).json({ error: 'No tienes credenciales de topf2f configuradas.' })

    const topf2f_pass = Buffer.from(user.topf2f_pass, 'base64').toString('utf8')
    const cookies = await loginTopF2F(user.topf2f_user, topf2f_pass)

    // Try team production first (gives captador, NIF, fecha_nacimiento)
    const indivHtml = await fetchIndivHtml(cookies)
    const teamUrl   = discoverTeamUrl(indivHtml)
    console.log(`[sync] teamUrl=${teamUrl || 'none'}`)

    let html = indivHtml
    let hasTeam = false
    if (teamUrl) {
      const teamHtml = await fetchTeamHtml(cookies, teamUrl)
      if (teamHtml) { html = teamHtml; hasTeam = true }
    }

    const socios = parseProductionTable(html)
    console.log(`[sync] parsed=${socios.length} hasTeam=${hasTeam}`)

    if (socios.length === 0) {
      const tableCount = (html.match(/<table/gi) || []).length
      return res.status(200).json({
        ok: true, new: 0, updated: 0, total: 0,
        debug: html.includes('Formulario')
          ? `Página OK (${tableCount} tablas) — sin filas de socios.`
          : `Posible fallo de sesión (${html.length} chars).`
      })
    }

    // Build captador name → CRM user ID map
    const { data: captUsers } = await supabase
      .from('users')
      .select('id, topf2f_captador_nombre')
      .not('topf2f_captador_nombre', 'is', null)

    const captadorMap = {}
    for (const u of captUsers || [])
      if (u.topf2f_captador_nombre)
        captadorMap[u.topf2f_captador_nombre.toLowerCase().trim()] = u.id

    // Bulk-fetch existing records to preserve data not in current sync
    const numFormularios = socios.map(s => s.num_formulario)
    const { data: existingRows } = await supabase
      .from('socios')
      .select('num_formulario, fecha_nacimiento, sexo, captador_id, nif')
      .in('num_formulario', numFormularios)

    const existingMap = {}
    for (const row of existingRows || []) existingMap[row.num_formulario] = row
    const existingNums = new Set(Object.keys(existingMap))

    // Build records
    const records = socios.map(s => {
      const ex = existingMap[s.num_formulario]
      const captadorId =
        (s.captador_nombre && captadorMap[s.captador_nombre.toLowerCase().trim()]) ||
        ex?.captador_id ||
        null

      const { captador_nombre, ...rest } = s
      return {
        ...rest,
        captador_id: captadorId,
        last_sync: new Date().toISOString(),
        fecha_nacimiento: s.fecha_nacimiento || ex?.fecha_nacimiento || null,
        sexo: s.sexo || ex?.sexo || null,
        nif: s.nif || ex?.nif || null,
      }
    })

    const newCount     = records.filter(r => !existingNums.has(r.num_formulario)).length
    const updatedCount = records.length - newCount

    const { error: upsertErr } = await supabase
      .from('socios')
      .upsert(records, { onConflict: 'num_formulario' })
    if (upsertErr) throw new Error('Upsert error: ' + upsertErr.message)

    const debugParts = []
    if (hasTeam) debugParts.push('producción de equipo')
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
