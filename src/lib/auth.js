const TOKEN_KEY = 'crm_token'
const USER_KEY  = 'crm_user'

export function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)) }
  catch { return null }
}

export function isLoggedIn() {
  return !!getToken()
}

export async function apiFetch(path, options = {}) {
  const token = getToken()
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  })
  if (res.status === 401) {
    clearSession()
    window.location.href = '/login'
    return
  }
  return res
}

// Role constants
export const ROLES = {
  CAPTADOR:     1,
  FORMADOR:     2,
  JEFE_EQUIPO:  3,
  DIRECTOR:     4,
  GERENTE:      5,
  SUPERGERENTE: 6,
  ADMIN:        99
}

export const ROLE_LABELS = {
  1:  'Captador',
  2:  'Formador',
  3:  'Jefe de Equipo',
  4:  'Director',
  5:  'Gerente',
  6:  'Supergerente',
  99: 'Admin'
}
