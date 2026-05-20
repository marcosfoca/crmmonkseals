import * as cheerio from 'cheerio'

export const LOGIN_URL = 'https://comercial.topf2f.com/usuarios/login.php'
export const PROD_URL  = 'https://comercial.topf2f.com/comercial_produccion.php'
export const BASE_URL  = 'https://comercial.topf2f.com'

const PROD_BODY = new URLSearchParams({
  fechainicio: '2020-01-01', fechafin: '2030-12-31',
  filtrofecha: '0', estadobo: '0',
  SI_A: 'Si. Esta es la consulta que quiero hacer.'
}).toString()

function extractCookieString(res) {
  try {
    if (typeof res.headers.getSetCookie === 'function') {
      const cookies = res.headers.getSetCookie()
      if (cookies.length > 0)
        return cookies.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ')
    }
  } catch {}
  const raw = res.headers.get('set-cookie') || ''
  if (!raw) return ''
  return raw.split(/,\s*(?=[A-Za-z_])/).map(c => c.split(';')[0].trim()).filter(Boolean).join('; ')
}

export async function loginTopF2F(topf2f_user, topf2f_pass) {
  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ user: topf2f_user, pass: topf2f_pass, Submit: 'Entrar' }).toString(),
    redirect: 'manual'
  })
  const cookieString = extractCookieString(res)
  if (!cookieString) throw new Error('Login fallido en topf2f: sin cookie de sesión')
  return cookieString
}

export const commonHeaders = (cookies) => ({
  Cookie: cookies,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': BASE_URL + '/'
})

export function parseDate(str) {
  if (!str) return null
  const s = str.trim()
  if (!s || s === '--/--' || s === '—' || s === '--') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  return null
}

