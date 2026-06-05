import { db } from './_lib/db.js'
import { authMiddleware } from './_lib/jwt.js'
import { loginTopF2F, fetchIndivHtml, discoverTeamUrl, fetchAllTeamSocios, TEAM_URL } from './_lib/topf2f.js'

export const config = { maxDuration: 120 }

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const claim = authMiddleware(req)
  if (!claim || claim.role < 90) return res.status(401).json({ error: 'No autorizado' })

  const supabase = db()

  try {
    // Get ALL users with topf2f credentials — each root user has their own team production
    const { data: accounts } = await supabase
      .from('users')
      .select('id, topf2f_user, topf2f_pass')
      .not('topf2f_user', 'is', null)
      .not('topf2f_pass', 'is', null)

    if (!accounts?.length) return res.status(400).json({ error: 'Sin credenciales topf2f configuradas.' })

    console.log(`[backfill-dob] syncing ${accounts.length} account(s)`)

    // Login to all accounts in parallel, then fetch each team's full production
    const sociosResults = await Promise.allSettled(
      accounts.map(async a => {
        const pass = Buffer.from(a.topf2f_pass, 'base64').toString('utf8')
        const cookies = await loginTopF2F(a.topf2f_user, pass)
        // Discover the real team URL (may contain ?equipo=X for scoped accounts)
        const indivHtml = await fetchIndivHtml(cookies)
        const teamUrl = discoverTeamUrl(indivHtml) || TEAM_URL
        return fetchAllTeamSocios(cookies, '2024-01-01', '2026-12-31', teamUrl)
      })
    )

    // Collect num_formulario → { fecha_nacimiento, sexo, nif } across all accounts
    const dobMap = {}
    const accountResults = []

    for (let i = 0; i < accounts.length; i++) {
      const a = accounts[i]
      const r = sociosResults[i]
      if (r.status === 'rejected' || !r.value) {
        accountResults.push({ user: a.topf2f_user, socios: 0, withDob: 0, error: r.reason?.message || 'null' })
        continue
      }
      const socios = r.value
      let withDob = 0
      for (const s of socios) {
        if (!dobMap[s.num_formulario]) {
          dobMap[s.num_formulario] = {
            fecha_nacimiento: s.fecha_nacimiento || null,
            sexo: s.sexo || null,
            nif:  s.nif  || null,
          }
        } else {
          // Merge: non-null wins
          if (s.fecha_nacimiento) dobMap[s.num_formulario].fecha_nacimiento = s.fecha_nacimiento
          if (s.sexo) dobMap[s.num_formulario].sexo = s.sexo
          if (s.nif)  dobMap[s.num_formulario].nif  = s.nif
        }
        if (dobMap[s.num_formulario].fecha_nacimiento) withDob++
      }
      accountResults.push({ user: a.topf2f_user, socios: socios.length, withDob })
    }

    const dobEntries = Object.entries(dobMap).filter(([, v]) => v.fecha_nacimiento)
    console.log(`[backfill-dob] ${dobEntries.length} socios with DOB across ${accounts.length} accounts`)

    if (dobEntries.length === 0) {
      return res.status(200).json({ ok: true, updated: 0, dobFound: 0, accountResults })
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
      accountResults,
    })

  } catch (err) {
    console.error('[backfill-dob]', err)
    return res.status(500).json({ error: err.message })
  }
}
