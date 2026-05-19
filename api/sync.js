import { db } from './_lib/db.js'
import { authMiddleware } from './_lib/jwt.js'
import * as cheerio from 'cheerio'

const LOGIN_URL = 'https://comercial.topf2f.com/usuarios/login.php'
const PROD_URL  = 'https://comercial.topf2f.com/comercial_produccion.php'
const BASE_URL  = 'https://comercial.topf2f.com'

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

async function loginTopF2F(topf2f_user, topf2f_pass) {
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

const commonHeaders = (cookies) => ({
  Cookie: cookies,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': BASE_URL + '/'
})

async function fetchProduccion(cookies) {
  const res = await fetch(PROD_URL, {
    method: 'POST',
    headers: { ...commonHeaders(cookies), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      fechainicio: '2020-01-01', fechafin: '2030-12-31',
      filtrofecha: '0', estadobo: '0',
      SI_A: 'Si. Esta es la consulta que quiero hacer.'
    }).toString()
  })
  const html = await res.text()
  if (html.includes('login.php') && !html.includes('Formulario'))
    throw new Error('Sesión topf2f inválida — login no funcionó correctamente')
  return html
}

function parseDate(str) {
  if (!str) return null
  const s = str.trim()
  if (!s || s === '--/--' || s === '—' || s === '--') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  return null
}

// Data rows verified from live DOM: 19 cells
// 0:empty 1:ONG 2:NºFormulario 3:Donante 4:Llamada 5:TipoSocio 6:PDF
// 7:Teléfono 8:NºIntentos 9:Cuota 10:Periodicidad
// 11:FFirma 12:FEntrega 13:FAlta 14:FOkKo 15:OtraFecha 16:Estado 17:ComentCapt 18:ComentCall
function parseProductionTable(html) {
  const $ = cheerio.load(html)
  const socios = []

  let targetTable = null
  $('table').each((_, t) => {
    if ($(t).find('tr').first().text().includes('Formulario') ||
        $(t).find('tr').first().text().includes('Donante')) targetTable = t
  })

  const rows = targetTable ? $(targetTable).find('tr') : $('table tr')

  rows.each((_, row) => {
    const cells = $(row).find('td')
    if (cells.length < 17) return

    const ong      = $(cells[1]).text().trim()
    const numFormul = $(cells[2]).text().trim()
    if (!numFormul || !numFormul.match(/^\d+-\d+$/)) return
    if (!ong || ong === 'ONG') return

    const donante      = $(cells[3]).text().trim()
    const llamada      = $(cells[4]).text().trim().toLowerCase() === 'si'
    const tipoSocio    = $(cells[5]).text().trim()
    const pdfContrato  = $(cells[6]).text().trim().toLowerCase() === 'si'
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

    const parts = donante.trim().split(/\s+/)
    socios.push({
      num_formulario: numFormul,
      ong: ong || null,
      nombre:    parts[0] || '',
      apellido1: parts[1] || '',
      apellido2: parts.slice(2).join(' ') || '',
      llamada, tipo_socio: tipoSocio || null, pdf_contrato: pdfContrato,
      num_intentos_rellamada: intentos, cuota, periodicidad: periodicidad || null,
      fecha_firma: fFirma, fecha_entrega: fEntrega, fecha_alta: fAlta,
      fecha_okko: fOkKo, otra_fecha_cobro: otraFCobro,
      estado: estado || null,
      comentarios_captador: comentCapt || null,
      comentarios_call:     comentCall || null,
    })
  })

  return socios
}

