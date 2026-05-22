import { authMiddleware } from '../_lib/jwt.js'
import { loginTopF2F, fetchIndivHtml, discoverTeamUrl, fetchTeamHtml, commonHeaders, PROD_URL, BASE_URL } from '../_lib/topf2f.js'
import * as cheerio from 'cheerio'

// Temporary diagnostic endpoint — dumps pagination-related HTML fragments
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

    let html = indivHtml
    let source = 'individual'
    if (teamUrl) {
      const teamHtml = await fetchTeamHtml(cookies, teamUrl)
      if (teamHtml) { html = teamHtml; source = 'team' }
    }

    const $ = cheerio.load(html)

    // Extract all <a> links (href + text) — reveals pagination links
    const links = []
    $('a').each((_, a) => {
      const href = $(a).attr('href') || ''
      const text = $(a).text().trim()
      if (href || text) links.push({ text, href })
    })

    // Extract all <form> fields
    const forms = []
    $('form').each((_, f) => {
      const action = $(f).attr('action') || ''
      const method = $(f).attr('method') || 'get'
      const inputs = []
      $(f).find('input, select').each((_, inp) => {
        inputs.push({ name: $(inp).attr('name'), type: $(inp).attr('type'), value: $(inp).attr('value') })
      })
      forms.push({ action, method, inputs })
    })

    // Look for text patterns suggesting pagination
    const bodyText = $('body').text()
    const paginationMatches = [
      ...(bodyText.match(/p[aá]gina[s]?\s*\d+[^]*/gi) || []),
      ...(bodyText.match(/siguiente/gi) || []),
      ...(bodyText.match(/anterior/gi) || []),
      ...(bodyText.match(/\d+\s*de\s*\d+/g) || []),
    ].slice(0, 20)

    // Count table rows
    let tableRows = 0
    $('table tr').each(() => { tableRows++ })

    return res.status(200).json({
      source, teamUrl,
      tableRows,
      paginationMatches,
      links: links.slice(0, 60),  // First 60 links
      forms,
      htmlSnippet: html.slice(html.indexOf('<table'), html.indexOf('<table') + 500),
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
