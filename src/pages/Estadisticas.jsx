import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/auth.js'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts'

const OK_COLOR = '#094f82'
const KO_COLOR = '#cc0000'

function Section({ title, children }) {
  return (
    <div className="card flex flex-col gap-4">
      <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide border-b border-gray-100 pb-2">{title}</h2>
      {children}
    </div>
  )
}

function KPIRow({ items }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {items.map(({ label, value, sub }) => (
        <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-brand-blue">{value ?? '—'}</div>
          <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          {sub && <div className="text-xs text-gray-400">{sub}</div>}
        </div>
      ))}
    </div>
  )
}

// Stacked bar: blue OK (bottom) + red KO (top).
// Always renders bars even when values are 0 so the chart is always visible.
function StackedBar({ data, xKey, height = 190 }) {
  if (!data?.length) return (
    <div className="flex items-center justify-center text-gray-400 text-sm" style={{ height }}>Sin datos</div>
  )
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 8, left: -18, bottom: 5 }} barCategoryGap="40%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
        <XAxis dataKey={xKey} tick={{ fontSize: 10 }}/>
        <YAxis tick={{ fontSize: 10 }} allowDecimals={false}/>
        <Tooltip
          formatter={(v, name) => [v, name]}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Legend iconSize={9} wrapperStyle={{ fontSize: 10 }}/>
        <Bar dataKey="ok" name="OK (Socio)" fill={OK_COLOR} stackId="a" maxBarSize={40}/>
        <Bar dataKey="ko" name="KO"         fill={KO_COLOR} stackId="a" radius={[4,4,0,0]} maxBarSize={40}/>
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function Estadisticas() {
  const [data, setData]    = useState(null)
  const [loading, setLoad] = useState(true)
  const [volumen, setVol]  = useState('mes')

  useEffect(() => {
    apiFetch('/api/socios/estadisticas').then(async r => {
      if (r?.ok) setData(await r.json())
      setLoad(false)
    }).catch(() => setLoad(false))
  }, [])

  if (loading) return <div className="text-center py-20 text-gray-400">Cargando estadísticas...</div>
  if (!data)   return <div className="text-center py-20 text-red-500">Error al cargar datos</div>

  const volData = volumen === 'mes'   ? data.volumen_por_mes
               : volumen === 'semana' ? data.volumen_por_semana
               : data.volumen_por_dia

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-gray-900">Estadísticas</h1>

      {/* KPIs */}
      <Section title="Resumen general">
        <KPIRow items={[
          { label: 'Total socios',         value: data.total },
          { label: 'Edad media',           value: data.edad_media ? `${data.edad_media} años` : null },
          { label: 'Cuota media',          value: data.cuota_media ? `${data.cuota_media}€` : null },
          { label: 'Socios con llamada ✓', value: data.llamada_ok },
        ]}/>
      </Section>

      {/* Volumen */}
      <Section title="Volumen de ventas (socios con llamada ✓)">
        <div className="flex gap-1.5 flex-wrap">
          {[['mes','Meses'],['semana','Semanas'],['dia','Día semana']].map(([v,l]) => (
            <button key={v} onClick={() => setVol(v)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                volumen === v ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>{l}</button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={volData} margin={{ top: 5, right: 8, left: -18, bottom: 5 }} barCategoryGap="40%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
            <XAxis dataKey="label" tick={{ fontSize: 10 }}/>
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false}/>
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}/>
            <Bar dataKey="socios" name="Socios" fill={OK_COLOR} radius={[4,4,0,0]} maxBarSize={40}/>
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* Cuota media por estado */}
      <Section title="Cuota media por estado (€)">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data.cuota_por_estado} layout="vertical"
            margin={{ top: 5, right: 16, left: 4, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
            <XAxis type="number" tick={{ fontSize: 10 }}/>
            <YAxis dataKey="estado" type="category" tick={{ fontSize: 9 }} width={95}/>
            <Tooltip formatter={v => `${v}€`} contentStyle={{ fontSize: 12, borderRadius: 8 }}/>
            <Bar dataKey="cuota_media" name="Cuota media (€)" fill={OK_COLOR} radius={[0,4,4,0]} maxBarSize={20}/>
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* Calidad por perfil */}
      <Section title="Calidad por perfil  ·  azul = OK · rojo = KO">
        <p className="text-xs text-gray-400 -mt-2">
          Cada barra muestra el total del grupo dividido en OK abajo (azul) y KO arriba (rojo).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por tramo de aportación</h3>
            <StackedBar data={data.por_cuota_tramo} xKey="tramo"/>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por ONG</h3>
            <StackedBar data={data.por_ong} xKey="ong"/>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por tipo de documento</h3>
            <StackedBar data={data.por_documento} xKey="tipo"/>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por tramo de edad</h3>
            {!data.edad_media && (
              <p className="text-xs text-gray-400 mb-1">
                La edad se calcula desde fecha de nacimiento del formulario. Sin datos aún.
              </p>
            )}
            <StackedBar data={data.edad_tramos} xKey="tramo"/>
          </div>

        </div>
      </Section>
    </div>
  )
}
