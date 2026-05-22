import { db } from '../_lib/db.js'
import { authMiddleware } from '../_lib/jwt.js'
import { loginTopF2F, fetchIndivHtml, discoverTeamUrl, fetchTeamHtml, parseProductionTable } from '../_lib/topf2f.js'

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })

  const supabase = db()
  try {
    const { data: user } = await supabase
      .from('users').select('topf2f_user, topf2f_pass').eq('id', claim.id).single()

    if (!user?.topf2f_user || !user?.topf2f_pass)
      return res.status(400).json({ error: 'No tienes credenciales de topf2f configuradas.' })

    const topf2f_pass = Buffer.from(user.topf2f_pass, 'base64').toString('utf8')
    const cookies  = await loginTopF2F(user.topf2f_user, topf2f_pass)
    const indivHtml = await fetchIndivHtml(cookies)
    const teamUrl   = discoverTeamUrl(indivHtml)

    let html = indivHtml
    if (teamUrl) {
      const teamHtml = await fetchTeamHtml(cookies, teamUrl)
      if (teamHtml) html = teamHtml
    }

    const { socios, debug: parseDebug } = parseProductionTable(html)
    const captadores = [...new Set(
      socios.map(s => s.captador_nombre).filter(Boolean).map(n => n.trim()).filter(Boolean)
    )].sort()

    console.log(`[cap] teamUrl=${teamUrl||'none'} socios=${socios.length} sample=${JSON.stringify(captadores.slice(0,4))}`)

    return res.status(200).json({ captadores, total_socios: socios.length, _debug: parseDebug })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
