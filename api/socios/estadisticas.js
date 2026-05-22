import { db } from '../_lib/db.js'
import { authMiddleware } from '../_lib/jwt.js'
import { getDay, getWeek, getYear } from 'date-fns'
import { es } from 'date-fns/locale'

async function getVisibleUserIds(supabase, userId, role) {
  if (role === 99) return null
  const { data: rows } = await supabase.from('users').select('id, parent_id')
  const visible = new Set([userId])
  let changed = true
  while (changed) {
    changed = false
    for (const u of rows || []) {
      if (u.parent_id && visible.has(u.parent_id) && !visible.has(u.id)) {
        visible.add(u.id); changed = true
      }
    }
  }
  return [...visible]
}

function avg(arr) {
  if (!arr.length) return null
  return Math.round(arr.reduce((a,b) => a+b,0) / arr.length * 10) / 10
}

function countOkKo(arr) {
  const ok = arr.filter(s => s.estado?.trim() === 'SOCIO').length
  return { ok, ko: arr.length - ok, total: arr.length }
}

// starts with letter → NIE/Pasaporte, starts with digit → DNI
function tipoDoc(nif) {
  if (!nif) return 'Sin dato'
  const n = nif.trim()
  if (/^[A-Za-z]/.test(n)) return 'NIE/Pasaporte'
  if (/^\d/.test(n)) return 'DNI'
  return 'Sin dato'
}

const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

const ONGS_FIJAS = ['CRUZ ROJA', 'PLAN']
const CUOTAS_FIJAS = [6, 10, 12, 15, 20, 25, 30]
const TRAMOS_EDAD = [
  ['<24',   0,  23], ['24-29', 24, 29], ['30-39', 30, 39],
  ['40-49', 40, 49], ['50-59', 50, 59], ['60-69', 60, 69],
  ['70-79', 70, 79], ['80-89', 80, 89], ['90-99', 90, 99],
]

