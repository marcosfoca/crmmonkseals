import { useState, useRef } from 'react'
import { Camera, Bookmark, ExternalLink, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'

const IMPORTE_MAP = { '6':'325','10':'326','12':'327','15':'328','20':'329','25':'330','30':'331' }

function buildBookmarkletHref() {
  // Minified bookmarklet that reads #f2f= hash and fills the topf2f form
  const code = `(function(){var m=location.hash.match(/#f2f=([A-Za-z0-9+/=]+)/);if(!m){alert("Sin datos. Escanea primero.");return;}try{var d=JSON.parse(decodeURIComponent(escape(atob(m[1]))));var s=function(n,v){if(!v&&v!=="0")return;var e=document.querySelector('[name="'+n+'"]');if(e)e.value=v;};s("nombre",d.nombre);s("apellido1",d.apellido1);s("apellido2",d.apellido2);s("nif",d.nif);s("numdir",d.numdir);s("tlf1",d.tlf1);s("tlf2",d.tlf2);s("movil1",d.movil1);s("movil2",d.movil2);s("email",d.email);s("tipovia",d.tipovia);s("dirvia",d.dirvia);s("numvia",d.numvia);s("pisovia",d.pisovia);s("letravia",d.letravia);s("comp15",d.comp15);s("cp",d.cp);s("dirvia2",d.dirvia2);s("portalvia2b",d.portalvia2b);s("IBAN2",d.IBAN2);s("CB2",d.CB2);s("CS2",d.CS2);s("DC2",d.DC2);s("NC2",d.NC2);s("producto",d.producto);s("distribuidora1",d.distribuidora1);s("tarifa",d.tarifa);s("fecha_primercobro",d.fecha_primercobro);s("comp10",d.comp10);s("cupsE",d.cupsE);s("sppgas",d.sppgas);s("distribuidora2",d.distribuidora2);s("observaciones_llamada",d.observaciones_llamada);if(d.api){document.querySelectorAll('[name="API"]').forEach(function(r){r.checked=(r.value==d.api);});}alert("✓ Formulario rellenado.");}catch(ex){alert("Error: "+ex.message);}})();`
  return 'javascript:' + code
}

async function compressImage(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const maxDim = 1800
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      let q = 0.82, result
      do { result = canvas.toDataURL('image/jpeg', q); q -= 0.1 }
      while (result.length > 5_500_000 && q > 0.35)
      resolve(result)
    }
    img.src = dataUrl
  })
}

async function callAnalyzeAPI(base64) {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64 })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }
  const result = await res.json()
  const candidate = result.candidates?.[0]
  if (!candidate) throw new Error('Sin respuesta de la IA. Inténtalo de nuevo.')
  if (candidate.finishReason === 'SAFETY') throw new Error('Imagen bloqueada por filtros de seguridad.')
  const text = candidate.content?.parts?.[0]?.text?.trim()
  if (!text) throw new Error('Respuesta vacía. Inténtalo de nuevo.')
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No se reconocieron datos. Prueba con mejor iluminación.')
  return JSON.parse(match[0])
}

function buildFormUrl(d) {
  const iban = (d.iban_completo || '').replace(/[\s\-]/g, '').toUpperCase()
  const prod = IMPORTE_MAP[String(d.importe || '').trim()] || '0'
  const payload = {
    nombre: d.nombre || '', apellido1: d.apellido1 || '', apellido2: d.apellido2 || '',
    nif: (d.nif || '').replace(/[.\-\s]/g, '').toUpperCase(),
    numdir: d.numdir || '', tlf1: d.tlf1 || '', tlf2: d.tlf2 || '',
    movil1: d.movil1 || '', movil2: d.movil2 || '', email: d.email || '',
    tipovia: d.tipovia || 'Cl', dirvia: d.dirvia || '', numvia: d.numvia || '',
    pisovia: d.pisovia || '', letravia: d.letravia || '', comp15: d.comp15 || '',
    cp: d.cp || '', dirvia2: d.dirvia2 || '', portalvia2b: d.portalvia2b || '',
    IBAN2: iban.slice(0,4), CB2: iban.slice(4,8), CS2: iban.slice(8,12),
    DC2: iban.slice(12,14), NC2: iban.slice(14,24),
    producto: prod, distribuidora1: prod === '0' ? (d.importe || '') : '',
    tarifa: d.dia_cargo || '', fecha_primercobro: '',
    comp10: '3', cupsE: d.tipo_socio || '', sppgas: d.sexo || '0',
    distribuidora2: 'CASTELLÀ', api: d.periodo || '0',
    observaciones_llamada: d.observaciones || ''
  }
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
  return `https://comercial.topf2f.com/cc_fichasnew.php#f2f=${encoded}`
}

