import { db } from '../_lib/db.js'
import { authMiddleware } from '../_lib/jwt.js'
import { format, getDay, getWeek, getMonth, getYear } from 'date-fns'
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
function pctOk(arr) {
  if (!arr.length) return 0
  return Math.round(arr.filter(s => s.estado?.trim() === 'SOCIO').length / arr.length * 100)
}

const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

export default async function handler(req, res) {
  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })

  const supabase = db()
  const visibleIds = await getVisibleUserIds(supabase, claim.id, claim.role)

  let q = supabase.from('socios').select(
    'estado, llamada, cuota, fecha_alta, edad, sexo, nif, ong'
  )
  if (visibleIds) q = q.in('captador_id', visibleIds)
  const { data } = await q

  if (!data?.length) return res.status(200).json({
    total: 0, edad_media: null, cuota_media: null, llamada_ok: 0,
    edad_tramos: [], cuota_por_estado: [], por_sexo: [], por_documento: [],
    por_ong: [], por_cuota_tramo: [],
    volumen_por_mes: [], volumen_por_semana: [], volumen_por_dia: []
  })

  const total      = data.length
  const edades     = data.map(s => s.edad).filter(Boolean)
  const cuotas     = data.map(s => Number(s.cuota)).filter(Boolean)
  const llamada_ok = data.filter(s => s.llamada).length

  const edad_media = avg(edades)
  const cuota_media = avg(cuotas)

  // Moda de edad
  const edadFreq = {}
  edades.forEach(e => { edadFreq[e] = (edadFreq[e]||0)+1 })
  const edad_moda = Object.entries(edadFreq).sort((a,b) => b[1]-a[1])[0]?.[0] || null

  // Tramos de edad
  const tramosEdad = [
    ['18-25', 18, 25], ['26-35', 26, 35], ['36-45', 36, 45],
    ['46-55', 46, 55], ['56-65', 56, 65], ['66+', 66, 150]
  ]
  const edad_tramos = tramosEdad.map(([tramo, min, max]) => ({
    tramo,
    total: data.filter(s => s.edad >= min && s.edad <= max).length
  }))

  // Cuota por estado (top estados)
  const estadoGrupos = {}
  data.forEach(s => {
    const e = (s.estado?.trim() || 'SIN ESTADO')
    if (!estadoGrupos[e]) estadoGrupos[e] = []
    if (s.cuota) estadoGrupos[e].push(Number(s.cuota))
  })
  const cuota_por_estado = Object.entries(estadoGrupos)
    .map(([estado, cuotas]) => ({ estado, cuota_media: avg(cuotas) || 0 }))
    .sort((a,b) => b.cuota_media - a.cuota_media)
    .slice(0, 8)

  // Por sexo
  const sexoGrupos = {}
  data.forEach(s => {
    const sx = s.sexo || 'Desconocido'
    if (!sexoGrupos[sx]) sexoGrupos[sx] = []
    sexoGrupos[sx].push(s)
  })
  const por_sexo = Object.entries(sexoGrupos).map(([sexo, arr]) => ({
    sexo,
    cuota_media: avg(arr.map(s=>Number(s.cuota)).filter(Boolean)) || 0,
    pct_ok: pctOk(arr)
  }))

  // Por tipo documento (DNI/NIE/Pasaporte por longitud del NIF)
  function tipoDoc(nif) {
    if (!nif) return 'Sin dato'
    const n = nif.trim().toUpperCase()
    if (/^[XYZ]/.test(n)) return 'NIE'
    if (/^[A-Z]{2}/.test(n)) return 'Pasaporte'
    if (/^\d{8}[A-Z]$/.test(n)) return 'DNI'
    return 'Otro'
  }
  const docGrupos = {}
  data.forEach(s => {
    const t = tipoDoc(s.nif)
    if (!docGrupos[t]) docGrupos[t] = []
    docGrupos[t].push(s)
  })
  const por_documento = Object.entries(docGrupos).map(([tipo, arr]) => ({
    tipo,
    cuota_media: avg(arr.map(s=>Number(s.cuota)).filter(Boolean)) || 0,
    pct_ok: pctOk(arr)
  }))

  // Por ONG
  const ongGrupos = {}
  data.forEach(s => {
    const o = s.ong || 'Sin ONG'
    if (!ongGrupos[o]) ongGrupos[o] = []
    ongGrupos[o].push(s)
  })
  const por_ong = Object.entries(ongGrupos).map(([ong, arr]) => ({
    ong: ong.replace('_',' '),
    cuota_media: avg(arr.map(s=>Number(s.cuota)).filter(Boolean)) || 0,
    pct_ok: pctOk(arr)
  }))

  // Por tramo de cuota
  const tramosC = [
    ['≤6€', 0, 6], ['7-10€', 7, 10], ['11-15€', 11, 15],
    ['16-20€', 16, 20], ['21-25€', 21, 25], ['>25€', 26, 999]
  ]
  const por_cuota_tramo = tramosC.map(([tramo, min, max]) => {
    const arr = data.filter(s => s.cuota >= min && s.cuota <= max)
    return { tramo, total: arr.length, pct_ok: pctOk(arr) }
  })

  // Volumen por mes (socios con llamada:true)
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

  // Volumen por semana (últimas 12 semanas)
  const semanasMap = {}
  ventasData.forEach(s => {
    const d = new Date(s.fecha_alta)
    const key = `${getYear(d)}-S${String(getWeek(d,{locale:es})).padStart(2,'0')}`
    semanasMap[key] = (semanasMap[key]||0)+1
  })
  const volumen_por_semana = Object.entries(semanasMap)
    .sort((a,b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([k,v]) => ({ label: k, socios: v }))

  // Volumen por día de la semana
  const diasMap = {0:0,1:0,2:0,3:0,4:0,5:0,6:0}
  ventasData.forEach(s => {
    const d = getDay(new Date(s.fecha_alta))
    diasMap[d]++
  })
  const volumen_por_dia = Object.entries(diasMap)
    .map(([d,v]) => ({ label: DIAS[d], socios: v }))

  return res.status(200).json({
    total, edad_media, cuota_media, llamada_ok, edad_moda,
    edad_tramos, cuota_por_estado, por_sexo, por_documento,
    por_ong, por_cuota_tramo,
    volumen_por_mes, volumen_por_semana, volumen_por_dia
  })
}
