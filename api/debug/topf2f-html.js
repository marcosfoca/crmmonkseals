import { authMiddleware } from '../_lib/jwt.js'
import { loginTopF2F, fetchIndivHtml, discoverTeamUrl, commonHeaders, TEAM_URL } from '../_lib/topf2f.js'

// Diagnostic: dumps team production page form fields so we know what to POST
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
    const teamUrl = discoverTeamUrl(indivHtml) || TEAM_URL

    // Fetch team page as plain GET (no POST body) — shows the default form with its default values
    const r = await fetch(teamUrl, { headers: commonHeaders(cookies) })
    const html = await r.text()

    // Extract form fields
    const inputs = []
    const inputRe = /<input[^>]+>/gi
    let m
    while ((m = inputRe.exec(html)) !== null) {
      const tag = m[0]
      const name  = (tag.match(/name=['"]([^'"]+)['"]/i) || [])[1]
      const type  = (tag.match(/type=['"]([^'"]+)['"]/i) || [])[1] || 'text'
      const value = (tag.match(/value=['"]([^'"]*)['"]/i) || [])[1]
      if (name) inputs.push({ name, type, value })
    }

    // Extract select fields
    const selects = []
    const selectRe = /<select[^>]+name=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/select>/gi
    while ((m = selectRe.exec(html)) !== null) {
      const name = m[1]
      const inner = m[2]
      const options = []
      const optRe = /<option[^>]*value=['"]([^'"]*)['"]\s*([^>]*)>(.*?)<\/option>/gi
      let o
      while ((o = optRe.exec(inner)) !== null) {
        options.push({ value: o[1], selected: /selected/i.test(o[2]), text: o[3].trim() })
      }
      selects.push({ name, options })
    }

    // Show "Viendo X de Y" counter if present
    const counter = (html.match(/Viendo[^<]{0,60}/i) || [])[0]

    // Show first 2000 chars of body for context
    const bodyStart = html.indexOf('<body')
    const snippet = html.slice(bodyStart > 0 ? bodyStart : 0, (bodyStart > 0 ? bodyStart : 0) + 2000)

    return res.status(200).json({ teamUrl, inputs, selects, counter, snippet })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
