import { db } from '../_lib/db.js'
import { authMiddleware } from '../_lib/jwt.js'

// Returns IDs of user + all users below them in the hierarchy
async function getVisibleUserIds(supabase, userId, role) {
  if (role === 99) return null // admin sees all

  const allUsers = await supabase.from('users').select('id, parent_id, role')
  const rows = allUsers.data || []

  const visible = new Set([userId])
  let changed = true
  while (changed) {
    changed = false
    for (const u of rows) {
      if (u.parent_id && visible.has(u.parent_id) && !visible.has(u.id)) {
        visible.add(u.id)
        changed = true
      }
    }
  }
  return [...visible]
}

export default async function handler(req, res) {
  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })

  const supabase = db()

  if (req.method === 'GET') {
    const {
      page = 1, per_page = 50, sort = 'fecha_alta', dir = 'desc',
      nombre, dni, cuota, estado, ong, desde, hasta
    } = req.query

    const visibleIds = await getVisibleUserIds(supabase, claim.id, claim.role)

    let query = supabase
      .from('socios')
      .select('id,num_formulario,ong,captador_id,nombre,apellido1,apellido2,nif,cuota,periodicidad,estado,tipo_socio,fecha_alta,fecha_okko,llamada', { count: 'exact' })

    if (visibleIds) query = query.in('captador_id', visibleIds)
    if (nombre)    query = query.ilike('nombre', `%${nombre}%`)
                              .or(`apellido1.ilike.%${nombre}%,apellido2.ilike.%${nombre}%`)
    if (dni)       query = query.ilike('nif', `%${dni}%`)
    if (cuota)     query = query.eq('cuota', Number(cuota))
    if (estado)    query = query.ilike('estado', `%${estado}%`)
    if (ong)       query = query.eq('ong', ong)
    if (desde)     query = query.gte('fecha_alta', desde)
    if (hasta)     query = query.lte('fecha_alta', hasta)

    const isAsc = dir === 'asc'
    query = query.order(sort, { ascending: isAsc })

    const from = (Number(page) - 1) * Number(per_page)
    const to   = from + Number(per_page) - 1
    query = query.range(from, to)

    const { data, error, count } = await query
    if (error) return res.status(500).json({ error: error.message })

    return res.status(200).json({ socios: data, total: count })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
