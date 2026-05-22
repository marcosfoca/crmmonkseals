import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { ROLES, ROLE_LABELS } from '../lib/auth.js'
import {
  LayoutDashboard, Users, BarChart2, UserPlus,
  Settings, LogOut, Menu, X
} from 'lucide-react'
import { useState } from 'react'

const NAV = [
  { to: '/',            label: 'Inicio',       icon: LayoutDashboard, exact: true },
  { to: '/produccion',  label: 'Producción',   icon: Users },
  { to: '/estadisticas',label: 'Estadísticas', icon: BarChart2 },
  { to: '/alta',        label: 'Alta Socio',   icon: UserPlus },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const isAdmin = user?.role === ROLES.ADMIN

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="bg-brand-dark text-white h-14 flex items-center px-4 gap-3 shadow-md z-50 sticky top-0">
        <button className="md:hidden p-1" onClick={() => setOpen(o => !o)}>
          {open ? <X size={20}/> : <Menu size={20}/>}
        </button>

        <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <span className="text-brand-red">●</span>
          <span>MonkSeals CRM</span>
        </div>

        <nav className="hidden md:flex items-center gap-1 ml-6 flex-1">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <NavLink key={to} to={to} end={exact}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`
              }
            >
              <Icon size={15}/>{label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/15 text-white' : 'text-yellow-300/80 hover:text-yellow-200 hover:bg-white/10'
                }`
              }
            >
              <Settings size={15}/>Admin
            </NavLink>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden md:block text-right">
            <div className="text-xs font-semibold leading-tight">{user?.nombre}</div>
            <div className="text-xs text-white/50">{ROLE_LABELS[user?.role]}</div>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors text-sm">
            <LogOut size={15}/>
          </button>
        </div>
      </header>

      {/* Mobile nav drawer */}
      {open && (
        <div className="md:hidden bg-brand-dark text-white px-4 py-3 flex flex-col gap-1 z-40">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <NavLink key={to} to={to} end={exact}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? 'bg-white/15' : 'text-white/70 hover:text-white hover:bg-white/10'
                }`
              }
            >
              <Icon size={16}/>{label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink to="/admin" onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? 'bg-white/15' : 'text-yellow-300/80 hover:text-yellow-200 hover:bg-white/10'
                }`
              }
            >
              <Settings size={16}/>Admin
            </NavLink>
          )}
        </div>
      )}

      {/* Page content */}
      <main className="flex-1 p-4 md:p-6 max-w-screen-xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
