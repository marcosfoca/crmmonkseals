import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { apiFetch, ROLE_LABELS, ROLES } from '../lib/auth.js'
import { Users, Calendar, Flame, PhoneCall, RefreshCw, TrendingUp } from 'lucide-react'
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

function RachaChip({ racha }) {
  if (!racha) return <span className="text-gray-400 text-xs">—</span>
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${racha >= 5 ? 'text-orange-600' : racha >= 2 ? 'text-amber-600' : 'text-gray-500'}`}>
      {racha >= 3 && '🔥'}{racha}d
    </span>
  )
}

function CaptadoresTable({ captadores, userId }) {
  if (!captadores?.length) return (
    <div className="text-center py-8 text-gray-400 text-sm">Sin datos de captadores</div>
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-6">#</th>
            <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Captador</th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Total</th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">30d</th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Racha</th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">Cuota</th>
            <th className="text-right py-2 pl-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">% ✓</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {captadores.map((c, i) => (
            <tr key={c.captador_id}
              className={`transition-colors ${c.captador_id === userId ? 'bg-blue-50/60 font-semibold' : 'hover:bg-gray-50'}`}>
              <td className="py-2 pr-3 text-gray-400 text-xs">{i + 1}</td>
              <td className="py-2 pr-3 text-gray-900 max-w-[140px] truncate">
                {c.nombre}
                {c.captador_id === userId && <span className="ml-1.5 text-xs text-brand-blue font-normal">(tú)</span>}
              </td>
              <td className="py-2 px-2 text-right font-bold text-gray-900">{c.total}</td>
              <td className="py-2 px-2 text-right text-gray-600 hidden sm:table-cell">{c.ultimos_30 ?? '—'}</td>
              <td className="py-2 px-2 text-right hidden sm:table-cell"><RachaChip racha={c.racha}/></td>
              <td className="py-2 px-2 text-right text-gray-600 hidden md:table-cell">
                {c.cuota_media ? `${c.cuota_media}€` : '—'}
              </td>
              <td className="py-2 pl-2 text-right">
                {c.llamada_pct_30 != null
                  ? <span className={`text-xs font-semibold ${c.llamada_pct_30 >= 80 ? 'text-green-600' : c.llamada_pct_30 >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                      {c.llamada_pct_30}%
                    </span>
                  : <span className="text-gray-300 text-xs">—</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats]         = useState(null)
  const [equipo, setEquipo]       = useState(null)
  const [syncing, setSyncing]     = useState(false)
  const [syncMsg, setSyncMsg]     = useState('')
  const [backfilling, setBackfilling] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState('')

  const isLider = user?.role > ROLES.CAPTADOR

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [sRes, eRes] = await Promise.all([
      apiFetch('/api/socios/stats?scope=personal'),
      isLider ? apiFetch('/api/socios/equipo-captadores') : Promise.resolve(null),
    ])
    if (sRes?.ok) setStats(await sRes.json())
    if (eRes?.ok) setEquipo(await eRes.json())
  }

  async function handleSync() {
    setSyncing(true); setSyncMsg('')
    try {
      const res = await apiFetch('/api/sync', { method: 'POST' })
      if (!res) { setSyncing(false); return }
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const main = `✓ Sync OK — ${data.new} nuevos, ${data.updated} actualizados`
        setSyncMsg(data.debug ? `${main} · ${data.debug}` : main)
        loadAll()
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
    setBackfilling(true); setBackfillMsg('')
    try {
      const res = await apiFetch('/api/backfill-dob', { method: 'POST' })
      if (!res) { setBackfilling(false); return }
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const accounts = (data.accountResults || [])
          .map(a => `${a.user}: ${a.socios}${a.error ? ' ✗' : ''}`)
          .join(', ')
        setBackfillMsg(`✓ DOB rellenados: ${data.updated} actualizados · ${data.dobFound} con DOB (${accounts})`)
        loadAll()
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
                  title="Rellena fecha de nacimiento histórica"
                  className="btn-secondary gap-2 text-purple-700 border-purple-200 hover:bg-purple-50">
                  <RefreshCw size={14} className={backfilling ? 'animate-spin' : ''}/>
                  {backfilling ? 'Rellenando...' : 'Rellenar DOB'}
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

      {/* Personal stats */}
      <div>
        {isLider && (
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Mi producción</h2>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Users}    label="Mis socios"      value={stats?.total}          color="blue"/>
          <StatCard icon={Calendar} label="Últimos 30 días" value={stats?.ultimos_30}      color="green"/>
          <StatCard icon={Flame}    label="Racha actual"    value={rachaLabel}             color="red"/>
          <StatCard icon={PhoneCall} label="Llamada OK (30d)"
            value={stats?.llamada_pct_30 != null ? `${stats.llamada_pct_30}%` : '—'}
            color="blue"
            sub={stats?.cuota_media ? `${stats.cuota_media}€ cuota media` : null}/>
        </div>
      </div>

      {/* Team captadores table */}
      {isLider && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={15} className="text-brand-blue"/>
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Ranking del equipo</h2>
            {equipo?.captadores && (
              <span className="ml-auto text-xs text-gray-400">{equipo.captadores.length} captadores</span>
            )}
          </div>
          {equipo
            ? <CaptadoresTable captadores={equipo.captadores} userId={user?.id}/>
            : <div className="text-center py-6 text-gray-400 text-sm">Cargando equipo...</div>
          }
        </div>
      )}

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
