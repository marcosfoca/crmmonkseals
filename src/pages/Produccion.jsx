import { useEffect, useState, useCallback, useRef } from 'react'
import { apiFetch } from '../lib/auth.js'
import { Search, Filter, X, ChevronDown, ChevronUp } from 'lucide-react'
import { format } from 'date-fns'

const ESTADOS = [
  'EN PROCESO','SOCIO','BAJA','BAJA SOCIO LLAMA','CAMBIO DE FECHA',
  'INCIDENCIA','DONATIVO PUNTUAL','SOCIO TEMPORAL','ERRÓNEO',
  'TELÉFONO ERRÓNEO','ILOCALIZABLE'
]
const ONGS = ['CRUZ_ROJA','PLAN']

const ESTADO_COLORS = {
  'SOCIO':           'bg-green-100 text-green-800',
  'EN PROCESO':      'bg-yellow-100 text-yellow-800',
  'BAJA':            'bg-red-100 text-red-800',
  'BAJA SOCIO LLAMA':'bg-red-100 text-red-800',
  'DONATIVO PUNTUAL':'bg-purple-100 text-purple-800',
  'SOCIO TEMPORAL':  'bg-blue-100 text-blue-800',
  'INCIDENCIA':      'bg-orange-100 text-orange-800',
  'CAMBIO DE FECHA': 'bg-indigo-100 text-indigo-800',
}
function estadoBadge(estado) {
  return ESTADO_COLORS[estado] || 'bg-gray-100 text-gray-700'
}

function fmt(d) {
  if (!d || d === '--/--') return '—'
  try { return format(new Date(d), 'dd/MM/yy') }
  catch { return d }
}

