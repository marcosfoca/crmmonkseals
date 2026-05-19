import { db } from './_lib/db.js'
import { authMiddleware } from './_lib/jwt.js'
import * as cheerio from 'cheerio'

const LOGIN_URL = 'https://comercial.topf2f.com/usuarios/login.php'
const PROD_URL  = 'https://comercial.topf2f.com/comercial_produccion.php'

// Extract only name=value cookie pairs from Set-Cookie response headers.
// Stripping metadata (path, HttpOnly, etc.) prevents corruption when
// there are multiple Set-Cookie headers joined into one string.
function extractCookieString(res) {
  try {
    if (typeof res.headers.getSetCookie === 'function') {
      const cookies = res.headers.getSetCookie()
      if (cookies.length > 0) {
        return cookies.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ')
      }
    }
  } catch {}
  const raw = res.headers.get('set-cookie') || ''
  if (!raw) return ''
  // Split on comma that precedes a new cookie name, then strip metadata
  return raw.split(/,\s*(?=[A-Za-z_])/).map(c => c.split(';')[0].trim()).filter(Boolean).join('; ')
}

async function loginTopF2F(topf2f_user, topf2f_pass) {
  const formData = new URLSearchParams({
    user:   topf2f_user,
    pass:   topf2f_pass,
    Submit: 'Entrar'
  })
  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
    redirect: 'manual'
  })

  const cookieString = extractCookieString(res)
  if (!cookieString) throw new Error('Login fallido en topf2f: sin cookie de sesión')

  const location = res.headers.get('location') || ''
  if (res.status !== 302 && !location.includes('index')) {
    const body = await res.text().catch(() => '')
    if (body.toLowerCase().includes('incorrecto') || body.toLowerCase().includes('error')) {
      throw new Error('Credenciales topf2f incorrectas')
    }
  }
  return cookieString
}

const commonHeaders = (cookies) => ({
  Cookie: cookies,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://comercial.topf2f.com/'
})

