import { db } from './_lib/db.js'
import { authMiddleware } from './_lib/jwt.js'
import * as cheerio from 'cheerio'

const LOGIN_URL = 'https://comercial.topf2f.com/usuarios/login.php'
const PROD_URL  = 'https://comercial.topf2f.com/comercial_produccion.php'

async function loginTopF2F(topf2f_user, topf2f_pass) {
  const formData = new URLSearchParams({
    usuario: topf2f_user,
    password: topf2f_pass,
    entrar: '1'
  })
  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
    redirect: 'manual'
  })
  const cookies = res.headers.get('set-cookie') || ''
  if (!cookies) throw new Error('Login fallido: no se recibió sesión')
  return cookies
}

async function fetchProduccion(cookies, desde, hasta) {
  const params = new URLSearchParams({
    fecha1: desde || formatDate(startOfMonth()),
    fecha2: hasta || formatDate(new Date()),
    estado: '0',
    orden: 'fecha_alta',
    sentido: 'DESC',
    consultar: 'Si. Esta es la consulta que quiero hacer.'
  })
  const res = await fetch(`${PROD_URL}?${params}`, {
    headers: { Cookie: cookies }
  })
  return res.text()
}

function formatDate(d) {
  return d.toISOString().split('T')[0]
}
function startOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function parseProductionTable(html) {
  const $ = cheerio.load(html)
  const socios = []

  $('table tr').each((i, row) => {
    const cells = $(row).find('td')
    if (cells.length < 15) return

    const ong         = $(cells[0]).text().trim()
    const numFormul   = $(cells[1]).text().trim()
    const donante     = $(cells[2]).text().trim()
    const llamada     = $(cells[3]).text().trim().toLowerCase() === 'si'
    const tipoSocio   = $(cells[4]).text().trim()
    const pdfContrato = $(cells[5]).text().trim().toLowerCase() === 'si'
    const intentos    = parseInt($(cells[6]).text().trim()) || 0
    const cuota       = parseFloat($(cells[8]).text().trim().replace(',','.')) || null
    const periodicidad= $(cells[9]).text().trim()
    const fFirma      = parseDate($(cells[10]).text().trim())
    const fEntrega    = parseDate($(cells[11]).text().trim())
    const fAlta       = parseDate($(cells[12]).text().trim())
    const fOkKo       = parseDate($(cells[13]).text().trim())
    const otraFCobro  = parseDate($(cells[14]).text().trim())
    const estado      = $(cells[15]).text().trim()
    const comentCapt  = $(cells[16]).text().trim()
    const comentCall  = $(cells[17]).text().trim()

    if (!numFormul || !numFormul.includes('-')) return

    // Parse donor name
    const parts = donante.trim().split(' ')
    const nombre    = parts[0] || ''
    const apellido1 = parts[1] || ''
    const apellido2 = parts.slice(2).join(' ') || ''

    socios.push({
      num_formulario: numFormul,
      ong: ong || null,
      nombre, apellido1, apellido2,
      llamada, tipo_socio: tipoSocio || null,
      pdf_contrato: pdfContrato,
      num_intentos_rellamada: intentos,
      cuota, periodicidad: periodicidad || null,
      fecha_firma: fFirma,
      fecha_entrega: fEntrega,
      fecha_alta: fAlta,
      fecha_okko: fOkKo,
      otra_fecha_cobro: otraFCobro,
      estado: estado || null,
      comentarios_captador: comentCapt || null,
      comentarios_call: comentCall || null,
    })
  })

  return socios
}

function parseDate(str) {
  if (!str || str === '--/--' || str === '—') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })

  const supabase = db()

  // Get user's topf2f credentials
  const { data: user } = await supabase
    .from('users')
    .select('topf2f_user, topf2f_pass, id')
    .eq('id', claim.id)
    .single()

  if (!user?.topf2f_user || !user?.topf2f_pass) {
    return res.status(400).json({ error: 'No tienes credenciales de topf2f configuradas. Pide al admin que las añada.' })
  }

  const topf2f_pass = Buffer.from(user.topf2f_pass, 'base64').toString('utf8')

  try {
    const cookies = await loginTopF2F(user.topf2f_user, topf2f_pass)
    const html    = await fetchProduccion(cookies)
    const socios  = parseProductionTable(html)

    let newCount = 0, updatedCount = 0

    for (const s of socios) {
      const record = { ...s, captador_id: claim.id, last_sync: new Date().toISOString() }

      const { data: existing } = await supabase
        .from('socios')
        .select('id')
        .eq('num_formulario', s.num_formulario)
        .single()

      if (existing) {
        await supabase.from('socios').update(record).eq('id', existing.id)
        updatedCount++
      } else {
        await supabase.from('socios').insert(record)
        newCount++
      }
    }

    return res.status(200).json({
      ok: true,
      new: newCount,
      updated: updatedCount,
      total: socios.length
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
