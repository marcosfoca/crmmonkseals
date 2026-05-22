import { db } from '../_lib/db.js'
import { authMiddleware } from '../_lib/jwt.js'

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

// Count consecutive weekdays (Mon-Fri) backwards from today that have ≥1 socio
function calcRacha(fechaSet) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  // Move to most recent weekday
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
  let streak = 0
  for (let guard = 0; guard < 500; guard++) {
    const key = d.toISOString().slice(0, 10)
    if (!fechaSet.has(key)) break
    streak++
    d.setDate(d.getDate() - 1)
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
  }
  return streak
}

const EMPTY = { total: 0, ultimos_30: 0, racha: 0, llamada_pct_30: null, cuota_media: null }

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })

  try {
    const supabase = db()
    const visibleIds = await getVisibleUserIds(supabase, claim.id, claim.role)

    let q = supabase.from('socios').select('llamada, cuota, fecha_firma')
    if (visibleIds) q = q.in('captador_id', visibleIds)
    const { data, error } = await q

    if (error) return res.status(500).json({ error: error.message })
    if (!data?.length) return res.status(200).json(EMPTY)

    const total = data.length

    // 30-day window by fecha_firma
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const last30 = data.filter(s => s.fecha_firma && s.fecha_firma >= cutoffStr)
    const ultimos_30 = last30.length
    const llamada_pct_30 = ultimos_30 > 0
      ? Math.round(last30.filter(s => s.llamada).length / ultimos_30 * 100)
      : null

    // Racha: consecutive weekdays with ≥1 socio (by fecha_firma)
    const fechaSet = new Set(
      data.filter(s => s.fecha_firma).map(s => s.fecha_firma.slice(0, 10))
    )
    const racha = calcRacha(fechaSet)

    // Global cuota media
    const cuotas = data.map(s => Number(s.cuota)).filter(Boolean)
    const cuota_media = cuotas.length
      ? Math.round(cuotas.reduce((a, b) => a + b, 0) / cuotas.length * 10) / 10
      : null

    return res.status(200).json({ total, ultimos_30, racha, llamada_pct_30, cuota_media })

  } catch (err) {
    return res.status(500).json({ error: 'Error interno: ' + err.message })
  }
}
