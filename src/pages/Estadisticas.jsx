import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/auth.js'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts'

const OK_COLOR  = '#094f82'
const VOL_COLOR = '#0ea5e9'
const CUO_COLOR = '#7c3aed'

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
      {items.map(({ label, value }) => (
        <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-brand-blue">{value ?? '—'}</div>
          <div className="text-xs text-gray-500 mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  )
}

function SimpleBar({ data, xKey, dataKey = 'total', name = 'Socios', height = 190, unit = '', color = VOL_COLOR }) {
  if (!data?.length) return (
    <div className="flex items-center justify-center text-gray-400 text-sm" style={{ height }}>Sin datos</div>
  )
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 8, left: -18, bottom: 5 }} barCategoryGap="40%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
        <XAxis dataKey={xKey} tick={{ fontSize: 10 }}/>
        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} unit={unit}/>
        <Tooltip formatter={v => [`${v}${unit}`, name]} contentStyle={{ fontSize: 12, borderRadius: 8 }}/>
        <Bar dataKey={dataKey} name={name} fill={color} radius={[4,4,0,0]} maxBarSize={36}/>
      </BarChart>
    </ResponsiveContainer>
  )
}

// % OK bar — always shows all items (including 0 totals). Average line uses only items with data.
function PctBar({ data, xKey, height = 190 }) {
  const pctData = (data || []).map(d => ({
    ...d,
    pct: d.total > 0 ? Math.round(d.ok / d.total * 100) : 0
  }))

  if (!pctData.length) return (
    <div className="flex items-center justify-center text-gray-400 text-sm" style={{ height }}>Sin datos</div>
  )

  const withData = pctData.filter(d => d.total > 0)
  const avg = withData.length
    ? Math.round(withData.reduce((s, d) => s + d.pct, 0) / withData.length)
    : null

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={pctData} margin={{ top: 5, right: 8, left: -10, bottom: 5 }} barCategoryGap="40%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
        <XAxis dataKey={xKey} tick={{ fontSize: 10 }}/>
        <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} unit="%"/>
        <Tooltip
          formatter={(v, _, props) => [
            `${v}% (${props.payload.ok} OK / ${props.payload.total} total)`, '% OK'
          ]}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        {avg != null && (
          <ReferenceLine y={avg} stroke="#f59e0b" strokeDasharray="4 2"
            label={{ value: `media ${avg}%`, fontSize: 9, fill: '#b45309', position: 'insideTopRight' }}/>
        )}
        <Bar dataKey="pct" name="% OK" fill={OK_COLOR} radius={[4,4,0,0]} maxBarSize={36}/>
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

  const totalOk = (data.por_ong || []).reduce((s, o) => s + o.ok, 0)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-gray-900">Estadísticas</h1>

      {/* KPIs */}
      <Section title="Resumen general">
        <KPIRow items={[
          { label: 'Total socios',         value: data.total },
          { label: 'Cuota media',          value: data.cuota_media ? `${data.cuota_media}€` : null },
          { label: 'Socios con llamada ✓', value: data.llamada_ok },
          { label: 'Socios OK (SOCIO)',    value: totalOk || null },
        ]}/>
      </Section>

      {/* VOLUMEN */}
      <Section title="Volumen  ·  total de socios por grupo">
        <p className="text-xs text-gray-400 -mt-2">Cuántos socios hay en cada grupo, sin distinguir estado.</p>

        <div>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">Alta por fecha (socios con llamada ✓)</h3>
            <div className="flex gap-1">
              {[['mes','Meses'],['semana','Semanas'],['dia','Día semana']].map(([v,l]) => (
                <button key={v} onClick={() => setVol(v)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    volumen === v ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>{l}</button>
              ))}
            </div>
          </div>
          <SimpleBar data={volData} xKey="label" dataKey="socios" name="Socios" height={200}/>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por ONG</h3>
            <SimpleBar data={data.por_ong} xKey="ong" dataKey="total"/>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por tramo de aportación</h3>
            <SimpleBar data={data.por_cuota_tramo} xKey="tramo" dataKey="total"/>
          </div>
        </div>
      </Section>

      {/* CALIDAD */}
      <Section title="Calidad  ·  % de socios OK por grupo">
        <p className="text-xs text-gray-400 -mt-2">
          Porcentaje de socios con estado SOCIO. La línea amarilla muestra la media.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por ONG</h3>
            <PctBar data={data.por_ong} xKey="ong"/>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Por tramo de aportación</h3>
            <PctBar data={data.por_cuota_tramo} xKey="tramo"/>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">% OK por tramo de edad</h3>
            <PctBar data={data.edad_tramos} xKey="tramo"/>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Cuota media por tramo de edad (€)</h3>
            <SimpleBar
              data={data.edad_tramos || []}
              xKey="tramo" dataKey="cuota_media" name="Cuota media (€)"
              unit="€" color={CUO_COLOR}
            />
          </div>
        </div>
      </Section>
    </div>
  )
}
