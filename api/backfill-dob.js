import { db } from './_lib/db.js'
import { authMiddleware } from './_lib/jwt.js'
import { loginTopF2F, fetchTeamMonthHtml, parseProductionTable } from './_lib/topf2f.js'

export const config = { maxDuration: 120 }

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const claim = authMiddleware(req)
  if (!claim || claim.role < 90) return res.status(401).json({ error: 'No autorizado' })

  const supabase = db()

  try {
    // Get admin's topf2f credentials
    const { data: user } = await supabase
      .from('users').select('topf2f_user, topf2f_pass').eq('id', claim.id).single()
    if (!user?.topf2f_user) return res.status(400).json({ error: 'Sin credenciales topf2f' })

    const pass = Buffer.from(user.topf2f_pass, 'base64').toString('utf8')
    const cookies = await loginTopF2F(user.topf2f_user, pass)

    // Default: fetch from May 2025 to current month
    const now = new Date()
    const endYear  = now.getFullYear()
    const endMonth = now.getMonth() + 1
    const startYear  = parseInt(req.body?.startYear  || 2025)
    const startMonth = parseInt(req.body?.startMonth || 5)

    // Build list of months to fetch
    const months = []
    let y = startYear, m = startMonth
    while (y < endYear || (y === endYear && m <= endMonth)) {
      months.push({ y, m })
      m++; if (m > 12) { m = 1; y++ }
    }

    console.log(`[backfill-dob] Fetching ${months.length} months in parallel`)

    // Fetch all months in parallel
    const htmlResults = await Promise.allSettled(
      months.map(({ y, m }) => fetchTeamMonthHtml(cookies, y, m))
    )

    // Collect num_formulario → { fecha_nacimiento, sexo, nif }
    const dobMap = {}
    const monthResults = []

    for (let i = 0; i < months.length; i++) {
      const { y, m } = months[i]
      const label = `${y}-${String(m).padStart(2, '0')}`
      const r = htmlResults[i]
      if (r.status === 'rejected' || !r.value) {
        monthResults.push({ month: label, socios: 0, withDob: 0, error: r.reason?.message || 'null' })
        continue
      }
      const { socios } = parseProductionTable(r.value)
      let withDob = 0
      for (const s of socios) {
        if (!dobMap[s.num_formulario]) {
          dobMap[s.num_formulario] = {
            fecha_nacimiento: s.fecha_nacimiento || null,
            sexo: s.sexo || null,
            nif:  s.nif  || null,
          }
          if (s.fecha_nacimiento) withDob++
        }
      }
      monthResults.push({ month: label, socios: socios.length, withDob })
    }

    const dobEntries = Object.entries(dobMap).filter(([, v]) => v.fecha_nacimiento)
    console.log(`[backfill-dob] Found ${dobEntries.length} socios with DOB across all months`)

    if (dobEntries.length === 0) {
      return res.status(200).json({ ok: true, updated: 0, dobFound: 0, monthResults })
    }

    // Find which socios in our DB are missing fecha_nacimiento
    const allNums = dobEntries.map(([k]) => k)
    const { data: existing } = await supabase
      .from('socios')
      .select('num_formulario, fecha_nacimiento, sexo, nif')
      .in('num_formulario', allNums)

    const needsUpdate = (existing || []).filter(e => !e.fecha_nacimiento)
    console.log(`[backfill-dob] ${needsUpdate.length} socios in DB need DOB update`)

    // Batch upsert in chunks of 100
    let updated = 0
    const CHUNK = 100
    for (let i = 0; i < needsUpdate.length; i += CHUNK) {
      const chunk = needsUpdate.slice(i, i + CHUNK)
      const upsertRows = chunk.map(e => ({
        num_formulario:   e.num_formulario,
        fecha_nacimiento: dobMap[e.num_formulario].fecha_nacimiento,
        sexo: dobMap[e.num_formulario].sexo || e.sexo || null,
        nif:  dobMap[e.num_formulario].nif  || e.nif  || null,
      }))
      const { error } = await supabase
        .from('socios').upsert(upsertRows, { onConflict: 'num_formulario' })
      if (!error) updated += chunk.length
      else console.warn('[backfill-dob] upsert error:', error.message)
    }

    return res.status(200).json({
      ok: true,
      updated,
      dobFound: dobEntries.length,
      dbNeedingUpdate: needsUpdate.length,
      monthResults,
    })

  } catch (err) {
    console.error('[backfill-dob]', err)
    return res.status(500).json({ error: err.message })
  }
}
