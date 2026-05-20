import bcrypt from 'bcryptjs'
import { db } from '../_lib/db.js'
import { authMiddleware } from '../_lib/jwt.js'

const ADMIN_ROLE = 99

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  try {
    const claim = authMiddleware(req)
    if (!claim) return res.status(401).json({ error: 'No autorizado' })
    if (claim.role !== ADMIN_ROLE) return res.status(403).json({ error: 'Solo admins' })

    const { id } = req.query
    const supabase = db()

    if (req.method === 'PUT') {
      const { username, password, nombre, apellidos, role, topf2f_user, topf2f_pass, topf2f_captador_nombre, parent_id, activo } = req.body
      const isRoot = !!topf2f_user?.trim()

      const updates = {
        username:               username?.trim().toLowerCase(),
        nombre:                 nombre?.trim(),
        apellidos:              apellidos?.trim() || null,
        role:                   Number(role) || 1,
        topf2f_user:            isRoot ? topf2f_user.trim() : null,
        topf2f_captador_nombre: !isRoot ? topf2f_captador_nombre?.trim() || null : null,
        parent_id:              parent_id || null,
        activo:                 activo !== false,
        updated_at:             new Date().toISOString()
      }

      if (password) updates.password_hash = await bcrypt.hash(password, 12)
      if (isRoot && topf2f_pass) updates.topf2f_pass = Buffer.from(topf2f_pass).toString('base64')
      if (!isRoot) updates.topf2f_pass = null

      const { error } = await supabase.from('users').update(updates).eq('id', id)
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'DELETE') {
      await supabase.from('users').update({ parent_id: null }).eq('parent_id', id)
      const { error } = await supabase.from('users').delete().eq('id', id)
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: 'Error interno: ' + err.message })
  }
}
