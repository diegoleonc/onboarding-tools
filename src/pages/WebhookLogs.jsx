import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, RefreshCw, CheckCircle, XCircle, AlertTriangle, MessageSquare, Video, ArrowUpDown } from 'lucide-react'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5173' : ''

function WebhookLogs() {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortNewest, setSortNewest] = useState(true)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (searchQuery.trim()) params.set('search', searchQuery.trim())

      const res = await fetch(`${API_BASE}/api/webhook-logs?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      let sortedLogs = data.logs || []
      if (!sortNewest) sortedLogs = [...sortedLogs].reverse()

      setLogs(sortedLogs)
      setTotal(data.total || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [typeFilter, statusFilter, searchQuery, sortNewest])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Stats
  const totalMeetings = logs.filter(l => l.type === 'meeting').length
  const totalWhatsapp = logs.filter(l => l.type === 'whatsapp').length
  const totalMatched = logs.filter(l => l.projectMatch).length
  const totalUnmatched = logs.filter(l => !l.projectMatch).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Webhook Logs</h1>
          <p className="text-sm text-slate-500 mt-1">
            Historial de webhooks recibidos de DIIO y acciones en Asana
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total" value={total} color="slate" />
        <StatCard label="Reuniones" value={totalMeetings} color="blue" icon={<Video size={16} />} />
        <StatCard label="WhatsApp" value={totalWhatsapp} color="green" icon={<MessageSquare size={16} />} />
        <StatCard
          label="Sin match"
          value={totalUnmatched}
          color={totalUnmatched > 0 ? 'amber' : 'slate'}
          icon={<AlertTriangle size={16} />}
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, proyecto, contacto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-1">
            <Filter size={14} className="text-slate-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Todos los tipos</option>
              <option value="meeting">Reuniones</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Todos los estados</option>
            <option value="matched">Con match</option>
            <option value="unmatched">Sin match</option>
            <option value="error">Errores</option>
          </select>

          {/* Sort */}
          <button
            onClick={() => setSortNewest(!sortNewest)}
            className="flex items-center gap-1 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50"
          >
            <ArrowUpDown size={14} />
            {sortNewest ? 'Más recientes' : 'Más antiguos'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          Error cargando logs: {error}
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-slate-400" />
            <span className="ml-3 text-slate-500">Cargando logs...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <AlertTriangle size={32} className="mx-auto mb-3 text-slate-300" />
            <p>No se encontraron logs{searchQuery && ` para "${searchQuery}"`}</p>
            <p className="text-xs mt-1 text-slate-400">Los logs aparecerán cuando se reciban webhooks de DIIO</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Proyecto Asana</th>
                  <th className="px-4 py-3">Sentiment</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Detalles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log, i) => (
                  <LogRow key={log.id || i} log={log} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer info */}
      {logs.length > 0 && (
        <p className="text-xs text-slate-400 text-center">
          Mostrando {logs.length} de {total} logs · Los logs se mantienen hasta 500 entradas
        </p>
      )}
    </div>
  )
}

function StatCard({ label, value, color, icon }) {
  const colors = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.slate}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  )
}

function LogRow({ log }) {
  const [expanded, setExpanded] = useState(false)

  const date = new Date(log.timestamp)
  const timeStr = date.toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  })

  const typeIcon = log.type === 'meeting'
    ? <Video size={14} className="text-blue-500" />
    : <MessageSquare size={14} className="text-green-500" />

  const typeLabel = log.type === 'meeting' ? 'Reunión' : 'WhatsApp'

  const statusIcon = log.projectMatch
    ? <CheckCircle size={14} className="text-emerald-500" />
    : log.success
      ? <AlertTriangle size={14} className="text-amber-500" />
      : <XCircle size={14} className="text-red-500" />

  const statusLabel = log.projectMatch
    ? 'Asociado'
    : log.success
      ? 'Sin match'
      : 'Error'

  const sentimentEmoji = {
    1: '😡', 2: '😟', 3: '😐', 4: '😊', 5: '🤩'
  }

  return (
    <>
      <tr
        className="hover:bg-slate-50 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{timeStr}</td>
        <td className="px-4 py-3">
          <span className="flex items-center gap-1.5">
            {typeIcon}
            <span className="text-slate-700">{typeLabel}</span>
          </span>
        </td>
        <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px] truncate" title={log.name}>
          {log.name || '—'}
        </td>
        <td className="px-4 py-3">
          {log.projectMatch ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
              {log.projectMatch}
            </span>
          ) : (
            <span className="text-slate-400 text-xs">Sin match</span>
          )}
        </td>
        <td className="px-4 py-3 text-center">
          {log.sentiment != null ? (
            <span title={`Sentiment: ${log.sentiment}/5`}>
              {sentimentEmoji[log.sentiment] || log.sentiment}
            </span>
          ) : '—'}
        </td>
        <td className="px-4 py-3">
          <span className="flex items-center gap-1.5">
            {statusIcon}
            <span className="text-xs">{statusLabel}</span>
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-slate-500 max-w-[250px] truncate" title={log.details}>
          {log.details}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-slate-50 px-6 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              {log.matchedBy && (
                <Detail label="Matched by" value={log.matchedBy} />
              )}
              {log.contactNames?.length > 0 && (
                <Detail label="Contactos" value={log.contactNames.join(', ')} />
              )}
              {log.userEmails?.length > 0 && (
                <Detail label="Emails" value={log.userEmails.join(', ')} />
              )}
              {log.sellerEmails?.length > 0 && (
                <Detail label="Sellers" value={log.sellerEmails.join(', ')} />
              )}
              {log.companyExtracted && (
                <Detail label="Empresa extraída" value={log.companyExtracted} />
              )}
              {log.integrationType && (
                <Detail label="Integración" value={log.integrationType} />
              )}
              {log.sentiment != null && (
                <Detail label="Sentiment" value={`${log.sentiment}/5`} />
              )}
              <Detail label="ID" value={log.id} />
              <Detail label="Timestamp" value={log.timestamp} />
              <Detail label="Action" value={log.action} />
            </div>
            <div className="mt-3 text-xs text-slate-600 bg-white rounded p-2 border border-slate-200">
              <strong>Detalles:</strong> {log.details}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function Detail({ label, value }) {
  return (
    <div>
      <span className="text-slate-400 font-medium">{label}:</span>{' '}
      <span className="text-slate-700">{value}</span>
    </div>
  )
}

export default WebhookLogs
