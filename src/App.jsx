import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { LayoutDashboard, Settings, Clock } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Parametrizador from './pages/Parametrizador'
import Esfuerzo from './pages/Esfuerzo'

function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">M</span>
              </div>
              <span className="text-lg font-bold text-slate-800">Multivende</span>
              <span className="text-sm text-slate-400 hidden sm:inline">Onboarding Tools</span>
            </div>
            <div className="flex items-center gap-1">
              <NavLink
                to="/dashboard"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                <LayoutDashboard size={18} />
                <span className="hidden sm:inline">Dashboard</span>
              </NavLink>
              <NavLink
                to="/esfuerzo"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                <Clock size={18} />
                <span className="hidden sm:inline">Esfuerzo</span>
              </NavLink>
              <NavLink
                to="/parametrizador"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                <Settings size={18} />
                <span className="hidden sm:inline">Parametrizador</span>
              </NavLink>
            </div>
          </div>
        </div>
      </nav>

      {/* Routes */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/esfuerzo" element={<Esfuerzo />} />
          <Route path="/parametrizador" element={<Parametrizador />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
