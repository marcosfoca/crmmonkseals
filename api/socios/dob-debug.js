import { db } from '../_lib/db.js'
import { authMiddleware } from '../_lib/jwt.js'
import { loginTopF2F, fetchIndivHtml, discoverTeamUrl, fetchTeamHtml, parseProductionTable } from '../_lib/topf2f.js'
import * as cheerio from 'cheerio'

// Raw peek at the table: returns headers + first 8 data rows without any column mapping
function rawPeek(html) {
  const $ = cheerio.load(html)
  let targetTable = null
  $('table').each((_, t) => {
    const firstRow = $(t).find('tr').first().text()
    if (firstRow.includes('Formulario') || firstRow.includes('Donante')) targetTable = t
  })
  const rows = targetTable ? $(targetTable).find('tr') : $('table tr')
  const result = { headers: null, rows: [] }
  rows.each((_, row) => {
    const cells = $(row).find('td, th')
    if (cells.length < 5) return
    const texts = cells.map((_, c) => $(c).text().trim()).get()
    if (!result.headers && texts.some(t => /formulario/i.test(t) || /donante/i.test(t))) {
      result.headers = texts
      return
    }
    if (!result.headers) return
    if (result.rows.length < 8) result.rows.push(texts)
  })
  return result
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

    const topf2f_pass = Buffer.from(user.topf2f_pass, 'base64').toString('utf8')
    const cookies   = await loginTopF2F(user.topf2f_user, topf2f_pass)
    const indivHtml = await fetchIndivHtml(cookies)
    const teamUrl   = discoverTeamUrl(indivHtml)

    let html = indivHtml
    let source = 'individual'
    if (teamUrl) {
      const teamHtml = await fetchTeamHtml(cookies, teamUrl)
      if (teamHtml) { html = teamHtml; source = 'equipo' }
    }

    const peek = rawPeek(html)
    const { socios } = parseProductionTable(html)

    // Sample: first 8 socios with their parsed fecha_nacimiento + raw cell at fechaNac index
    const sample = socios.slice(0, 8).map(s => ({
      num: s.num_formulario,
      donante: s.nombre,
      fecha_nacimiento_parsed: s.fecha_nacimiento,
      fecha_firma_parsed: s.fecha_firma,
    }))

    const nullCount = socios.filter(s => !s.fecha_nacimiento).length
    const hasCount  = socios.filter(s => s.fecha_nacimiento).length

    return res.status(200).json({
      source,
      teamUrl,
      total_parsed: socios.length,
      con_fecha_nacimiento: hasCount,
      sin_fecha_nacimiento: nullCount,
      raw_headers: peek.headers,
      raw_rows_sample: peek.rows,
      parsed_sample: sample,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