export default function AltaSocio() {
  const [screen, setScreen]   = useState('landing') // landing | processing | done | error
  const [formUrl, setFormUrl] = useState('')
  const [errMsg, setErrMsg]   = useState('')
  const inputRef = useRef(null)

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    // Reset input so same photo can be re-selected
    if (inputRef.current) inputRef.current.value = ''
    setScreen('processing')
    try {
      const dataUrl = await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload = ev => res(ev.target.result)
        reader.onerror = rej
        reader.readAsDataURL(file)
      })
      const compressed = await compressImage(dataUrl)
      const base64 = compressed.split(',')[1]
      const aiData = await callAnalyzeAPI(base64)
      setFormUrl(buildFormUrl(aiData))
      setScreen('done')
    } catch (err) {
      setErrMsg(err.message)
      setScreen('error')
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Alta de Socio</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Fotografía el formulario en papel — la IA extrae los datos y rellena el formulario topf2f automáticamente
        </p>
      </div>

      {/* ── LANDING ── */}
      {screen === 'landing' && (
        <div className="flex flex-col gap-4">
          {/* Upload card */}
          <button
            onClick={() => inputRef.current?.click()}
            className="card flex flex-col items-center gap-4 py-10 border-2 border-dashed border-gray-200 hover:border-brand-blue hover:bg-blue-50/30 transition-colors cursor-pointer w-full text-center"
          >
            <div className="bg-red-50 rounded-full p-5">
              <Camera size={36} className="text-brand-red"/>
            </div>
            <div>
              <div className="font-bold text-gray-800 text-lg">Subir foto del formulario</div>
              <div className="text-sm text-gray-400 mt-1">Haz una foto o elige una imagen.<br/>La IA extraerá los datos automáticamente.</div>
            </div>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFile}
          />

          {/* Bookmarklet */}
          <div className="card flex items-start gap-3 bg-amber-50 border border-amber-200">
            <Bookmark size={18} className="text-amber-600 shrink-0 mt-0.5"/>
            <div className="text-sm">
              <div className="font-semibold text-amber-800 mb-1">Instalar marcador de autorelleno</div>
              <p className="text-amber-700 text-xs mb-2">
                Arrastra el enlace de abajo a tu barra de favoritos. Solo tienes que hacerlo una vez.
                Después, al abrir el formulario de topf2f, pulsa ese marcador y los campos se rellenan solos.
              </p>
              <a
                href={buildBookmarkletHref()}
                draggable
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors"
                onClick={e => { e.preventDefault(); alert('Arrastra este enlace a tu barra de favoritos, no lo pulses.') }}
              >
                🚀 Rellenar Formulario F2F
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── PROCESSING ── */}
      {screen === 'processing' && (
        <div className="card flex flex-col items-center gap-4 py-16">
          <RefreshCw size={40} className="text-brand-blue animate-spin"/>
          <div className="text-center">
            <div className="font-semibold text-gray-800">Analizando el formulario...</div>
            <div className="text-sm text-gray-400 mt-1">La IA está leyendo los datos del papel.</div>
          </div>
        </div>
      )}

      {/* ── DONE ── */}
      {screen === 'done' && (
        <div className="flex flex-col gap-4">
          <div className="card flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 size={40} className="text-green-500"/>
            <div className="font-bold text-gray-800 text-lg">Datos extraídos</div>
            <div className="text-sm text-gray-500">Abre el formulario y usa el marcador para rellenarlo.</div>
          </div>

          <div className="card">
            <ol className="flex flex-col gap-4">
              {[
                <>Pulsa <strong>"Abrir formulario"</strong> aquí abajo — se abrirá en una nueva pestaña.</>,
                <>En esa pestaña, haz clic en el marcador <strong>"🚀 Rellenar Formulario F2F"</strong> de tu barra de favoritos.</>,
                <>Los campos se rellenan solos. Revisa y envía.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3 items-start text-sm text-gray-700">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-brand-red text-white text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <a
            href={formUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary justify-center gap-2 text-base py-4"
            onClick={() => setScreen('landing')}
          >
            <ExternalLink size={18}/>
            Abrir formulario en topf2f.com
          </a>

          <button
            onClick={() => setScreen('landing')}
            className="text-sm text-gray-400 hover:text-gray-600 text-center underline"
          >
            ← Escanear otro formulario
          </button>
        </div>
      )}

      {/* ── ERROR ── */}
      {screen === 'error' && (
        <div className="card flex flex-col items-center gap-4 py-10 text-center">
          <AlertTriangle size={40} className="text-amber-500"/>
          <div>
            <div className="font-semibold text-gray-800">No se pudo procesar</div>
            <div className="text-sm text-red-600 mt-1 max-w-xs">{errMsg}</div>
          </div>
          <button
            onClick={() => setScreen('landing')}
            className="btn-primary gap-2"
          >
            <RefreshCw size={14}/>
            Volver a intentarlo
          </button>
        </div>
      )}
    </div>
  )
}
