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

// Fetch team production HTML — always uses POST with date params (like the individual page)
export async function fetchTeamHtml(cookies, teamUrl) {
  const isLoggedOut = (h) => h.includes('login.php') || h.includes('usuarios/login')
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

  // Track captador-related columns separately to resolve ambiguity
  let captadorNifIdx = undefined  // "nif captador", "dni captador" → contains document number
  let captadorNombreIdx = undefined  // "nombre captador", plain "captador" (non-doc) → contains name

  t.forEach((v, i) => {
    if (v.includes('formulario'))                              col.numFormulario   = i
    if (v === 'ong' || v === 'entidad' || v === 'organización') col.ong           = i
    if (v.includes('donante'))                                 col.donante         = i
    // Exact match for "llamada" to avoid overwrite by "Estado llamada"
    if (v === 'llamada')                                       col.llamada         = i
    if (v.includes('tipo') && v.includes('soc'))               col.tipoSocio       = i
    if (v.includes('pdf'))                                     col.pdf             = i
    if (v.startsWith('tel') || v.startsWith('tfno') || v.startsWith('móvil') || v.startsWith('movil') || v.startsWith('tlf'))
                                                               col.telefono        = i
    if (v.includes('intent'))                                  col.intentos        = i
    if (v.includes('cuota') && !v.includes('otra'))            col.cuota           = i
    if (v.includes('period'))                                  col.periodicidad    = i
    if (v.includes('firma') && !v.includes('entrega'))         col.fFirma          = i
    if (v.includes('entrega'))                                 col.fEntrega        = i
    if (v.includes('alta') && !v.includes('otra'))             col.fAlta           = i
    if (v.includes('ok') && v.includes('ko'))                  col.fOkKo           = i
    // "Otra F. cobro..." — requires 'otra', 'f.' shorthand, no 'fecha' needed
    if (v.startsWith('otra'))                                  col.otraFecha       = i
    // Exact "estado" avoids matching "Estado llamada"
    if (v === 'estado')                                        col.estado          = i
    if (v.includes('nif') || v === 'dni' || v.includes('dni/') || (v.includes('doc') && !v.includes('donante')))
                                                               col.nif             = i
    if (v.includes('nac') || (v.includes('fecha') && v.includes('nac')))
                                                               col.fechaNacimiento = i
    if (v.includes('sexo') || v === 'm/h' || v === 'h/m')     col.sexo            = i

    // Captador: distinguish NIF-captador columns from name-captador columns
    if (v.includes('captador') || v.includes('comercial') || v.includes('agente') || v.includes('promotor')) {
      const isDoc = v.includes('nif') || v.includes('dni') || v.includes('doc') || v.includes('cif')
      if (isDoc) captadorNifIdx = i
      else captadorNombreIdx = i
    }
  })

  // Prefer name column over NIF column for captador matching
  col.captador = captadorNombreIdx !== undefined ? captadorNombreIdx : captadorNifIdx

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

// Dynamic column-aware parser. Returns { socios, debug } where debug has headers and colMap.
export function parseProductionTable(html) {
  const $ = cheerio.load(html)
  const socios = []
  let debugInfo = { headers: [], colMap: {} }

  let targetTable = null
  $('table').each((_, t) => {
    const firstRow = $(t).find('tr').first().text()
    if (firstRow.includes('Formulario') || firstRow.includes('Donante')) targetTable = t
  })

  const rows = targetTable ? $(targetTable).find('tr') : $('table tr')
  let colMap = null
  let loggedSample = false
  let colOffset = null  // null = not yet detected; accounts for leading checkbox column in data rows

  rows.each((_, row) => {
    const cells = $(row).find('td, th')
    if (cells.length < 5) return

    const texts = cells.map((_, c) => $(c).text().trim()).get()

    // Detect header row
    if (!colMap && texts.some(t => /formulario/i.test(t) || /donante/i.test(t))) {
      colMap = buildColMap(texts)
      debugInfo = { headers: texts, colMap }
      console.log(`[hdr] ${texts.join('|')}`)
      console.log(`[col] cap=${colMap.captador} nif=${colMap.nif} nac=${colMap.fechaNacimiento}`)
      return
    }
    if (!colMap) return

    // Auto-detect leading-column offset (data rows sometimes have an extra leading checkbox cell)
    if (colOffset === null) {
      const n0 = cell($, cells, colMap.numFormulario)
      if (n0 && /^\d+/.test(n0)) {
        colOffset = 0
      } else {
        const n1 = cell($, cells, colMap.numFormulario + 1)
        colOffset = (n1 && /^\d+/.test(n1)) ? 1 : 0
        if (colOffset) console.log('[offset] +1 leading column detected in data rows')
      }
    }

    // Helper: get cell value using header-derived index + detected offset
    const c = (idx) => idx !== undefined ? cell($, cells, idx + colOffset) : ''

    const numFormulario = c(colMap.numFormulario)
    if (!numFormulario || !/^\d+/.test(numFormulario)) return

    const ong = c(colMap.ong)
    if (!ong || ong.toUpperCase() === 'ONG') return

    const donante        = c(colMap.donante)
    const captadorNombre = colMap.captador !== undefined ? c(colMap.captador) || null : null
    const nif            = colMap.nif !== undefined ? c(colMap.nif) || null : null
    const fechaNacRaw    = colMap.fechaNacimiento !== undefined ? c(colMap.fechaNacimiento) : null

    if (!loggedSample) {
      loggedSample = true
      console.log(`[row0] off=${colOffset} num=${numFormulario} ong=${ong} don=${donante} nac="${fechaNacRaw}" cap="${captadorNombre}" nif="${nif}"`)
    }
    const sexoRaw        = colMap.sexo !== undefined ? c(colMap.sexo) : null

    const llamada        = c(colMap.llamada).toLowerCase() === 'si'
    const tipoSocio      = c(colMap.tipoSocio) || null
    const pdfContrato    = c(colMap.pdf).toLowerCase() === 'si'
    const intentos       = parseInt(c(colMap.intentos)) || 0
    const cuota          = parseFloat(c(colMap.cuota).replace(',', '.')) || null
    const periodicidad   = c(colMap.periodicidad) || null
    const fFirma         = parseDate(c(colMap.fFirma))
    const fEntrega       = parseDate(c(colMap.fEntrega))
    const fAlta          = parseDate(c(colMap.fAlta))
    const fOkKo          = parseDate(c(colMap.fOkKo))
    const otraFCobro     = parseDate(c(colMap.otraFecha))
    const estado         = c(colMap.estado) || null
    const comentCapt     = c(colMap.comentCapt) || null
    const comentCall     = c(colMap.comentCall) || null

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

  return { socios, debug: debugInfo }
}
