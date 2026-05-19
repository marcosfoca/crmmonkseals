import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { apiFetch, ROLE_LABELS } from '../lib/auth.js'
import { Users, TrendingUp, Clock, CheckCircle, RefreshCw } from 'lucide-react'
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
      <div className={`${colors[color]} rounded-xl p-3`}>
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
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

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

  const today = format(new Date(), "EEEE d 'de' MMMM", { locale: es })

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
        <div className="flex flex-col items-end gap-1">
          <button onClick={handleSync} disabled={syncing}
            className="btn-secondary gap-2">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''}/>
            {syncing ? 'Sincronizando...' : 'Sincronizar con topf2f'}
          </button>
          {syncMsg && (
            <span className={`text-xs ${syncMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
              {syncMsg}
            </span>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users}       label="Total socios"     value={stats?.total}      color="blue" />
        <StatCard icon={CheckCircle} label="Socios OK"        value={stats?.socios_ok}  color="green" />
        <StatCard icon={Clock}       label="En proceso"       value={stats?.en_proceso} color="gray" />
        <StatCard icon={TrendingUp}  label="Este mes"         value={stats?.este_mes}   color="blue"
          sub={stats?.cuota_media ? `${stats.cuota_media}€ cuota media` : null}/>
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
