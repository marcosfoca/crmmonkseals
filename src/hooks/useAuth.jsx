import { createContext, useContext, useState, useEffect } from 'react'
import { getUser, getToken, clearSession, saveSession } from '../lib/auth.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(() => getUser())
  const [loading, setLoading] = useState(false)

  async function login(username, password) {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error de autenticación')
      saveSession(data.token, data.user)
      setUser(data.user)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    clearSession()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
