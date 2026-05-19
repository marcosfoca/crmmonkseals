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
  const res = await fetch(PROD_URL, { headers: commonHeaders(cookies) })
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

// Columns (verified from live page):
// 0:ONG 1:NºFormulario 2:Donante 3:Llamada 4:TipoSocio 5:PDF
// 6:Teléfono 7:NºIntentos 8:Cuota 9:Periodicidad
// 10:FFirma 11:FEntrega 12:FAlta 13:FOkKo 14:OtraFecha
// 15:Estado 16:ComentCaptador 17:ComentCall
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
    if (cells.length < 16) return

    const ong      = $(cells[0]).text().trim()
    const numFormul = $(cells[1]).text().trim()

    if (!numFormul || !numFormul.match(/^\d+-\d+$/)) return
    if (!ong || ong === 'ONG') return

    const donante      = $(cells[2]).text().trim()
    const llamada      = $(cells[3]).text().trim().toLowerCase() === 'si'
    const tipoSocio    = $(cells[4]).text().trim()
    const pdfContrato  = $(cells[5]).text().trim().toLowerCase() === 'si'
    const intentos     = parseInt($(cells[7]).text().trim()) || 0
    const cuota        = parseFloat($(cells[8]).text().trim().replace(',', '.')) || null
    const periodicidad = $(cells[9]).text().trim()
    const fFirma       = parseDate($(cells[10]).text().trim())
    const fEntrega     = parseDate($(cells[11]).text().trim())
    const fAlta        = parseDate($(cells[12]).text().trim())
    const fOkKo        = parseDate($(cells[13]).text().trim())
    const otraFCobro   = parseDate($(cells[14]).text().trim())
    const estado       = $(cells[15]).text().trim()
    const comentCapt   = cells[16] ? $(cells[16]).text().trim() : null
    const comentCall   = cells[17] ? $(cells[17]).text().trim() : null

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
    })
  })

  return socios
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

    let newCount = 0, updatedCount = 0

    for (const s of socios) {
      const record = { ...s, captador_id: claim.id, last_sync: new Date().toISOString() }
      const { data: existing } = await supabase
        .from('socios').select('id').eq('num_formulario', s.num_formulario).single()

      if (existing) {
        await supabase.from('socios').update(record).eq('id', existing.id)
        updatedCount++
      } else {
        await supabase.from('socios').insert(record)
        newCount++
      }
    }

    return res.status(200).json({ ok: true, new: newCount, updated: updatedCount, total: socios.length })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
