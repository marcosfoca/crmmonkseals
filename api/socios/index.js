import { db } from '../_lib/db.js'
import { authMiddleware } from '../_lib/jwt.js'

async function getVisibleUserIds(supabase, userId, role) {
  if (role === 99) return null // admin sees all

  const { data: rows } = await supabase.from('users').select('id, parent_id')
  const visible = new Set([userId])
  let changed = true
  while (changed) {
    changed = false
    for (const u of rows || []) {
      if (u.parent_id && visible.has(u.parent_id) && !visible.has(u.id)) {
        visible.add(u.id)
        changed = true
      }
    }
  }
  return [...visible]
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const supabase = db()
    const {
      page = 1, per_page = 50, sort = 'fecha_alta', dir = 'desc',
      nombre, dni, cuota, estado, ong, desde, hasta
    } = req.query

    const visibleIds = await getVisibleUserIds(supabase, claim.id, claim.role)

    const ALLOWED_SORT = ['fecha_alta','fecha_okko','cuota','estado','nombre','apellido1','ong','llamada']
    const safeSort = ALLOWED_SORT.includes(sort) ? sort : 'fecha_alta'

    let query = supabase
      .from('socios')
      .select('id,num_formulario,ong,captador_id,nombre,apellido1,apellido2,nif,cuota,periodicidad,estado,tipo_socio,fecha_alta,fecha_okko,llamada', { count: 'exact' })

    if (visibleIds) query = query.in('captador_id', visibleIds)

    // Search across nombre + apellido1 + apellido2 with OR
    if (nombre) {
      const like = nombre.replace(/'/g, "''") // basic escape
      query = query.or(`nombre.ilike.%${like}%,apellido1.ilike.%${like}%,apellido2.ilike.%${like}%`)
    }
    if (dni)    query = query.ilike('nif', `%${dni}%`)
    if (cuota)  query = query.eq('cuota', Number(cuota))
    if (estado) query = query.ilike('estado', `%${estado}%`)
    if (ong)    query = query.eq('ong', ong)
    if (desde)  query = query.gte('fecha_alta', desde)
    if (hasta)  query = query.lte('fecha_alta', hasta)

    query = query.order(safeSort, { ascending: dir === 'asc' })

    const from = (Number(page) - 1) * Number(per_page)
    const to   = from + Number(per_page) - 1
    query = query.range(from, to)

    const { data, error, count } = await query
    if (error) return res.status(500).json({ error: error.message })

    return res.status(200).json({ socios: data, total: count })

  } catch (err) {
    return res.status(500).json({ error: 'Error interno: ' + err.message })
  }
}
