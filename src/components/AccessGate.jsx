import { useState, useEffect } from 'react'
import { Lock, Loader2 } from 'lucide-react'

// Client half of the shared-key gate (middleware.js validates server-side).
// Sets an ob_key cookie that the browser attaches to every same-origin fetch,
// so no page needs a fetch wrapper. If the middleware is not configured
// (APP_ACCESS_KEY unset), the probe succeeds without a cookie and the gate opens.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90 // 90 días

function setKeyCookie(value) {
  document.cookie = `ob_key=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

async function probe() {
  // Cheapest protected endpoint: Redis read, no Asana calls
  const res = await fetch('/api/webhook-logs?limit=1')
  return res.status !== 401
}

export default function AccessGate({ children }) {
  const [state, setState] = useState('checking') // checking | locked | open
  const [key, setKey] = useState('')
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    probe().then(ok => setState(ok ? 'open' : 'locked')).catch(() => setState('open'))
  }, [])

  if (state === 'open') return children

  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F3F5FA' }}>
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!key.trim() || submitting) return
    setSubmitting(true)
    setError(false)
    setKeyCookie(key.trim())
    const ok = await probe().catch(() => false)
    if (ok) {
      setState('open')
    } else {
      setError(true)
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F3F5FA' }}>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-1">
          <img src="/isotipo.png" alt="Multivende" className="h-8 w-8" />
          <div>
            <p className="text-sm font-bold tracking-wide" style={{ color: '#2B4063' }}>MULTIVENDE</p>
            <p className="text-[11px] text-slate-400 uppercase tracking-widest">Onboarding Ops</p>
          </div>
        </div>
        <p className="text-sm text-slate-500 mt-4 mb-5">
          Esta herramienta contiene información de clientes. Ingresá la clave de acceso del equipo.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="Clave de acceso"
              autoFocus
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6681C6]/40 focus:border-[#6681C6]"
            />
          </div>
          {error && <p className="text-xs text-red-500">Clave incorrecta, probá de nuevo.</p>}
          <button
            type="submit"
            disabled={!key.trim() || submitting}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#2B4063' }}
          >
            {submitting ? 'Verificando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
