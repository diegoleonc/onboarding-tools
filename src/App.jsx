import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { LayoutDashboard, FolderKanban, Activity, SlidersHorizontal, Webhook } from 'lucide-react'
import Resumen from './pages/Resumen'
import Proyectos from './pages/Proyectos'
import Esfuerzo from './pages/Esfuerzo'
import Parametrizador from './pages/Parametrizador'
import WebhookLogs from './pages/WebhookLogs'

const NAV = [
  { to: '/resumen', label: 'Resumen', icon: LayoutDashboard },
  { to: '/proyectos', label: 'Proyectos', icon: FolderKanban },
  { to: '/esfuerzo', label: 'Esfuerzo', icon: Activity },
  { to: '/parametrizador', label: 'Parametrizador', icon: SlidersHorizontal },
  { to: '/webhooks', label: 'Webhooks', icon: Webhook },
]

function NavItem({ to, label, icon, compact }) {
  const Icon = icon
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl text-sm font-medium transition-all ${
          compact ? 'px-3 py-2' : 'px-4 py-2.5'
        } ${isActive ? 'bg-white/12 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-white/55 hover:text-white hover:bg-white/6'}`
      }
    >
      <Icon size={17} strokeWidth={2} className="flex-shrink-0" />
      <span className={compact ? '' : 'hidden lg:inline'}>{label}</span>
    </NavLink>
  )
}

function App() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F3F5FA' }}>
      {/* ===== Desktop sidebar ===== */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-[68px] lg:w-60 flex-col z-40 sidebar-gradient">
        <div className="flex items-center gap-3 px-4 lg:px-5 h-16 flex-shrink-0">
          <img src="/isotipo.png" alt="Multivende" className="h-8 w-8 flex-shrink-0" />
          <div className="hidden lg:block leading-tight">
            <p className="text-[15px] font-bold text-white tracking-wide" style={{ fontFamily: 'Poppins, sans-serif' }}>MULTIVENDE</p>
            <p className="text-[10px] font-medium text-white/45 uppercase tracking-[0.14em]">Onboarding Ops</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 px-3 mt-4 flex-1">
          {NAV.map(item => <NavItem key={item.to} {...item} />)}
        </nav>

        <div className="px-4 lg:px-5 py-5 border-t border-white/8">
          <img src="/logo-multivende-blanco.png" alt="Multivende" className="hidden lg:block h-4 opacity-40" />
          <p className="hidden lg:block text-[10px] text-white/30 mt-2">Operations 2026</p>
        </div>
      </aside>

      {/* ===== Mobile top bar ===== */}
      <header className="md:hidden sticky top-0 z-40 sidebar-gradient">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2.5">
            <img src="/isotipo.png" alt="Multivende" className="h-7 w-7" />
            <span className="text-sm font-bold text-white tracking-wide" style={{ fontFamily: 'Poppins, sans-serif' }}>MULTIVENDE</span>
          </div>
        </div>
        <nav className="flex gap-1 px-3 pb-2 overflow-x-auto">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-all ${
                  isActive ? 'bg-white/15 text-white' : 'text-white/55'
                }`
              }
            >
              <item.icon size={14} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* ===== Content ===== */}
      <main className="md:ml-[68px] lg:ml-60">
        <div className="max-w-[1480px] mx-auto px-4 sm:px-6 xl:px-8 py-6 lg:py-8">
          <Routes>
            <Route path="/" element={<Navigate to="/resumen" replace />} />
            <Route path="/dashboard" element={<Navigate to="/resumen" replace />} />
            <Route path="/resumen" element={<Resumen />} />
            <Route path="/proyectos" element={<Proyectos />} />
            <Route path="/esfuerzo" element={<Esfuerzo />} />
            <Route path="/parametrizador" element={<Parametrizador />} />
            <Route path="/webhooks" element={<WebhookLogs />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default App