export default function Produccion() {
  const [socios, setSocios]     = useState([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)
  const PER_PAGE = 50

  // Filters
  const [nombre, setNombre]     = useState('')
  const [dni, setDni]           = useState('')
  const [cuota, setCuota]       = useState('')
  const [estado, setEstado]     = useState('')
  const [ong, setOng]           = useState('')
  const [fechaDesde, setDesde]  = useState('')
  const [fechaHasta, setHasta]  = useState('')
  const [showFilters, setShowF] = useState(false)
  const [sortCol, setSortCol]   = useState('fecha_alta')
  const [sortDir, setSortDir]   = useState('desc')

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    const params = new URLSearchParams({
      page: p, per_page: PER_PAGE,
      sort: sortCol, dir: sortDir,
      ...(nombre && { nombre }),
      ...(dni    && { dni }),
      ...(cuota  && { cuota }),
      ...(estado && { estado }),
      ...(ong    && { ong }),
      ...(fechaDesde && { desde: fechaDesde }),
      ...(fechaHasta && { hasta: fechaHasta }),
    })
    const res = await apiFetch(`/api/socios?${params}`)
    if (res?.ok) {
      const data = await res.json()
      setSocios(data.socios)
      setTotal(data.total)
    }
    setLoading(false)
  }, [nombre, dni, cuota, estado, ong, fechaDesde, fechaHasta, sortCol, sortDir])

  const prevFilters = useRef(null)

  useEffect(() => {
    const filters = JSON.stringify({ nombre, dni, cuota, estado, ong, fechaDesde, fechaHasta, sortCol, sortDir })
    if (prevFilters.current !== null && prevFilters.current !== filters) {
      // Filters changed: reset page and load page 1
      setPage(1)
      load(1)
    } else {
      // Initial mount or page change from pagination
      load(page)
    }
    prevFilters.current = filters
  }, [page, nombre, dni, cuota, estado, ong, fechaDesde, fechaHasta, sortCol, sortDir])

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  function SortIcon({ col }) {
    if (sortCol !== col) return <ChevronDown size={12} className="opacity-30"/>
    return sortDir === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>
  }

  function clearFilters() {
    setNombre(''); setDni(''); setCuota(''); setEstado(''); setOng('')
    setDesde(''); setHasta('')
  }

  const hasFilters = nombre || dni || cuota || estado || ong || fechaDesde || fechaHasta
  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Producción
          <span className="ml-2 text-sm font-normal text-gray-400">{total} socios</span>
        </h1>
        <button onClick={() => setShowF(f => !f)}
          className={`btn-secondary gap-2 ${hasFilters ? 'border-brand-blue text-brand-blue' : ''}`}>
          <Filter size={14}/>
          Filtros {hasFilters && `(activos)`}
        </button>
      </div>

      {/* Search bar */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input className="input pl-8" placeholder="Buscar por nombre..."
            value={nombre} onChange={e => setNombre(e.target.value)}/>
        </div>
        <div className="relative w-44">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input className="input pl-8" placeholder="DNI / NIF..."
            value={dni} onChange={e => setDni(e.target.value)}/>
        </div>
        <div className="relative w-36">
          <input className="input" placeholder="Cuota (€)..." type="number"
            value={cuota} onChange={e => setCuota(e.target.value)}/>
        </div>
      </div>

      {/* Extended filters */}
      {showFilters && (
        <div className="card flex flex-wrap gap-4 items-end">
          <div className="min-w-40">
            <label className="label">Estado</label>
            <select className="input" value={estado} onChange={e => setEstado(e.target.value)}>
              <option value="">Todos</option>
              {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div className="min-w-32">
            <label className="label">ONG</label>
            <select className="input" value={ong} onChange={e => setOng(e.target.value)}>
              <option value="">Todas</option>
              {ONGS.map(o => <option key={o} value={o}>{o.replace('_',' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Fecha alta desde</label>
            <input type="date" className="input" value={fechaDesde} onChange={e => setDesde(e.target.value)}/>
          </div>
          <div>
            <label className="label">Fecha alta hasta</label>
            <input type="date" className="input" value={fechaHasta} onChange={e => setHasta(e.target.value)}/>
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="btn-secondary gap-1 self-end">
              <X size={13}/>Limpiar
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {/* ONG: sm+ */}
                <th className="hidden sm:table-cell text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort('ong')}>
                  <span className="flex items-center gap-1">ONG<SortIcon col="ong"/></span>
                </th>
                {/* Donante: always */}
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort('nombre')}>
                  <span className="flex items-center gap-1">Donante<SortIcon col="nombre"/></span>
                </th>
                {/* NIF: md+ */}
                <th className="hidden md:table-cell text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">NIF</th>
                {/* Cuota: always */}
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort('cuota')}>
                  <span className="flex items-center gap-1">Cuota<SortIcon col="cuota"/></span>
                </th>
                {/* Estado: always */}
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort('estado')}>
                  <span className="flex items-center gap-1">Estado<SortIcon col="estado"/></span>
                </th>
                {/* Tipo: md+ */}
                <th className="hidden md:table-cell text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Tipo</th>
                {/* F.Alta: sm+ */}
                <th className="hidden sm:table-cell text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort('fecha_alta')}>
                  <span className="flex items-center gap-1">F. Alta<SortIcon col="fecha_alta"/></span>
                </th>
                {/* F.OKKO: md+ */}
                <th className="hidden md:table-cell text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort('fecha_okko')}>
                  <span className="flex items-center gap-1">F. OK/KO<SortIcon col="fecha_okko"/></span>
                </th>
                {/* Llamada: sm+ */}
                <th className="hidden sm:table-cell text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">✓</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">Cargando...</td></tr>
              ) : socios.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">Sin resultados</td></tr>
              ) : socios.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="hidden sm:table-cell px-3 py-2.5">
                    <span className={`badge ${s.ong === 'CRUZ_ROJA' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                      {s.ong === 'CRUZ_ROJA' ? 'CR' : s.ong || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-gray-900">
                    <div className="whitespace-nowrap">{[s.nombre, s.apellido1, s.apellido2].filter(Boolean).join(' ')}</div>
                    <div className="text-xs text-gray-400 font-mono">{s.num_formulario}</div>
                  </td>
                  <td className="hidden md:table-cell px-3 py-2.5 text-gray-500 font-mono text-xs">{s.nif || '—'}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">
                    {s.cuota ? `${s.cuota}€` : '—'}
                    <div className="text-xs text-gray-400 font-normal hidden sm:block">{s.periodicidad}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`badge ${estadoBadge(s.estado?.trim())}`}>
                      {s.estado?.trim() || '—'}
                    </span>
                  </td>
                  <td className="hidden md:table-cell px-3 py-2.5 text-xs text-gray-500">{s.tipo_socio || '—'}</td>
                  <td className="hidden sm:table-cell px-3 py-2.5 text-gray-500 whitespace-nowrap text-sm">{fmt(s.fecha_alta)}</td>
                  <td className="hidden md:table-cell px-3 py-2.5 text-gray-500 whitespace-nowrap text-sm">{fmt(s.fecha_okko)}</td>
                  <td className="hidden sm:table-cell px-3 py-2.5 text-center">
                    {s.llamada ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
            <span>Página {page} de {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                className="btn-secondary px-3 py-1 text-xs">Anterior</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
                className="btn-secondary px-3 py-1 text-xs">Siguiente</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
