import { db } from '../_lib/db.js'
import { authMiddleware } from '../_lib/jwt.js'

async function getVisibleUserIds(supabase, userId, role) {
  if (role === 99) return null
  try {
    const { data: self } = await supabase.from('users').select('es_raiz').eq('id', userId).single()
    if (self?.es_raiz) return null
  } catch {}
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

function calcRacha(fechaSet) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
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

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })

  try {
    const supabase = db()
    const visibleIds = await getVisibleUserIds(supabase, claim.id, claim.role)

    const [sociosRes, usersRes] = await Promise.all([
      (() => {
        let q = supabase.from('socios').select('captador_id,llamada,cuota,fecha_firma,estado')
        if (visibleIds) q = q.in('captador_id', visibleIds)
        return q
      })(),
      (() => {
        let q = supabase.from('users').select('id,nombre,apellidos')
        if (visibleIds) q = q.in('id', visibleIds)
        return q
      })(),
    ])

    if (sociosRes.error) return res.status(500).json({ error: sociosRes.error.message })

    const userMap = {}
    for (const u of usersRes.data || []) userMap[u.id] = u

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const groups = {}
    for (const s of sociosRes.data || []) {
      const cid = s.captador_id
      if (!cid) continue
      if (!groups[cid]) groups[cid] = { socios: [], fechaSet: new Set() }
      groups[cid].socios.push(s)
      if (s.fecha_firma) groups[cid].fechaSet.add(s.fecha_firma.slice(0, 10))
    }

    const captadores = Object.entries(groups).map(([captador_id, { socios, fechaSet }]) => {
      const u = userMap[captador_id]
      const total = socios.length
      const last30 = socios.filter(s => s.fecha_firma >= cutoffStr)
      const ultimos_30 = last30.length
      const llamada_pct_30 = ultimos_30 > 0
        ? Math.round(last30.filter(s => s.llamada).length / ultimos_30 * 100)
        : null
      const cuotas = socios.map(s => Number(s.cuota)).filter(Boolean)
      const cuota_media = cuotas.length
        ? Math.round(cuotas.reduce((a, b) => a + b, 0) / cuotas.length * 10) / 10
        : null
      const racha = calcRacha(fechaSet)
      const ok = socios.filter(s => s.estado?.trim() === 'SOCIO').length
      const pct_ok = total > 0 ? Math.round(ok / total * 100) : null

      return {
        captador_id,
        nombre: u ? `${u.nombre} ${u.apellidos || ''}`.trim() : '—',
        es_yo: captador_id === claim.id,
        total, ultimos_30, racha, cuota_media, llamada_pct_30, pct_ok,
      }
    }).sort((a, b) => b.total - a.total)

    return res.status(200).json({ captadores })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
