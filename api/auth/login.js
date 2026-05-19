import bcrypt from 'bcryptjs'
import { db } from '../_lib/db.js'
import { signToken } from '../_lib/jwt.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: 'Faltan credenciales' })

  const { data: users, error } = await db()
    .from('users')
    .select('id, username, password_hash, nombre, apellidos, role, topf2f_user, parent_id, activo')
    .eq('username', username.trim().toLowerCase())
    .limit(1)

  if (error || !users?.length) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })

  const user = users[0]
  if (!user.activo) return res.status(401).json({ error: 'Usuario desactivado. Contacta con el admin.' })

  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })

  const { password_hash, ...safeUser } = user
  const token = signToken({ id: user.id, role: user.role })

  return res.status(200).json({ token, user: safeUser })
}
