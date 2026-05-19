import { useEffect, useState } from 'react'
import { apiFetch, ROLE_LABELS, ROLES } from '../lib/auth.js'
import { UserPlus, Pencil, Trash2, X, Check, Eye, EyeOff, ChevronDown } from 'lucide-react'

const ROLE_OPTIONS = Object.entries(ROLE_LABELS)
  .filter(([k]) => Number(k) !== ROLES.ADMIN)
  .sort((a, b) => a[0] - b[0])

const ROLE_BADGE = {
  1: 'bg-gray-100 text-gray-700',
  2: 'bg-blue-100 text-blue-800',
  3: 'bg-indigo-100 text-indigo-800',
  4: 'bg-purple-100 text-purple-800',
  5: 'bg-yellow-100 text-yellow-800',
  6: 'bg-red-100 text-red-700',
  99:'bg-black text-white',
}

const EMPTY_FORM = {
  username: '', password: '', nombre: '', apellidos: '',
  role: 1, topf2f_user: '', topf2f_pass: '', parent_id: '', activo: true
}

export default function Admin() {
  const [users, setUsers]     = useState([])
  const [loading, setLoad]    = useState(true)
  const [modal, setModal]     = useState(null) // null | 'create' | 'edit'
  const [form, setForm]       = useState(EMPTY_FORM)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [showPw, setShowPw]   = useState(false)
  const [editId, setEditId]   = useState(null)

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoad(true)
    const res = await apiFetch('/api/users')
    if (res?.ok) setUsers(await res.json())
    setLoad(false)
  }

  function openCreate() {
    setForm(EMPTY_FORM); setError(''); setEditId(null); setModal('create')
  }

  function openEdit(u) {
    setForm({
      username: u.username, password: '', nombre: u.nombre,
      apellidos: u.apellidos || '', role: u.role,
      topf2f_user: u.topf2f_user || '', topf2f_pass: '',
      parent_id: u.parent_id || '', activo: u.activo
    })
    setEditId(u.id); setError(''); setModal('edit')
  }

  async function handleSave() {
    setSaving(true); setError('')
    try {
      const body = { ...form }
      if (!body.password && modal === 'edit') delete body.password
      const res = modal === 'create'
        ? await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(body) })
        : await apiFetch(`/api/users/${editId}`, { method: 'PUT', body: JSON.stringify(body) })
      if (!res) { setSaving(false); return } // redirected to login
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || `Error ${res.status}`); setSaving(false); return }
      setModal(null); loadUsers()
    } catch (err) {
      setError('Error de red: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id, nombre) {
    if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return
    await apiFetch(`/api/users/${id}`, { method: 'DELETE' })
    loadUsers()
  }

  const parentOptions = users.filter(u => u.id !== editId)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Panel de Administración</h1>
          <p className="text-xs text-gray-400 mt-0.5">Gestión de usuarios, rangos y accesos</p>
        </div>
        <button onClick={openCreate} className="btn-primary gap-2">
          <UserPlus size={15}/>Nuevo usuario
        </button>
      </div>

      {/* Team tree / table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Nombre','Usuario','Rango','Responsable de','topf2f','Estado','Acciones'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">Cargando...</td></tr>
            ) : users.map(u => {
              const children = users.filter(c => c.parent_id === u.id)
              return (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    {u.nombre} {u.apellidos}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{u.username}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${ROLE_BADGE[u.role] || 'bg-gray-100 text-gray-700'}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {children.length > 0
                      ? children.slice(0,3).map(c => c.nombre).join(', ') + (children.length > 3 ? ` +${children.length-3}` : '')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">{u.topf2f_user || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${u.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(u)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-blue transition-colors">
                        <Pencil size={14}/>
                      </button>
                      <button onClick={() => handleDelete(u.id, u.nombre)}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-brand-red transition-colors">
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-lg">
                {modal === 'create' ? 'Nuevo usuario' : 'Editar usuario'}
              </h2>
              <button onClick={() => setModal(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={18}/>
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Nombre *</label>
                  <input className="input" value={form.nombre}
                    onChange={e => setForm(f => ({...f, nombre: e.target.value}))}/>
                </div>
                <div>
                  <label className="label">Apellidos</label>
                  <input className="input" value={form.apellidos}
                    onChange={e => setForm(f => ({...f, apellidos: e.target.value}))}/>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Usuario * </label>
                  <input className="input" value={form.username} autoComplete="off"
                    onChange={e => setForm(f => ({...f, username: e.target.value}))}/>
                </div>
                <div>
                  <label className="label">
                    Contraseña {modal === 'edit' && <span className="normal-case text-gray-400">(dejar vacío = no cambiar)</span>}
                  </label>
                  <div className="relative">
                    <input className="input pr-9" type={showPw ? 'text' : 'password'}
                      value={form.password} autoComplete="new-password"
                      onChange={e => setForm(f => ({...f, password: e.target.value}))}/>
                    <button type="button" tabIndex={-1} onClick={() => setShowPw(p=>!p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Rango *</label>
                  <select className="input" value={form.role}
                    onChange={e => setForm(f => ({...f, role: Number(e.target.value)}))}>
                    {ROLE_OPTIONS.map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Responsable (superior directo)</label>
                  <select className="input" value={form.parent_id}
                    onChange={e => setForm(f => ({...f, parent_id: e.target.value}))}>
                    <option value="">— Sin responsable —</option>
                    {parentOptions.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.nombre} ({ROLE_LABELS[u.role]})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Usuario topf2f</label>
                  <input className="input" value={form.topf2f_user} placeholder="ej: 10026"
                    onChange={e => setForm(f => ({...f, topf2f_user: e.target.value}))}/>
                </div>
                <div>
                  <label className="label">Contraseña topf2f</label>
                  <input className="input" type="password" value={form.topf2f_pass}
                    autoComplete="off"
                    onChange={e => setForm(f => ({...f, topf2f_pass: e.target.value}))}/>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="activo" checked={form.activo}
                  onChange={e => setForm(f => ({...f, activo: e.target.checked}))}
                  className="rounded"/>
                <label htmlFor="activo" className="text-sm text-gray-700">Usuario activo</label>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </div>

            <div className="flex gap-3 p-5 border-t justify-end">
              <button onClick={() => setModal(null)} className="btn-secondary">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary gap-2">
                <Check size={15}/>{saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
