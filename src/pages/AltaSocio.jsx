import { useAuth } from '../hooks/useAuth.jsx'
import { ExternalLink, Scan } from 'lucide-react'

export default function AltaSocio() {
  const { user } = useAuth()

  // Build the autologin URL — the iframe will land on the logged-in session
  // The user's topf2f credentials are stored encrypted; we open the real site
  const altaUrl = 'https://comercial.topf2f.com/cc_fichasnew.php'

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-7rem)]">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Alta de Socio</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Formulario oficial de topf2f.com — inicia sesión con tus credenciales si te lo pide
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/scanner" target="_blank"
            className="btn-secondary gap-2 text-xs">
            <Scan size={14}/>Usar Scanner de papel
          </a>
          <a href={altaUrl} target="_blank" rel="noopener noreferrer"
            className="btn-primary gap-2 text-xs">
            <ExternalLink size={14}/>Abrir en pestaña nueva
          </a>
        </div>
      </div>

      <div className="flex-1 rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white">
        <iframe
          src={altaUrl}
          title="Alta Socio — topf2f.com"
          className="w-full h-full border-0"
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    </div>
  )
}
