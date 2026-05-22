import { db } from '../_lib/db.js'
import { authMiddleware } from '../_lib/jwt.js'

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })

  const supabase = db()
  const now = new Date()

  // Fetch ALL socios visible to this user (no captador filter for full picture)
  const { data, error } = await supabase
    .from('socios')
    .select('num_formulario, fecha_nacimiento, captador_id, nombre, apellido1')

  if (error) return res.status(500).json({ error: error.message })

  const total = data.length
  const conDob = data.filter(s => s.fecha_nacimiento)
  const sinDob = data.filter(s => !s.fecha_nacimiento)

  // Compute age for each socio with DOB
  const ages = conDob.map(s => {
    const dob = new Date(s.fecha_nacimiento)
    if (isNaN(dob)) return { ...s, age: null, reason: 'invalid date' }
    let age = now.getFullYear() - dob.getFullYear()
    const m = now.getMonth() - dob.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
    return { num: s.num_formulario, dob: s.fecha_nacimiento, age, captador_id: s.captador_id }
  })

  // Bucket by age range
  const TRAMOS = [
    ['<24',   0,  23], ['24-29', 24, 29], ['30-39', 30, 39],
    ['40-49', 40, 49], ['50-59', 50, 59], ['60-69', 60, 69],
    ['70-79', 70, 79], ['80-89', 80, 89], ['90-99', 90, 99],
  ]
  const tramoSummary = TRAMOS.map(([tramo, min, max]) => ({
    tramo,
    count: ages.filter(a => a.age != null && a.age >= min && a.age <= max).length,
    sample: ages
      .filter(a => a.age != null && a.age >= min && a.age <= max)
      .slice(0, 3)
      .map(a => ({ dob: a.dob, age: a.age, captador_id: a.captador_id }))
  }))

  const invalidDates = ages.filter(a => a.age === null)
  const rawSampleNoDob = sinDob.slice(0, 5).map(s => ({
    num: s.num_formulario,
    nombre: `${s.nombre} ${s.apellido1}`,
    captador_id: s.captador_id
  }))

  return res.status(200).json({
    total,
    con_fecha_nacimiento: conDob.length,
    sin_fecha_nacimiento: sinDob.length,
    invalid_dates: invalidDates.length,
    tramos: tramoSummary,
    sample_sin_dob: rawSampleNoDob,
    sample_invalid: invalidDates.slice(0, 3),
  })
}
