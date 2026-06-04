import { authMiddleware } from '../_lib/jwt.js'
import { loginTopF2F, fetchIndivHtml, discoverTeamUrl, fetchAllTeamSocios } from '../_lib/topf2f.js'

// Diagnostic endpoint — returns live topf2f fetch summary (admin only)
// GET /api/debug/topf2f-html
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  const claim = authMiddleware(req)
  if (!claim || claim.role < 90) return res.status(401).json({ error: 'No autorizado' })

  const { data: user } = await (await import('../_lib/db.js')).db()
    .from('users').select('topf2f_user, topf2f_pass').eq('id', claim.id).single()

  if (!user?.topf2f_user) return res.status(400).json({ error: 'Sin credenciales topf2f' })

  try {
    const pass = Buffer.from(user.topf2f_pass, 'base64').toString('utf8')
    const cookies = await loginTopF2F(user.topf2f_user, pass)
    const indivHtml = await fetchIndivHtml(cookies)
    const teamUrl = discoverTeamUrl(indivHtml)

    let teamSocios = null
    if (teamUrl) teamSocios = await fetchAllTeamSocios(cookies)

    return res.status(200).json({
      teamUrl,
      teamSociosCount: teamSocios?.length ?? null,
      hasTeam: !!teamSocios?.length,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
