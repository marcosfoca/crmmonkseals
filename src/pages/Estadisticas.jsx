import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/auth.js'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts'

const OK_COLOR = '#094f82'  // brand-blue — OK (bottom)
const KO_COLOR = '#cc0000'  // brand-red  — KO (top)

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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

// Stacked bar: blue OK (bottom) + red KO (top). Shows volume AND quality together.
function StackedBar({ data, xKey, height = 200 }) {
  const hasData = data?.some(d => (d.ok || 0) + (d.ko || 0) > 0)
  if (!hasData) {
    return (
      <div className="flex items-center justify-center text-gray-400 text-sm" style={{ height }}>
        Sin datos suficientes
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }}/>
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false}/>
        <Tooltip
          formatter={(value, name) => [value, name]}
          labelFormatter={l => `${l}`}
        />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }}/>
        <Bar dataKey="ok" name="OK (Socio)" fill={OK_COLOR} stackId="a"/>
        <Bar dataKey="ko" name="KO"         fill={KO_COLOR} stackId="a" radius={[4,4,0,0]}/>
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
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-bold text-gray-900">Estadísticas del equipo</h1>

      {/* ── KPIs ── */}
      <Section title="Resumen general">
        <KPIRow items={[
          { label: 'Total socios',         value: data.total },
          { label: 'Edad media',           value: data.edad_media ? `${data.edad_media} años` : null },
          { label: 'Cuota media',          value: data.cuota_media ? `${data.cuota_media}€` : null },
          { label: 'Socios con llamada ✓', value: data.llamada_ok },
        ]}/>
      </Section>

      {/* ── Volumen por tiempo ── */}
      <Section title="Volumen de ventas (socios con llamada ✓)">
        <div className="flex gap-2">
          {[['mes','Por meses'],['semana','Por semanas'],['dia','Por día semana']].map(([v,l]) => (
            <button key={v} onClick={() => setVol(v)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                volumen === v ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>{l}</button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={volData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
            <XAxis dataKey="label" tick={{ fontSize: 11 }}/>
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false}/>
            <Tooltip/>
            <Bar dataKey="socios" name="Socios" fill={OK_COLOR} radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* ── Cuota por estado (ticket medio) ── */}
      <Section title="Cuota media por estado (€)">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.cuota_por_estado} layout="vertical"
            margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
            <XAxis type="number" tick={{ fontSize: 11 }}/>
            <YAxis dataKey="estado" type="category" tick={{ fontSize: 10 }} width={90}/>
            <Tooltip formatter={v => `${v}€`}/>
            <Bar dataKey="cuota_media" name="Cuota media (€)" fill={OK_COLOR} radius={[0,4,4,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* ── Calidad por perfil — stacked ok/ko ── */}
      <Section title="Calidad de socio por perfil (azul = OK · rojo = KO)">
        <p className="text-xs text-gray-400 -mt-1">
          Cada barra muestra el total de socios del grupo dividido en OK (azul, abajo) y KO (rojo, arriba).
          Compara volumen y calidad al mismo tiempo.
        </p>

        <div className="grid md:grid-cols-2 gap-6">

          {/* Por tramo de aportación */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por tramo de aportación</h3>
            <StackedBar data={data.por_cuota_tramo} xKey="tramo"/>
          </div>

          {/* Por sexo */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por sexo</h3>
            <StackedBar data={data.por_sexo} xKey="sexo"/>
          </div>

          {/* Por ONG */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por ONG</h3>
            <StackedBar data={data.por_ong} xKey="ong"/>
          </div>

          {/* Por tipo documento */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por tipo de documento</h3>
            <StackedBar data={data.por_documento} xKey="tipo"/>
          </div>

          {/* Por tramo de edad */}
          <div className="md:col-span-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por tramo de edad</h3>
            {data.edad_media
              ? <p className="text-xs text-gray-500 mb-2">
                  Media: <strong>{data.edad_media} años</strong>
                  {data.edad_moda ? <> · Más común: <strong>{data.edad_moda} años</strong></> : null}
                </p>
              : <p className="text-xs text-gray-400 mb-2">Sin datos de edad — el campo fecha de nacimiento no se extrae del sync automático.</p>
            }
            <StackedBar data={data.edad_tramos} xKey="tramo" height={180}/>
          </div>

        </div>
      </Section>
    </div>
  )
}
