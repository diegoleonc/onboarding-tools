import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { LayoutDashboard, Clock, Webhook } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Esfuerzo from './pages/Esfuerzo'
import WebhookLogs from './pages/WebhookLogs'

function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="brand-gradient sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <img src="/isotipo.png" alt="Multivende" className="h-8 w-8" />
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-white tracking-wide" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  MULTIVENDE
                </span>
                <span className="text-xs font-medium text-white/60 hidden sm:inline border-l border-white/20 pl-2">
                  Onboarding Ops
                </span>
              </div>
            </div>

            {/* Nav Links */}
            <div className="flex items-center gap-1">
              <NavLink
                to="/dashboard"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-white/20 text-white shadow-sm backdrop-blur-sm'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
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
                      ? 'bg-white/20 text-white shadow-sm backdrop-blur-sm'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`
                }
              >
                <Clock size={18} />
                <span className="hidden sm:inline">Esfuerzo</span>
              </NavLink>
              <NavLink
                to="/webhooks"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-white/20 text-white shadow-sm backdrop-blur-sm'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`
                }
              >
                <Webhook size={18} />
                <span className="hidden sm:inline">Webhooks</span>
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
          <Route path="/webhooks" element={<WebhookLogs />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo-multivende.png" alt="Multivende" className="h-5 opacity-60" />
          </div>
          <span className="text-xs text-slate-400">Onboarding Operations Platform</span>
        </div>
      </footer>
    </div>
  )
}

export default App
