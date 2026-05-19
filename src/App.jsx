import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import Login        from './pages/Login.jsx'
import Layout       from './components/Layout.jsx'
import Dashboard    from './pages/Dashboard.jsx'
import Produccion   from './pages/Produccion.jsx'
import Estadisticas from './pages/Estadisticas.jsx'
import AltaSocio    from './pages/AltaSocio.jsx'
import Admin        from './pages/Admin.jsx'
import { ROLES }    from './lib/auth.js'

function PrivateRoute({ children, adminOnly = false }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== ROLES.ADMIN) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index             element={<Dashboard />} />
            <Route path="produccion" element={<Produccion />} />
            <Route path="estadisticas" element={<Estadisticas />} />
            <Route path="alta"       element={<AltaSocio />} />
            <Route path="admin"      element={
              <PrivateRoute adminOnly><Admin /></PrivateRoute>
            } />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
