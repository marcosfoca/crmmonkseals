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

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })

  try {
    const supabase = db()
    const visibleIds = await getVisibleUserIds(supabase, claim.id, claim.role)

    let q = supabase.from('socios').select('estado, llamada, cuota, fecha_alta')
    if (visibleIds) q = q.in('captador_id', visibleIds)
    const { data, error } = await q

    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(200).json({ total: 0, socios_ok: 0, en_proceso: 0, este_mes: 0, llamada_ok: 0, cuota_media: null })

    const now = new Date()
    const mesActual = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`

    const total      = data.length
    const socios_ok  = data.filter(s => s.estado?.trim() === 'SOCIO').length
    const en_proceso = data.filter(s => s.estado?.trim() === 'EN PROCESO').length
    const este_mes   = data.filter(s => s.fecha_alta?.startsWith(mesActual)).length
    const llamada_ok = data.filter(s => s.llamada).length

    const cuotas = data.map(s => Number(s.cuota)).filter(Boolean)
    const cuota_media = cuotas.length
      ? Math.round(cuotas.reduce((a,b) => a+b, 0) / cuotas.length * 10) / 10
      : null

    return res.status(200).json({ total, socios_ok, en_proceso, este_mes, llamada_ok, cuota_media })

  } catch (err) {
    return res.status(500).json({ error: 'Error interno: ' + err.message })
  }
}
