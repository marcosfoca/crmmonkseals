import { useEffect, useState } from 'react'
import { apiFetch, ROLE_LABELS, ROLES } from '../lib/auth.js'
import { UserPlus, Pencil, Trash2, X, Check, Eye, EyeOff, RefreshCw } from 'lucide-react'

const ROLE_OPTIONS = Object.entries(ROLE_LABELS)
  .filter(([k]) => Number(k) !== ROLES.ADMIN)
  .sort((a, b) => a[0] - b[0])

function titleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

// "MARCOS FORTIS CARRETERO" → { nombre: "Marcos", apellidos: "Fortis Carretero" }
function parseCaptadorName(raw) {
  if (!raw?.trim()) return { nombre: '', apellidos: '' }
  const words = raw.trim().split(/\s+/)
  return {
    nombre:    titleCase(words[0] || ''),
    apellidos: words.slice(1).map(titleCase).join(' '),
  }
}

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
  role: 1, parent_id: '', activo: true,
  es_raiz: false,
  topf2f_user: '', topf2f_pass: '',
  topf2f_captador_nombre: '',
}

export default function Admin() {
  const [users, setUsers]             = useState([])
  const [loading, setLoad]            = useState(true)
  const [modal, setModal]             = useState(null)
  const [form, setForm]               = useState(EMPTY_FORM)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [showPw, setShowPw]           = useState(false)
  const [editId, setEditId]           = useState(null)
  const [captadores, setCaptadores]   = useState([])
  const [captLoad, setCaptLoad]       = useState(false)
  const [captErr, setCaptErr]         = useState('')

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoad(true)
    const res = await apiFetch('/api/users')
    if (res?.ok) setUsers(await res.json())
    setLoad(false)
  }

  async function loadCaptadores() {
    setCaptLoad(true); setCaptErr('')
    try {
      const res = await apiFetch('/api/topf2f/captadores')
      if (!res) { setCaptLoad(false); return }
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setCaptadores(data.captadores || [])
      }
      else setCaptErr(data.error || 'Error al cargar captadores de topf2f')
    } catch (e) {
      setCaptErr('Error de red: ' + e.message)
    } finally {
      setCaptLoad(false)
    }
  }

  function openCreate() {
    setForm(EMPTY_FORM); setError(''); setEditId(null); setModal('create')
    loadCaptadores()
  }

  function openEdit(u) {
    const esRaiz = !!u.topf2f_user
    setForm({
      username: u.username, password: '', nombre: u.nombre,
      apellidos: u.apellidos || '', role: u.role,
      parent_id: u.parent_id || '', activo: u.activo,
      es_raiz: esRaiz,
      topf2f_user: u.topf2f_user || '', topf2f_pass: '',
      topf2f_captador_nombre: u.topf2f_captador_nombre || '',
    })
    setEditId(u.id); setError(''); setModal('edit')
    if (!esRaiz) loadCaptadores()
  }

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function handleCaptadorSelect(raw) {
    const { nombre, apellidos } = parseCaptadorName(raw)
    setForm(f => ({ ...f, topf2f_captador_nombre: raw, nombre, apellidos }))
  }

  function toggleRaiz(checked) {
    setForm(f => ({
      ...f,
      es_raiz: checked,
      topf2f_user: '', topf2f_pass: '',
      topf2f_captador_nombre: '',
      nombre: '', apellidos: '',
    }))
    if (!checked) loadCaptadores()
  }

  async function handleSave() {
    setSaving(true); setError('')
    try {
      const body = {
        username: form.username, password: form.password || undefined,
        nombre: form.nombre, apellidos: form.apellidos,
        role: form.role, parent_id: form.parent_id, activo: form.activo,
        topf2f_user:            form.es_raiz ? form.topf2f_user : '',
        topf2f_pass:            form.es_raiz ? form.topf2f_pass : '',
        topf2f_captador_nombre: !form.es_raiz ? form.topf2f_captador_nombre : '',
      }
      if (modal === 'edit' && !body.password) delete body.password

      const res = modal === 'create'
        ? await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(body) })
        : await apiFetch(`/api/users/${editId}`, { method: 'PUT', body: JSON.stringify(body) })

      if (!res) { setSaving(false); return }
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Administración</h1>
          <p className="text-xs text-gray-400 mt-0.5">Usuarios, rangos y accesos</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <UserPlus size={15}/><span className="hidden sm:inline">Nuevo usuario</span>
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Cargando...</div>
        ) : (
          <>
            {/* Mobile */}
            <ul className="md:hidden divide-y divide-gray-100">
              {users.map(u => (
                <li key={u.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{u.nombre} {u.apellidos}</span>
                      <span className={`badge ${ROLE_BADGE[u.role] || 'bg-gray-100 text-gray-700'}`}>
                        {ROLE_LABELS[u.role]}
                      </span>
                      {!u.activo && <span className="badge bg-red-100 text-red-700">Inactivo</span>}
                    </div>
                    <div className="text-xs text-gray-400 font-mono mt-0.5">@{u.username}</div>
                    {u.topf2f_user && (
                      <div className="text-xs text-gray-400">topf2f raíz: {u.topf2f_user}</div>
                    )}
                    {u.topf2f_captador_nombre && (
                      <div className="text-xs text-gray-400">{titleCase(u.topf2f_captador_nombre)}</div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(u)}
                      className="p-2 rounded-lg text-gray-400 hover:text-brand-blue hover:bg-blue-50 transition-colors">
                      <Pencil size={15}/>
                    </button>
                    <button onClick={() => handleDelete(u.id, u.nombre)}
                      className="p-2 rounded-lg text-gray-400 hover:text-brand-red hover:bg-red-50 transition-colors">
                      <Trash2 size={15}/>
                    </button>
                  </div>
                </li>
              ))}
              {users.length === 0 && (
                <li className="text-center py-8 text-gray-400 text-sm">Sin usuarios</li>
              )}
            </ul>

            {/* Desktop */}
            <table className="hidden md:table w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Nombre','Usuario','Rango','Responsable de','Enlace topf2f','Estado',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => {
                  const children = users.filter(c => c.parent_id === u.id)
                  const topfLabel = u.topf2f_user
                    ? `raíz: ${u.topf2f_user}`
                    : u.topf2f_captador_nombre
                    ? titleCase(u.topf2f_captador_nombre)
                    : '—'
                  return (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{u.nombre} {u.apellidos}</td>
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
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono">{topfLabel}</td>
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
                {users.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">Sin usuarios</td></tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-bold text-base">
                {modal === 'create' ? 'Nuevo usuario' : 'Editar usuario'}
              </h2>
              <button onClick={() => setModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={18}/>
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              {/* Nombre + Apellidos — only shown for root/manual users */}
              {form.es_raiz && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Nombre *</label>
                    <input className="input" value={form.nombre}
                      onChange={e => setField('nombre', e.target.value)}/>
                  </div>
                  <div>
                    <label className="label">Apellidos</label>
                    <input className="input" value={form.apellidos}
                      onChange={e => setField('apellidos', e.target.value)}/>
                  </div>
                </div>
              )}

              {/* Usuario + Contraseña */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Usuario *</label>
                  <input className="input" value={form.username} autoComplete="off"
                    onChange={e => setField('username', e.target.value)}/>
                </div>
                <div>
                  <label className="label">
                    Contraseña{modal === 'edit' && <span className="normal-case text-gray-400 font-normal ml-1">(vacío = no cambiar)</span>}
                  </label>
                  <div className="relative">
                    <input className="input pr-9" type={showPw ? 'text' : 'password'}
                      value={form.password} autoComplete="new-password"
                      onChange={e => setField('password', e.target.value)}/>
                    <button type="button" tabIndex={-1} onClick={() => setShowPw(p=>!p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                    </button>
                  </div>
                </div>
              </div>

              {/* Rango + Superior */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Rango *</label>
                  <select className="input" value={form.role}
                    onChange={e => setField('role', Number(e.target.value))}>
                    {ROLE_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Superior directo</label>
                  <select className="input" value={form.parent_id}
                    onChange={e => setField('parent_id', e.target.value)}>
                    <option value="">— Sin responsable —</option>
                    {parentOptions.map(u => (
                      <option key={u.id} value={u.id}>{u.nombre} ({ROLE_LABELS[u.role]})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* topf2f section */}
              <div className="border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Enlace con topf2f</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.es_raiz}
                      onChange={e => toggleRaiz(e.target.checked)}
                      className="rounded"/>
                    <span className="text-xs text-gray-600">Estructura propia (raíz)</span>
                  </label>
                </div>

                {form.es_raiz ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Usuario topf2f</label>
                      <input className="input" value={form.topf2f_user} placeholder="ej: 10026"
                        onChange={e => setField('topf2f_user', e.target.value)}/>
                    </div>
                    <div>
                      <label className="label">Contraseña topf2f</label>
                      <input className="input" type="password" value={form.topf2f_pass}
                        autoComplete="off"
                        onChange={e => setField('topf2f_pass', e.target.value)}/>
                    </div>
                    <p className="col-span-2 text-xs text-gray-400">
                      Este usuario gestiona su propia estructura en topf2f y puede sincronizar.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="label flex items-center justify-between">
                      <span>Captador en topf2f</span>
                      <button type="button" onClick={loadCaptadores}
                        className="text-gray-400 hover:text-brand-blue"
                        title="Recargar lista">
                        <RefreshCw size={12} className={captLoad ? 'animate-spin' : ''}/>
                      </button>
                    </label>
                    {captErr && (
                      <p className="text-xs text-red-500 mb-1">{captErr}</p>
                    )}
                    <select className="input" value={form.topf2f_captador_nombre}
                      onChange={e => handleCaptadorSelect(e.target.value)}
                      disabled={captLoad}>
                      <option value="">— Sin enlazar —</option>
                      {captLoad && <option disabled>Cargando de topf2f…</option>}
                      {captadores.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    {form.topf2f_captador_nombre && form.nombre && (
                      <p className="text-sm font-medium text-gray-700 mt-1.5">
                        {form.nombre} {form.apellidos}
                      </p>
                    )}
                    {!form.topf2f_captador_nombre && (
                      <p className="text-xs text-gray-400 mt-1">
                        El nombre se tomará del captador seleccionado.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Activo */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.activo}
                  onChange={e => setField('activo', e.target.checked)}
                  className="rounded"/>
                <span className="text-sm text-gray-700">Usuario activo</span>
              </label>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </div>

            <div className="flex gap-3 px-5 py-4 border-t justify-end sticky bottom-0 bg-white">
              <button onClick={() => setModal(null)} className="btn-secondary">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                <Check size={15}/>{saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
