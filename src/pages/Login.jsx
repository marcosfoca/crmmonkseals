import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const { login, loading, user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm]     = useState({ username: '', password: '' })
  const [error, setError]   = useState('')
  const [showPw, setShowPw] = useState(false)

  if (user) { navigate('/'); return null }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const result = await login(form.username, form.password)
    if (result.ok) navigate('/')
    else setError(result.error)
  }

  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl font-black text-white tracking-tight">
            <span className="text-brand-red">Monk</span>Seals
          </div>
          <p className="text-white/50 text-sm mt-1">CRM · Captación F2F</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col gap-4">
          <h2 className="text-xl font-bold text-gray-800 mb-1">Iniciar sesión</h2>

          <div>
            <label className="label">Usuario</label>
            <input className="input" type="text" autoComplete="username"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              placeholder="Tu nombre de usuario"
              required />
          </div>

          <div>
            <label className="label">Contraseña</label>
            <div className="relative">
              <input className="input pr-10" type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
                required />
              <button type="button" tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPw(p => !p)}>
                {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="btn-primary w-full justify-center py-2.5 mt-1 text-base">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