async function fetchProduccion(cookies) {
  // The page requires POST with date range — GET only returns the empty form.
  // We use a wide range to capture all historical socios.
  const body = new URLSearchParams({
    fechainicio: '2020-01-01',
    fechafin:    '2030-12-31',
    filtrofecha: '0',
    estadobo:    '0',
    SI_A:        'Si. Esta es la consulta que quiero hacer.'
  })

  const res = await fetch(PROD_URL, {
    method: 'POST',
    headers: {
      ...commonHeaders(cookies),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  })
  const html = await res.text()

  if (html.includes('login.php') && !html.includes('Formulario')) {
    throw new Error('Sesión topf2f inválida — login no funcionó correctamente')
  }
  return html
}

// Parse Spanish dd/mm/yyyy → ISO yyyy-mm-dd
function parseDate(str) {
  if (!str) return null
  const s = str.trim()
  if (!s || s === '--/--' || s === '—' || s === '--') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  return null
}

// Data rows have 19 cells (verified from live page DOM inspection):
// 0:(empty/checkbox) 1:ONG 2:NºFormulario 3:Donante 4:Llamada 5:TipoSocio 6:PDF
// 7:Teléfono(extra,not in header) 8:NºIntentos 9:Cuota 10:Periodicidad
// 11:FFirma 12:FEntrega 13:FAlta 14:FOkKo 15:OtraFecha
// 16:Estado 17:ComentCaptador 18:ComentCall
function parseProductionTable(html) {
  const $ = cheerio.load(html)
  const socios = []

  let targetTable = null
  $('table').each((_, table) => {
    const headerRow = $(table).find('tr').first().text()
    if (headerRow.includes('Formulario') || headerRow.includes('Donante')) {
      targetTable = table
    }
  })

  const rows = targetTable ? $(targetTable).find('tr') : $('table tr')

  rows.each((_, row) => {
    const cells = $(row).find('td')
    if (cells.length < 17) return

    const ong      = $(cells[1]).text().trim()
    const numFormul = $(cells[2]).text().trim()

    if (!numFormul || !numFormul.match(/^\d+-\d+$/)) return
    if (!ong || ong === 'ONG') return

    // Capture any detail-page link present in the row (usually on form number or name)
    let detailHref = null
    for (let i = 0; i < Math.min(cells.length, 8); i++) {
      const href = $(cells[i]).find('a[href]').attr('href')
      if (href && !href.startsWith('#') && !href.startsWith('javascript')) {
        detailHref = href
        break
      }
    }

    const donante      = $(cells[3]).text().trim()
    const llamada      = $(cells[4]).text().trim().toLowerCase() === 'si'
    const tipoSocio    = $(cells[5]).text().trim()
    const pdfContrato  = $(cells[6]).text().trim().toLowerCase() === 'si'
    // cells[7] = teléfono (not stored)
    const intentos     = parseInt($(cells[8]).text().trim()) || 0
    const cuota        = parseFloat($(cells[9]).text().trim().replace(',', '.')) || null
    const periodicidad = $(cells[10]).text().trim()
    const fFirma       = parseDate($(cells[11]).text().trim())
    const fEntrega     = parseDate($(cells[12]).text().trim())
    const fAlta        = parseDate($(cells[13]).text().trim())
    const fOkKo        = parseDate($(cells[14]).text().trim())
    const otraFCobro   = parseDate($(cells[15]).text().trim())
    const estado       = $(cells[16]).text().trim()
    const comentCapt   = cells[17] ? $(cells[17]).text().trim() : null
    const comentCall   = cells[18] ? $(cells[18]).text().trim() : null

    const parts     = donante.trim().split(/\s+/)
    const nombre    = parts[0] || ''
    const apellido1 = parts[1] || ''
    const apellido2 = parts.slice(2).join(' ') || ''

    socios.push({
      num_formulario: numFormul,
      ong:   ong || null,
      nombre, apellido1, apellido2,
      llamada,
      tipo_socio:             tipoSocio || null,
      pdf_contrato:           pdfContrato,
      num_intentos_rellamada: intentos,
      cuota,
      periodicidad:           periodicidad || null,
      fecha_firma:     fFirma,
      fecha_entrega:   fEntrega,
      fecha_alta:      fAlta,
      fecha_okko:      fOkKo,
      otra_fecha_cobro: otraFCobro,
      estado:              estado || null,
      comentarios_captador: comentCapt || null,
      comentarios_call:     comentCall || null,
      _detailHref:          detailHref,
    })
  })

  return socios
}

const BASE_URL = 'https://comercial.topf2f.com'

// Fetch a form detail page and extract numdir (birth date) and sexo.
// topf2f stores birth date in input[name="numdir"] as DD/MM/YYYY.
async function fetchFormDetail(cookies, href) {
  const url = href.startsWith('http') ? href : BASE_URL + '/' + href.replace(/^\//, '')
  const res = await fetch(url, { headers: commonHeaders(cookies), signal: AbortSignal.timeout(8000) })
  if (!res.ok) return null
  const html = await res.text()
  const $ = cheerio.load(html)

  // input[name="numdir"] holds birth date (DD/MM/YYYY)
  const numdir = $('input[name="numdir"]').val()?.trim() || null

  // sppgas: "1"=hombre "2"=mujer
  const sppgasVal = $('select[name="sppgas"] option[selected]').val()?.trim()
    || $('input[name="sppgas"]:checked').val()?.trim()
    || null
  const sexo = sppgasVal === '1' ? 'Hombre' : sppgasVal === '2' ? 'Mujer' : null

  return { fecha_nacimiento: parseDate(numdir), sexo }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })

  const supabase = db()

  try {
    const { data: user } = await supabase
      .from('users')
      .select('topf2f_user, topf2f_pass, id')
      .eq('id', claim.id)
      .single()

    if (!user?.topf2f_user || !user?.topf2f_pass) {
      return res.status(400).json({
        error: 'No tienes credenciales de topf2f configuradas. Ve a Admin → edita tu usuario y añade el usuario y contraseña de topf2f.'
      })
    }

    const topf2f_pass = Buffer.from(user.topf2f_pass, 'base64').toString('utf8')
    const cookies = await loginTopF2F(user.topf2f_user, topf2f_pass)
    const html    = await fetchProduccion(cookies)
    const socios  = parseProductionTable(html)

    if (socios.length === 0) {
      const hasTable   = html.includes('Formulario')
      const tableCount = (html.match(/<table/gi) || []).length
      return res.status(200).json({
        ok: true, new: 0, updated: 0, total: 0,
        debug: hasTable
          ? `Página cargada OK (${tableCount} tablas, ${html.length} chars) — sin filas de socios en la vista actual. La web puede estar filtrando solo el mes en curso.`
          : `Posible fallo de sesión — la página no contiene tabla de producción (${html.length} chars).`
      })
    }

    // For socios that have a detail link and no birth date in the list page,
    // fetch the form detail page (up to 30 at a time, 5 in parallel) to get
    // numdir (fecha_nacimiento) and sexo — fields not present in the production table.
    const needsDetail = socios.filter(s => s._detailHref)
    if (needsDetail.length > 0) {
      const BATCH = 5, MAX = 30
      const toFetch = needsDetail.slice(0, MAX)
      for (let i = 0; i < toFetch.length; i += BATCH) {
        const batch = toFetch.slice(i, i + BATCH)
        await Promise.all(batch.map(async s => {
          try {
            const extra = await fetchFormDetail(cookies, s._detailHref)
            if (extra?.fecha_nacimiento) s.fecha_nacimiento = extra.fecha_nacimiento
            if (extra?.sexo) s.sexo = extra.sexo
          } catch {}
        }))
      }
    }

    let newCount = 0, updatedCount = 0

    for (const s of socios) {
      const { _detailHref, ...rest } = s
      const record = { ...rest, captador_id: claim.id, last_sync: new Date().toISOString() }
      const { data: existing } = await supabase
        .from('socios').select('id, fecha_nacimiento').eq('num_formulario', s.num_formulario).single()

      if (existing) {
        // Preserve existing fecha_nacimiento if we couldn't fetch a new one
        if (!record.fecha_nacimiento && existing.fecha_nacimiento)
          record.fecha_nacimiento = existing.fecha_nacimiento
        await supabase.from('socios').update(record).eq('id', existing.id)
        updatedCount++
      } else {
        await supabase.from('socios').insert(record)
        newCount++
      }
    }

    const detailNote = needsDetail.length > 0
      ? ` · ${Math.min(needsDetail.length, 30)} detalles con f. nacimiento`
      : ''
    return res.status(200).json({ ok: true, new: newCount, updated: updatedCount, total: socios.length, debug: detailNote || undefined })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
