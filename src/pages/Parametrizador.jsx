import { useState, useMemo } from 'react'
import { Zap, ClipboardList, Target, TrendingUp, CheckSquare, Download, AlertTriangle, Copy, CheckCircle } from 'lucide-react'
import { parseProjectName, calculateEstimation, generateTasks, formatDate, getNextMonday } from '../utils/parsing'

const ESTIMATE_OPTIONS = [
  { value: 'optimista', label: 'Optimista (P50)', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { value: 'esperado', label: 'Esperado (Recomendado)', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  { value: 'conservador', label: 'Conservador (P80)', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
]

export default function Parametrizador() {
  const [projectName, setProjectName] = useState('')
  const [startDate, setStartDate] = useState(formatDate(getNextMonday(new Date())))
  const [estimateType, setEstimateType] = useState('esperado')
  const [showResults, setShowResults] = useState(false)
  const [parsed, setParsed] = useState(null)
  const [estimations, setEstimations] = useState(null)
  const [copied, setCopied] = useState(false)

  const tasks = useMemo(() => {
    if (!parsed || !estimations) return []
    return generateTasks(parsed, estimations[estimateType], startDate)
  }, [parsed, estimations, estimateType, startDate])

  const handleParametrize = () => {
    if (!projectName.trim()) return
    const p = parseProjectName(projectName)
    const e = calculateEstimation(p.plan, p.type, p.totalChannels, p.channels)
    setParsed(p)
    setEstimations(e)
    setShowResults(true)
  }

  const handleCopyName = async () => {
    await navigator.clipboard.writeText(projectName)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownloadCSV = () => {
    let csv = 'Name,Section/Column,Due Date\n'
    let currentSection = ''
    for (const t of tasks) {
      if (t.section !== currentSection) {
        currentSection = t.section
        csv += `"${t.section}","${t.section}",""\n`
      }
      csv += `"${t.task}","${t.section}","${t.date}"\n`
    }
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `tareas-onboarding-${formatDate(new Date())}.csv`
    link.click()
  }

  const uniqueChannels = parsed ? [...new Set(parsed.channels)] : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-8 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Zap size={28} />
          <h1 className="text-2xl font-bold">Parametrizador de Onboarding</h1>
        </div>
        <p className="text-blue-200">Generador de tareas para Asana basado en el análisis de 1,035 proyectos completados</p>
      </div>

      {/* Step 1: Input */}
      <Card icon={<ClipboardList size={20} />} title="Paso 1: Datos del proyecto">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
          <p className="text-sm text-blue-700">
            Pegue el nombre exacto del proyecto desde Asana. El sistema detectará automáticamente empresa, país, plan y canales.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Nombre del proyecto de Asana</label>
            <textarea
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="Ej: PC Express- Setup Starter (Falabella/Walmart/Paris/Ripley)"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none h-28"
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleParametrize() }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Fecha de inicio</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
          </div>
        </div>
        <button
          onClick={handleParametrize}
          className="w-full mt-5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-3.5 rounded-xl font-semibold text-base hover:shadow-lg hover:shadow-blue-200 transition-all active:scale-[0.99]"
        >
          Parametrizar
        </button>
      </Card>

      {/* Formula info */}
      <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-sm text-slate-600">
        <strong>Fórmula:</strong> Starter: 59 + 5×canales | Pro: 56 + 12×canales | Advanced: 48 + 18×canales | Enterprise: 80 + 10×canales | Upgrade: 14 + 3×canales. Integraciones complejas: +16 días
      </div>

      {showResults && parsed && estimations && (
        <>
          {/* Step 2: Summary */}
          <Card icon={<Target size={20} />} title="Paso 2: Resumen detectado">
            {parsed.parseWarnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-center gap-3">
                <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                <p className="text-sm text-amber-700">{parsed.parseWarnings.join(' | ')}</p>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <SummaryItem label="Empresa" value={parsed.company || '-'} />
              <SummaryItem label="País" value={parsed.country || '-'} />
              <SummaryItem label="Plan" value={parsed.plan} />
              <SummaryItem label="Tipo" value={parsed.type} />
              <SummaryItem label="Canales" value={parsed.totalChannels} />
              <div className="col-span-2 md:col-span-3 lg:col-span-6">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Canales detectados</label>
                <div className="flex flex-wrap gap-2">
                  {uniqueChannels.map(ch => {
                    const count = parsed.channels.filter(c => c === ch).length
                    return (
                      <span key={ch} className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {ch}{count > 1 ? ` ×${count}` : ''}
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>
          </Card>

          {/* Step 3: Estimates */}
          <Card icon={<TrendingUp size={20} />} title="Paso 3: Estimaciones de duración">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {ESTIMATE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setEstimateType(opt.value)}
                  className={`p-5 rounded-xl border-2 text-center transition-all ${
                    estimateType === opt.value
                      ? `${opt.bg} ${opt.border} ring-2 ring-offset-1 ${opt.border.replace('border', 'ring')}`
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{opt.label}</div>
                  <div className={`text-4xl font-bold ${opt.color}`}>{estimations[opt.value]}</div>
                  <div className="text-sm text-slate-500 mt-1">
                    {Math.ceil(estimations[opt.value] / 7)} semanas
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* Step 4: Tasks */}
          <Card icon={<CheckSquare size={20} />} title="Paso 4: Tareas generadas">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-5 py-3 rounded-xl mb-4 text-center font-semibold">
              Total: {tasks.length} tareas
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wider">Sección</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wider">Tarea</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wider">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-blue-800 whitespace-nowrap">{t.section}</td>
                      <td className="px-4 py-3 text-slate-700">{t.task}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{t.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Step 5: Export */}
          <Card icon={<Download size={20} />} title="Paso 5: Exportar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={handleCopyName}
                className="flex items-center justify-center gap-2 px-6 py-3.5 border-2 border-blue-600 text-blue-700 rounded-xl font-semibold hover:bg-blue-50 transition-all"
              >
                {copied ? <CheckCircle size={18} /> : <Copy size={18} />}
                {copied ? 'Copiado!' : 'Copiar nombre del proyecto'}
              </button>
              <button
                onClick={handleDownloadCSV}
                className="flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-blue-200 transition-all"
              >
                <Download size={18} />
                Descargar CSV para Asana
              </button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function Card({ icon, title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="text-blue-700">{icon}</div>
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function SummaryItem({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-xl p-4">
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
      <div className="text-base font-bold text-blue-800">{value}</div>
    </div>
  )
}
