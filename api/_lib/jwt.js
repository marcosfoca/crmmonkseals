import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'changeme-set-in-env'

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' })
}

export function verifyToken(token) {
  try { return jwt.verify(token, SECRET) }
  catch { return null }
}

export function authMiddleware(req) {
  const auth = req.headers['authorization'] || ''
  if (!auth.startsWith('Bearer ')) return null
  return verifyToken(auth.slice(7))
}
