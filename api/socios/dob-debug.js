import { authMiddleware } from '../_lib/jwt.js'
import { loginTopF2F, fetchIndivHtml, discoverTeamUrl, commonHeaders, parseProductionTable } from '../_lib/topf2f.js'
import { db } from '../_lib/db.js'

const BASE_BODY = {
  fechainicio: '2020-01-01', fechafin: '2030-12-31',
  filtrofecha: '0',
  SI_A: 'Si. Esta es la consulta que quiero hacer.'
}

async function fetchAndCount(url, extraParams, cookies) {
  const body = new URLSearchParams({ ...BASE_BODY, ...extraParams }).toString()
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { ...commonHeaders(cookies), 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!r.ok) return { error: `HTTP ${r.status}`, socios: 0 }
    const html = await r.text()
    if (html.includes('login.php') || html.includes('usuarios/login')) return { error: 'session_expired', socios: 0 }
    const { socios } = parseProductionTable(html)
    const withDob = socios.filter(s => s.fecha_nacimiento).length
    return { socios: socios.length, with_dob: withDob }
  } catch (e) {
    return { error: e.message, socios: 0 }
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })

  const supabase = db()
  try {
    const { data: user } = await supabase
      .from('users').select('topf2f_user, topf2f_pass').eq('id', claim.id).single()
    if (!user?.topf2f_user) return res.status(400).json({ error: 'Sin credenciales topf2f' })

    const pass    = Buffer.from(user.topf2f_pass, 'base64').toString('utf8')
    const cookies = await loginTopF2F(user.topf2f_user, pass)
    const indivHtml = await fetchIndivHtml(cookies)
    const teamUrl   = discoverTeamUrl(indivHtml)

    if (!teamUrl) return res.status(200).json({ error: 'No se encontró URL de equipo' })

    // Try different estadobo values to find which returns all socios
    const variants = [
      { estadobo: '0' },
      { estadobo: '' },
      { estadobo: 'TODOS' },
      { estadobo: 'todos' },
      { estadobo: '1' },
      { estadobo: '2' },
      {},  // no estadobo at all
    ]

    const results = []
    for (const v of variants) {
      const r = await fetchAndCount(teamUrl, v, cookies)
      results.push({ params: v, ...r })
    }

    return res.status(200).json({ teamUrl, results })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
