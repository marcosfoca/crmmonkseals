import bcrypt from 'bcryptjs'
import { db } from '../_lib/db.js'
import { signToken } from '../_lib/jwt.js'

export default async function handler(req, res) {
  // Ensure we always respond with JSON
  res.setHeader('Content-Type', 'application/json')

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { username, password } = req.body || {}
    if (!username || !password) return res.status(400).json({ error: 'Faltan credenciales' })

    // Check env vars are present
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'Config: faltan variables de entorno de Supabase en Vercel' })
    }
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: 'Config: falta JWT_SECRET en Vercel' })
    }

    const { data: users, error } = await db()
      .from('users')
      .select('id, username, password_hash, nombre, apellidos, role, topf2f_user, parent_id, activo, es_raiz')
      .eq('username', username.trim().toLowerCase())
      .limit(1)

    if (error) {
      console.error('Supabase error:', error)
      // Tabla no existe → schema no ejecutado
      if (error.code === '42P01') {
        return res.status(500).json({ error: 'La base de datos no está inicializada. Ejecuta supabase_schema.sql en Supabase.' })
      }
      return res.status(500).json({ error: 'Error de base de datos: ' + error.message })
    }

    if (!users?.length) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })

    const user = users[0]
    if (!user.activo) return res.status(401).json({ error: 'Usuario desactivado. Contacta con el admin.' })

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })

    const { password_hash, ...safeUser } = user
    const token = signToken({ id: user.id, role: user.role, es_raiz: !!user.es_raiz })

    return res.status(200).json({ token, user: safeUser })

  } catch (err) {
    console.error('Login handler crash:', err)
    return res.status(500).json({ error: 'Error interno: ' + err.message })
  }
}
