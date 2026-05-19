import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/auth.js'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line, ResponsiveContainer
} from 'recharts'

const COLORS = ['#094f82','#cc0000','#16a34a','#d97706','#7c3aed','#0891b2']

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

export default function Estadisticas() {
  const [data, setData]     = useState(null)
  const [loading, setLoad]  = useState(true)
  const [volumen, setVol]   = useState('mes') // mes | semana | dia

  useEffect(() => {
    apiFetch('/api/socios/estadisticas').then(async r => {
      if (r?.ok) setData(await r.json())
      setLoad(false)
    })
  }, [])

  if (loading) return <div className="text-center py-20 text-gray-400">Cargando estadísticas...</div>
  if (!data)   return <div className="text-center py-20 text-red-500">Error al cargar datos</div>

  const volData = volumen === 'mes'    ? data.volumen_por_mes
               : volumen === 'semana'  ? data.volumen_por_semana
               : data.volumen_por_dia

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-bold text-gray-900">Estadísticas del equipo</h1>

      {/* ── KPIs generales ── */}
      <Section title="Resumen general">
        <KPIRow items={[
          { label: 'Total socios',      value: data.total },
          { label: 'Edad media',        value: data.edad_media ? `${data.edad_media} años` : null },
          { label: 'Cuota media',       value: data.cuota_media ? `${data.cuota_media}€` : null },
          { label: 'Socios con llamada OK', value: data.llamada_ok },
        ]}/>
      </Section>

      {/* ── Volumen de ventas por tiempo ── */}
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
            <YAxis tick={{ fontSize: 11 }}/>
            <Tooltip/>
            <Bar dataKey="socios" name="Socios" fill={COLORS[0]} radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* ── Distribución por edad ── */}
      <div className="grid md:grid-cols-2 gap-5">
        <Section title="Distribución por tramo de edad">
          <div className="flex gap-6 text-sm text-gray-600 mb-2">
            <span>Media: <strong>{data.edad_media} años</strong></span>
            <span>Más común: <strong>{data.edad_moda}</strong></span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.edad_tramos} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="tramo" tick={{ fontSize: 11 }}/>
              <YAxis tick={{ fontSize: 11 }}/>
              <Tooltip/>
              <Bar dataKey="total" name="Socios" fill={COLORS[1]} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Section>

        {/* ── Aportaciones por estado ── */}
        <Section title="Cuotas por estado (OK / KO / Otros)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.cuota_por_estado} layout="vertical"
              margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis type="number" tick={{ fontSize: 11 }}/>
              <YAxis dataKey="estado" type="category" tick={{ fontSize: 10 }} width={90}/>
              <Tooltip formatter={(v) => `${v}€`}/>
              <Bar dataKey="cuota_media" name="Cuota media (€)" fill={COLORS[0]} radius={[0,4,4,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>

      {/* ── Calidad de perfil ── */}
      <Section title="Calidad de socio por perfil">
        <p className="text-xs text-gray-400 mb-2">
          Cuota media y % de socios OK según cada variable — interpreta qué perfil te funciona mejor.
        </p>
        <div className="grid md:grid-cols-2 gap-6">

          {/* Por sexo */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por sexo</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.por_sexo}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="sexo" tick={{ fontSize: 11 }}/>
                <YAxis tick={{ fontSize: 11 }}/>
                <Tooltip/>
                <Bar dataKey="cuota_media" name="Cuota media (€)" fill={COLORS[2]} radius={[4,4,0,0]}/>
                <Bar dataKey="pct_ok" name="% OK" fill={COLORS[3]} radius={[4,4,0,0]}/>
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Por tipo documento */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por tipo de documento</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.por_documento}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="tipo" tick={{ fontSize: 11 }}/>
                <YAxis tick={{ fontSize: 11 }}/>
                <Tooltip/>
                <Bar dataKey="cuota_media" name="Cuota media (€)" fill={COLORS[4]} radius={[4,4,0,0]}/>
                <Bar dataKey="pct_ok" name="% OK" fill={COLORS[5]} radius={[4,4,0,0]}/>
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Por ONG */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por ONG</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.por_ong}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="ong" tick={{ fontSize: 11 }}/>
                <YAxis tick={{ fontSize: 11 }}/>
                <Tooltip/>
                <Bar dataKey="cuota_media" name="Cuota media (€)" fill={COLORS[0]} radius={[4,4,0,0]}/>
                <Bar dataKey="pct_ok" name="% OK" fill={COLORS[1]} radius={[4,4,0,0]}/>
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Por tramo aportación */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por tramo de aportación</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.por_cuota_tramo}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="tramo" tick={{ fontSize: 11 }}/>
                <YAxis tick={{ fontSize: 11 }}/>
                <Tooltip/>
                <Bar dataKey="total" name="Socios" fill={COLORS[2]} radius={[4,4,0,0]}/>
                <Bar dataKey="pct_ok" name="% OK" fill={COLORS[3]} radius={[4,4,0,0]}/>
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>
    </div>
  )
}