const EMPTY = {
  total: 0, edad_media: null, cuota_media: null, llamada_ok: 0,
  edad_tramos: [], cuota_por_estado: [], por_sexo: [], por_documento: [],
  por_ong: [], por_cuota_tramo: [],
  volumen_por_mes: [], volumen_por_semana: [], volumen_por_dia: []
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })

  try {
    const supabase = db()
    const visibleIds = await getVisibleUserIds(supabase, claim.id, claim.role)

    let q = supabase.from('socios').select('estado,llamada,cuota,fecha_alta,fecha_nacimiento,sexo,nif,ong')
    if (visibleIds) q = q.in('captador_id', visibleIds)
    const { data, error } = await q

    if (error) return res.status(500).json({ error: error.message })
    if (!data?.length) return res.status(200).json(EMPTY)

    const total      = data.length
    const llamada_ok = data.filter(s => s.llamada).length
    const cuotas     = data.map(s => Number(s.cuota)).filter(Boolean)
    const cuota_media = avg(cuotas)

    // Calculate age from fecha_nacimiento when available
    const now = new Date()
    const edades = data
      .map(s => {
        if (!s.fecha_nacimiento) return null
        const dob = new Date(s.fecha_nacimiento)
        if (isNaN(dob)) return null
        let age = now.getFullYear() - dob.getFullYear()
        const m = now.getMonth() - dob.getMonth()
        if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
        return age > 0 && age < 120 ? age : null
      })
      .filter(Boolean)

    const edad_media = avg(edades)
    const edadFreq = {}
    edades.forEach(e => { edadFreq[e] = (edadFreq[e]||0)+1 })
    const edad_moda = edades.length
      ? Object.entries(edadFreq).sort((a,b) => b[1]-a[1])[0]?.[0]
      : null

    // Edad tramos — ok/ko + cuota media per tramo (always all buckets, cuota_media=0 if none)
    const edad_tramos = TRAMOS_EDAD.map(([tramo, min, max]) => {
      const arr = data.filter(s => {
        const dob = s.fecha_nacimiento ? new Date(s.fecha_nacimiento) : null
        if (!dob || isNaN(dob)) return false
        let age = now.getFullYear() - dob.getFullYear()
        const m = now.getMonth() - dob.getMonth()
        if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
        return age >= min && age <= max
      })
      const cuotas = arr.map(s => Number(s.cuota)).filter(Boolean)
      return { tramo, ...countOkKo(arr), cuota_media: avg(cuotas) ?? 0 }
    })

    // Cuota por estado (cuota media — useful for understanding ticket size)
    const estadoGrupos = {}
    data.forEach(s => {
      const e = s.estado?.trim() || 'SIN ESTADO'
      if (!estadoGrupos[e]) estadoGrupos[e] = []
      if (s.cuota) estadoGrupos[e].push(Number(s.cuota))
    })
    const cuota_por_estado = Object.entries(estadoGrupos)
      .map(([estado, cs]) => ({ estado, cuota_media: avg(cs) || 0 }))
      .sort((a,b) => b.cuota_media - a.cuota_media)
      .slice(0, 8)

    // Por sexo — always include Hombre and Mujer
    const sexoBuckets = { 'Hombre': [], 'Mujer': [] }
    data.forEach(s => {
      const sx = s.sexo?.trim()
      if (sx === 'Hombre' || sx === 'Mujer') sexoBuckets[sx].push(s)
    })
    const por_sexo = ['Hombre', 'Mujer'].map(sexo => ({
      sexo, ...countOkKo(sexoBuckets[sexo])
    }))

    // Por documento — letter=NIE/Pasaporte, digit=DNI
    const docBuckets = { 'DNI': [], 'NIE/Pasaporte': [], 'Sin dato': [] }
    data.forEach(s => {
      const t = tipoDoc(s.nif)
      docBuckets[t].push(s)
    })
    const por_documento = Object.entries(docBuckets)
      .filter(([, arr]) => arr.length > 0)
      .map(([tipo, arr]) => ({ tipo, ...countOkKo(arr) }))

    // Por ONG — always include CRUZ ROJA and PLAN, then any others
    const ongBuckets = {}
    ONGS_FIJAS.forEach(o => { ongBuckets[o] = [] })
    data.forEach(s => {
      const o = (s.ong || '').replace('_', ' ').toUpperCase()
      if (!ongBuckets[o]) ongBuckets[o] = []
      ongBuckets[o].push(s)
    })
    const por_ong = Object.entries(ongBuckets)
      .map(([ong, arr]) => ({ ong, ...countOkKo(arr) }))

    // Por tramo de cuota — exact match for fixed values, OTRAS for non-matching ≤30, >30€ for the rest
    const por_cuota_tramo = [
      ...CUOTAS_FIJAS.map(v => ({
        tramo: `${v}€`,
        ...countOkKo(data.filter(s => Number(s.cuota) === v))
      })),
      {
        tramo: '>30€',
        ...countOkKo(data.filter(s => Number(s.cuota) > 30))
      },
      {
        tramo: 'OTRAS',
        ...countOkKo(data.filter(s => {
          const c = Number(s.cuota)
          return c > 0 && !CUOTAS_FIJAS.includes(c) && c <= 30
        }))
      },
    ]

    // Volumen por tiempo
    const ventasData = data.filter(s => s.llamada && s.fecha_alta)

    const mesesMap = {}
    ventasData.forEach(s => {
      const key = s.fecha_alta.substring(0,7)
      mesesMap[key] = (mesesMap[key]||0)+1
    })
    const volumen_por_mes = Object.entries(mesesMap)
      .sort((a,b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([k,v]) => ({ label: k, socios: v }))

    const semanasMap = {}
    ventasData.forEach(s => {
      try {
        const d = new Date(s.fecha_alta)
        const key = `${getYear(d)}-S${String(getWeek(d,{locale:es})).padStart(2,'0')}`
        semanasMap[key] = (semanasMap[key]||0)+1
      } catch {}
    })
    const volumen_por_semana = Object.entries(semanasMap)
      .sort((a,b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([k,v]) => ({ label: k, socios: v }))

    const diasMap = {0:0,1:0,2:0,3:0,4:0,5:0,6:0}
    ventasData.forEach(s => {
      try { diasMap[getDay(new Date(s.fecha_alta))]++ } catch {}
    })
    const volumen_por_dia = Object.entries(diasMap)
      .map(([d,v]) => ({ label: DIAS[d], socios: v }))

    return res.status(200).json({
      total, edad_media, cuota_media, llamada_ok, edad_moda,
      edad_tramos, cuota_por_estado, por_sexo, por_documento,
      por_ong, por_cuota_tramo,
      volumen_por_mes, volumen_por_semana, volumen_por_dia
    })

  } catch (err) {
    return res.status(500).json({ error: 'Error interno: ' + err.message })
  }
}
