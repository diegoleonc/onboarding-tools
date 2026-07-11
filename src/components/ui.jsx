import { Loader2, AlertTriangle, Search, ExternalLink } from 'lucide-react'
import { STATUS, TIPO, INK, BRAND } from '../theme'

// ============ layout ============
export function Card({ title, subtitle, action, children, className = '', pad = true }) {
  return (
    <section className={`bg-white rounded-2xl border border-[#E4E8F1] shadow-[0_1px_2px_rgba(31,42,68,0.04)] ${pad ? 'p-6' : ''} ${className}`}>
      {(title || action) && (
        <header className={`flex items-start justify-between gap-4 ${pad ? 'mb-5' : 'p-6 pb-0 mb-5'}`}>
          <div>
            {title && <h3 className="text-[15px] font-semibold" style={{ color: INK.primary }}>{title}</h3>}
            {subtitle && <p className="text-xs mt-0.5" style={{ color: INK.muted }}>{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight" style={{ fontFamily: 'Oswald, sans-serif', color: BRAND.navy, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          {title}
        </h1>
        {subtitle && <p className="text-sm mt-1" style={{ color: INK.muted }}>{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

// ============ stat tile ============
export function StatTile({ label, value, sub, delta, deltaGood, tone }) {
  const toneColor = tone === 'bad' ? STATUS.off_track.color : tone === 'warn' ? STATUS.at_risk.color : tone === 'good' ? STATUS.on_track.color : INK.primary
  return (
    <div className="bg-white rounded-2xl border border-[#E4E8F1] shadow-[0_1px_2px_rgba(31,42,68,0.04)] px-5 py-4 min-w-0">
      <p className="text-xs font-medium truncate" style={{ color: INK.muted }}>{label}</p>
      <div className="flex items-baseline gap-2 mt-1.5 min-w-0">
        <span className={`leading-none font-semibold whitespace-nowrap ${String(value).length > 5 ? 'text-[22px]' : 'text-[28px]'}`} style={{ color: toneColor }}>{value}</span>
        {delta !== undefined && delta !== null && (
          <span className="text-xs font-semibold whitespace-nowrap" style={{ color: deltaGood ? STATUS.on_track.color : STATUS.off_track.color }}>
            {delta > 0 ? '+' : ''}{delta}
          </span>
        )}
      </div>
      {sub && <p className="text-[11px] mt-1.5 truncate" style={{ color: INK.faint }}>{sub}</p>}
    </div>
  )
}

// ============ badges ============
export function StatusBadge({ statusKey }) {
  const s = STATUS[statusKey] || STATUS.none
  return (
    <span className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ backgroundColor: s.bg, color: s.text }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
      {s.label}
    </span>
  )
}

export function TipoBadge({ tipo }) {
  const t = TIPO[tipo]
  if (!t) return <span className="text-xs" style={{ color: INK.faint }}>{tipo || '—'}</span>
  return (
    <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap" style={{ backgroundColor: t.bg, color: t.text }}>
      {tipo}
    </span>
  )
}

export function Chip({ children, kind = 'neutral' }) {
  const kinds = {
    neutral: { bg: '#F1F4F9', color: '#475569' },
    off_track: { bg: STATUS.off_track.bg, color: STATUS.off_track.text },
    at_risk: { bg: STATUS.at_risk.bg, color: STATUS.at_risk.text },
    meeting: { bg: '#E8EDF7', color: '#35558F' },
    due: { bg: STATUS.off_track.bg, color: STATUS.off_track.text },
    age: { bg: '#F1F4F9', color: '#64748B' },
  }
  const k = kinds[kind] || kinds.neutral
  return (
    <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap" style={{ backgroundColor: k.bg, color: k.color }}>
      {children}
    </span>
  )
}

export function OwnerDot({ name, color }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ backgroundColor: color }}>
        {initials}
      </span>
      <span className="text-[13px] truncate" style={{ color: INK.secondary }}>{name}</span>
    </span>
  )
}

// ============ controls ============
export function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex bg-[#EDF1F7] rounded-lg p-0.5 text-[13px]">
      {options.map(([val, label]) => (
        <button
          key={val}
          onClick={() => onChange(val)}
          className={`px-3 py-1.5 rounded-md transition-all font-medium ${value === val ? 'bg-white shadow-sm' : 'hover:bg-white/50'}`}
          style={{ color: value === val ? BRAND.navy : INK.muted }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-[13px] border border-[#E4E8F1] rounded-lg pl-3 pr-8 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#6681C6]/40 cursor-pointer"
      style={{ color: value ? INK.primary : INK.muted }}
    >
      <option value="">{placeholder}</option>
      {options.map(opt => typeof opt === 'string'
        ? <option key={opt} value={opt}>{opt}</option>
        : <option key={opt.value} value={opt.value}>{opt.label}</option>
      )}
    </select>
  )
}

export function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: INK.faint }} />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full pl-9 pr-3 py-2 text-[13px] border border-[#E4E8F1] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#6681C6]/40"
      />
    </div>
  )
}

export function AsanaLink({ href }) {
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
      className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-[#EDF1F7] transition-colors flex-shrink-0"
      style={{ color: BRAND.blue }} title="Abrir en Asana">
      <ExternalLink size={14} />
    </a>
  )
}

// ============ states ============
export function LoadingState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <Loader2 className="animate-spin" size={36} style={{ color: BRAND.blue }} />
      <p className="text-sm" style={{ color: INK.muted }}>{message || 'Cargando datos...'}</p>
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <AlertTriangle size={36} style={{ color: STATUS.off_track.color }} />
      <p className="font-medium" style={{ color: STATUS.off_track.color }}>Error al cargar datos</p>
      <p className="text-sm max-w-md text-center" style={{ color: INK.muted }}>{error}</p>
      <button onClick={onRetry} className="px-4 py-2 text-white rounded-lg text-sm hover:opacity-90 transition-opacity" style={{ backgroundColor: BRAND.navy }}>
        Reintentar
      </button>
    </div>
  )
}

export function EmptyState({ message }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm" style={{ color: INK.faint }}>
      {message}
    </div>
  )
}

export function HydratingNote({ show, label }) {
  if (!show) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: INK.faint }}>
      <Loader2 className="animate-spin" size={11} />
      {label || 'Cargando esfuerzo DIIO...'}
    </span>
  )
}
