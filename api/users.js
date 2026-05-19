import bcrypt from 'bcryptjs'
import { db } from './_lib/db.js'
import { authMiddleware } from './_lib/jwt.js'

const ADMIN_ROLE = 99

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })
  if (claim.role !== ADMIN_ROLE) return res.status(403).json({ error: 'Solo admins' })

  try {
    const supabase = db()

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, nombre, apellidos, role, topf2f_user, parent_id, activo, created_at')
        .order('role', { ascending: false })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json(data)
    }

    if (req.method === 'POST') {
      const { username, password, nombre, apellidos, role, topf2f_user, topf2f_pass, parent_id, activo } = req.body
      if (!username || !password || !nombre) {
        return res.status(400).json({ error: 'Faltan campos obligatorios (username, password, nombre)' })
      }

      const hash = await bcrypt.hash(password, 12)
      const topf2f_pass_enc = topf2f_pass ? Buffer.from(topf2f_pass).toString('base64') : null

      const { data, error } = await supabase.from('users').insert({
        username:      username.trim().toLowerCase(),
        password_hash: hash,
        nombre:        nombre.trim(),
        apellidos:     apellidos?.trim() || null,
        role:          Number(role) || 1,
        topf2f_user:   topf2f_user?.trim() || null,
        topf2f_pass:   topf2f_pass_enc,
        parent_id:     parent_id || null,
        activo:        activo !== false
      }).select('id').single()

      if (error) return res.status(400).json({ error: error.message })
      return res.status(201).json({ id: data.id })
    }

    return res.status(405).json({ error: 'Method not allowed' })

  } catch (err) {
    return res.status(500).json({ error: 'Error interno: ' + err.message })
  }
}