// Try to get numdir (birth date) and sexo from the topf2f form detail page.
// topf2f stores birth date in input[name="numdir"] as DD/MM/YYYY.
// The detail page is cc_fichasnew.php?id=<FORM_ID> — uses the sync's own auth session.
async function fetchFormDetail(cookies, formId) {
  const url = `${BASE_URL}/cc_fichasnew.php?id=${formId}`
  try {
    const res = await fetch(url, {
      headers: commonHeaders(cookies),
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) return null
    const html = await res.text()
    // If redirected to login, this page requires different access
    if (html.includes('login.php') || html.includes('usuarios/login')) return null

    const $ = cheerio.load(html)
    const numdir = $('input[name="numdir"]').val()?.trim() || null
    const sppgas = $('select[name="sppgas"] option[selected]').val()?.trim()
               || $('input[name="sppgas"]:checked').val()?.trim()
               || null
    const sexo = sppgas === '1' ? 'Hombre' : sppgas === '2' ? 'Mujer' : null

    return { fecha_nacimiento: parseDate(numdir), sexo }
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })

  const supabase = db()

  try {
    const { data: user } = await supabase
      .from('users').select('topf2f_user, topf2f_pass').eq('id', claim.id).single()

    if (!user?.topf2f_user || !user?.topf2f_pass)
      return res.status(400).json({ error: 'No tienes credenciales de topf2f configuradas.' })

    const topf2f_pass = Buffer.from(user.topf2f_pass, 'base64').toString('utf8')
    const cookies = await loginTopF2F(user.topf2f_user, topf2f_pass)
    const html    = await fetchProduccion(cookies)
    const socios  = parseProductionTable(html)

    if (socios.length === 0) {
      const tableCount = (html.match(/<table/gi) || []).length
      return res.status(200).json({
        ok: true, new: 0, updated: 0, total: 0,
        debug: html.includes('Formulario')
          ? `Página OK (${tableCount} tablas) — sin filas de socios.`
          : `Posible fallo de sesión (${html.length} chars).`
      })
    }

    // ── 1. Bulk-fetch existing records ──────────────────────────────────────
    const numFormularios = socios.map(s => s.num_formulario)
    const { data: existingRows } = await supabase
      .from('socios')
      .select('num_formulario, fecha_nacimiento, sexo')
      .in('num_formulario', numFormularios)

    const existingMap = {}
    for (const row of existingRows || []) existingMap[row.num_formulario] = row
    const existingNums = new Set(Object.keys(existingMap))

    // ── 2. Try to fetch birth dates from topf2f detail pages ─────────────
    // Only for socios that don't yet have a birth date in our DB.
    // Uses cc_fichasnew.php?id=<FORM_ID> with the sync's own authenticated session.
    // Limit to 5 in parallel per sync call to stay well within the 60s timeout.
    const noDate = socios
      .filter(s => !existingMap[s.num_formulario]?.fecha_nacimiento)
      .slice(0, 5)

    let enriched = 0
    if (noDate.length > 0) {
      await Promise.all(noDate.map(async s => {
        const formId = s.num_formulario.split('-')[1]
        if (!formId) return
        const detail = await fetchFormDetail(cookies, formId)
        if (detail?.fecha_nacimiento) { s.fecha_nacimiento = detail.fecha_nacimiento; enriched++ }
        if (detail?.sexo && !s.sexo)  { s.sexo = detail.sexo }
      }))
    }

    // ── 3. Build records, preserving any existing fecha_nacimiento ────────
    const records = socios.map(s => {
      const ex = existingMap[s.num_formulario]
      return {
        ...s,
        captador_id: claim.id,
        last_sync: new Date().toISOString(),
        fecha_nacimiento: s.fecha_nacimiento || ex?.fecha_nacimiento || null,
        sexo: s.sexo || ex?.sexo || null,
      }
    })

    const newCount     = records.filter(r => !existingNums.has(r.num_formulario)).length
    const updatedCount = records.length - newCount

    // ── 4. Single bulk upsert (replaces N+N individual queries) ──────────
    const { error: upsertErr } = await supabase
      .from('socios')
      .upsert(records, { onConflict: 'num_formulario' })
    if (upsertErr) throw new Error('Upsert error: ' + upsertErr.message)

    const debugParts = []
    if (enriched > 0) debugParts.push(`${enriched} fechas nacimiento`)
    return res.status(200).json({
      ok: true, new: newCount, updated: updatedCount, total: socios.length,
      ...(debugParts.length ? { debug: debugParts.join(' · ') } : {})
    })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
