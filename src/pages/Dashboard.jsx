import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { apiFetch, ROLE_LABELS } from '../lib/auth.js'
import { Users, Calendar, Flame, PhoneCall, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

function StatCard({ icon: Icon, label, value, color = 'blue', sub }) {
  const colors = {
    blue:  'bg-blue-50 text-brand-blue',
    green: 'bg-green-50 text-green-700',
    red:   'bg-red-50 text-brand-red',
    gray:  'bg-gray-50 text-gray-600',
  }
  return (
    <div className="card flex items-center gap-4">
      <div className={`${colors[color]} rounded-xl p-3 shrink-0`}>
        <Icon size={22}/>
      </div>
      <div>
        <div className="text-2xl font-bold">{value ?? '—'}</div>
        <div className="text-xs text-gray-500 font-medium">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats]     = useState(null)
  const [syncing, setSyncing]   = useState(false)
  const [syncMsg, setSyncMsg]   = useState('')
  const [backfilling, setBackfilling] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState('')

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    const res = await apiFetch('/api/socios/stats')
    if (res?.ok) setStats(await res.json())
  }

  async function handleSync() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await apiFetch('/api/sync', { method: 'POST' })
      if (!res) { setSyncing(false); return }
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const main = `✓ Sync OK — ${data.new} nuevos, ${data.updated} actualizados`
        setSyncMsg(data.debug ? `${main} · ${data.debug}` : main)
        loadStats()
      } else {
        setSyncMsg(`✗ ${data?.error || 'Error al sincronizar'}`)
      }
    } catch (err) {
      setSyncMsg(`✗ Error de red: ${err.message}`)
    } finally {
      setSyncing(false)
    }
  }

  async function handleBackfillDob() {
    setBackfilling(true)
    setBackfillMsg('')
    try {
      const res = await apiFetch('/api/backfill-dob', { method: 'POST' })
      if (!res) { setBackfilling(false); return }
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setBackfillMsg(`✓ DOB rellenados: ${data.updated} socios actualizados (${data.dobFound} encontrados en topf2f)`)
        loadStats()
      } else {
        setBackfillMsg(`✗ ${data?.error || 'Error'}`)
      }
    } catch (err) {
      setBackfillMsg(`✗ ${err.message}`)
    } finally {
      setBackfilling(false)
    }
  }

  const today = format(new Date(), "EEEE d 'de' MMMM", { locale: es })

  const rachaLabel = stats?.racha
    ? `${stats.racha} día${stats.racha !== 1 ? 's' : ''} seguido${stats.racha !== 1 ? 's' : ''}`
    : '0'

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Hola, {user?.nombre?.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-gray-500 capitalize mt-0.5">{today}</p>
        </div>
        {user?.topf2f_user && (
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex gap-2">
              <button onClick={handleSync} disabled={syncing || backfilling}
                className="btn-secondary gap-2">
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''}/>
                {syncing ? 'Sincronizando...' : 'Sincronizar'}
              </button>
              {user?.role >= 90 && (
                <button onClick={handleBackfillDob} disabled={syncing || backfilling}
                  title="Rellena fecha de nacimiento histórica mes a mes desde topf2f"
                  className="btn-secondary gap-2 text-purple-700 border-purple-200 hover:bg-purple-50">
                  <RefreshCw size={14} className={backfilling ? 'animate-spin' : ''}/>
                  {backfilling ? 'Rellenando DOB...' : 'Rellenar DOB'}
                </button>
              )}
            </div>
            {syncMsg && (
              <span className={`text-xs max-w-xs text-right break-words ${syncMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
                {syncMsg}
              </span>
            )}
            {backfillMsg && (
              <span className={`text-xs max-w-xs text-right break-words ${backfillMsg.startsWith('✓') ? 'text-purple-600' : 'text-red-600'}`}>
                {backfillMsg}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total socios"
          value={stats?.total}
          color="blue"
        />
        <StatCard
          icon={Calendar}
          label="Últimos 30 días"
          value={stats?.ultimos_30}
          color="green"
        />
        <StatCard
          icon={Flame}
          label="Racha actual"
          value={rachaLabel}
          color="red"
        />
        <StatCard
          icon={PhoneCall}
          label="Llamada OK (30d)"
          value={stats?.llamada_pct_30 != null ? `${stats.llamada_pct_30}%` : '—'}
          color="blue"
          sub={stats?.cuota_media ? `${stats.cuota_media}€ cuota media` : null}
        />
      </div>

      {/* My info */}
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-3 text-sm uppercase tracking-wide">Mi perfil</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-400">Nombre</span>
            <div className="font-semibold">{user?.nombre} {user?.apellidos}</div>
          </div>
          <div>
            <span className="text-gray-400">Rango</span>
            <div className="font-semibold">{ROLE_LABELS[user?.role]}</div>
          </div>
          <div>
            <span className="text-gray-400">Usuario topf2f</span>
            <div className="font-semibold">{user?.topf2f_user || '—'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