// Fetch individual production page HTML (always uses POST with date range params)
export async function fetchIndivHtml(cookies) {
  const res = await fetch(PROD_URL, {
    method: 'POST',
    headers: { ...commonHeaders(cookies), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: PROD_BODY
  })
  const html = await res.text()
  if (html.includes('login.php') && !html.includes('Formulario'))
    throw new Error('Sesión topf2f inválida — login no funcionó correctamente')
  return html
}

// Scan navigation links in production HTML to find the "Producción de equipo" URL
export function discoverTeamUrl(html) {
  const $ = cheerio.load(html)
  let teamUrl = null
  $('a').each((_, a) => {
    const href = $(a).attr('href') || ''
    const text = $(a).text().trim().toLowerCase()
    if (!teamUrl && (text.includes('equipo') || href.toLowerCase().includes('equipo'))) {
      teamUrl = href.startsWith('http') ? href : BASE_URL + '/' + href.replace(/^\//, '')
    }
  })
  return teamUrl
}

// Fetch team production HTML — tries GET first, then POST with same params
export async function fetchTeamHtml(cookies, teamUrl) {
  const isLoggedOut = (h) => h.includes('login.php') || h.includes('usuarios/login')
  try {
    const r = await fetch(teamUrl, { headers: commonHeaders(cookies) })
    if (r.ok) {
      const h = await r.text()
      if (!isLoggedOut(h)) return h
    }
  } catch {}
  try {
    const r = await fetch(teamUrl, {
      method: 'POST',
      headers: { ...commonHeaders(cookies), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: PROD_BODY
    })
    if (r.ok) {
      const h = await r.text()
      if (!isLoggedOut(h)) return h
    }
  } catch {}
  return null
}

// Build column index map from header row text (all lowercase+trimmed)
function buildColMap(texts) {
  const t = texts.map(s => s.toLowerCase().trim())
  const col = {}

  t.forEach((v, i) => {
    if (v.includes('formulario'))                           col.numFormulario    = i
    if (v === 'ong')                                        col.ong              = i
    if (v.includes('donante'))                              col.donante          = i
    if (v.includes('llamada'))                              col.llamada          = i
    if (v.includes('tipo') && v.includes('soc'))            col.tipoSocio        = i
    if (v === 'pdf')                                        col.pdf              = i
    if (v.startsWith('tel') || v.startsWith('tfno') || v.startsWith('móvil') || v.startsWith('movil') || v.startsWith('tlf'))
                                                            col.telefono         = i
    if (v.includes('intent'))                               col.intentos         = i
    if (v.includes('cuota') && !v.includes('otra'))         col.cuota            = i
    if (v.includes('period'))                               col.periodicidad     = i
    if (v.includes('firma') && !v.includes('entrega'))      col.fFirma           = i
    if (v.includes('entrega'))                              col.fEntrega         = i
    if (v.includes('alta'))                                 col.fAlta            = i
    if (v.includes('ok') && v.includes('ko'))               col.fOkKo            = i
    if (v.includes('otra') && v.includes('fecha'))          col.otraFecha        = i
    if (v.includes('estado'))                               col.estado           = i
    if (v.includes('captador'))                             col.captador         = i
    if (v.includes('nif') || v === 'dni' || v.includes('dni/') || (v.includes('doc') && !v.includes('donante')))
                                                            col.nif              = i
    if (v.includes('nac') || (v.includes('fecha') && v.includes('nac')))
                                                            col.fechaNacimiento  = i
    if (v.includes('sexo') || v === 'm/h' || v === 'h/m')  col.sexo             = i
  })

  // Comentarios: first two columns with "coment"
  const cIdx = t.map((v, i) => v.includes('coment') ? i : -1).filter(x => x >= 0)
  if (cIdx[0] !== undefined) col.comentCapt = cIdx[0]
  if (cIdx[1] !== undefined) col.comentCall  = cIdx[1]

  return col
}

function cell($, cells, idx) {
  if (idx === undefined || !cells[idx]) return ''
  return $(cells[idx]).text().trim()
}

// Dynamic column-aware parser. Returns array of socios with captador_nombre when available.
export function parseProductionTable(html) {
  const $ = cheerio.load(html)
  const socios = []

  let targetTable = null
  $('table').each((_, t) => {
    const firstRow = $(t).find('tr').first().text()
    if (firstRow.includes('Formulario') || firstRow.includes('Donante')) targetTable = t
  })

  const rows = targetTable ? $(targetTable).find('tr') : $('table tr')
  let colMap = null
  let loggedSample = false

  rows.each((_, row) => {
    const cells = $(row).find('td, th')
    if (cells.length < 5) return

    const texts = cells.map((_, c) => $(c).text().trim()).get()

    // Detect header row
    if (!colMap && texts.some(t => /formulario/i.test(t) || /donante/i.test(t))) {
      colMap = buildColMap(texts)
      console.log(`[hdr] ${texts.join('|')}`)
      console.log(`[col] cap=${colMap.captador} nif=${colMap.nif} nac=${colMap.fechaNacimiento}`)
      return
    }
    if (!colMap) return

    const numFormulario = cell($, cells, colMap.numFormulario)
    if (!numFormulario || !/^\d+-\d+$/.test(numFormulario)) return

    const ong = cell($, cells, colMap.ong)
    if (!ong || ong.toUpperCase() === 'ONG') return

    if (!loggedSample) {
      loggedSample = true
      console.log(`[parse] first-data-row="${texts.slice(0,10).join('|')}"`)
    }

    const donante        = cell($, cells, colMap.donante)
    const captadorNombre = colMap.captador !== undefined ? cell($, cells, colMap.captador) || null : null
    const nif            = colMap.nif !== undefined ? cell($, cells, colMap.nif) || null : null
    const fechaNacRaw    = colMap.fechaNacimiento !== undefined ? cell($, cells, colMap.fechaNacimiento) : null
    const sexoRaw        = colMap.sexo !== undefined ? cell($, cells, colMap.sexo) : null

    const llamada        = cell($, cells, colMap.llamada).toLowerCase() === 'si'
    const tipoSocio      = cell($, cells, colMap.tipoSocio) || null
    const pdfContrato    = cell($, cells, colMap.pdf).toLowerCase() === 'si'
    const intentos       = parseInt(cell($, cells, colMap.intentos)) || 0
    const cuota          = parseFloat(cell($, cells, colMap.cuota).replace(',', '.')) || null
    const periodicidad   = cell($, cells, colMap.periodicidad) || null
    const fFirma         = parseDate(cell($, cells, colMap.fFirma))
    const fEntrega       = parseDate(cell($, cells, colMap.fEntrega))
    const fAlta          = parseDate(cell($, cells, colMap.fAlta))
    const fOkKo          = parseDate(cell($, cells, colMap.fOkKo))
    const otraFCobro     = parseDate(cell($, cells, colMap.otraFecha))
    const estado         = cell($, cells, colMap.estado) || null
    const comentCapt     = cell($, cells, colMap.comentCapt) || null
    const comentCall     = cell($, cells, colMap.comentCall) || null

    // Normalise sexo
    let sexo = null
    if (sexoRaw) {
      const s = sexoRaw.toLowerCase()
      if (s === 'h' || s === 'hombre' || s === 'm' || s === 'masculino') sexo = 'Hombre'
      else if (s === 'f' || s === 'mujer' || s === 'femenino') sexo = 'Mujer'
    }

    const parts = donante.split(/\s+/)
    socios.push({
      num_formulario: numFormulario,
      captador_nombre: captadorNombre,
      ong: ong || null,
      nif: nif || null,
      fecha_nacimiento: parseDate(fechaNacRaw),
      sexo,
      nombre:    parts[0] || '',
      apellido1: parts[1] || '',
      apellido2: parts.slice(2).join(' ') || '',
      llamada, tipo_socio: tipoSocio, pdf_contrato: pdfContrato,
      num_intentos_rellamada: intentos, cuota, periodicidad,
      fecha_firma: fFirma, fecha_entrega: fEntrega, fecha_alta: fAlta,
      fecha_okko: fOkKo, otra_fecha_cobro: otraFCobro,
      estado,
      comentarios_captador: comentCapt,
      comentarios_call:     comentCall,
    })
  })

  return socios
}
