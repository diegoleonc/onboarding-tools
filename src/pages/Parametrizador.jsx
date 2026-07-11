import { useState, useMemo, useEffect } from 'react'
import { Target, TrendingUp, CheckSquare, Download, AlertTriangle, Copy, CheckCircle, Send, Loader2, ExternalLink, XCircle, FolderOpen, FileText, RotateCcw } from 'lucide-react'
import { parseProjectName, calculateEstimation, generateTasks, formatDate, getNextMonday, DEFAULT_CALIBRATION } from '../utils/parsing'
import { fetchPortfolioProjects, sendTasksToAsana, fetchCalibration } from '../utils/asanaApi'

const PROJECT_TYPES = [
  { value: 'setup', label: 'Set Up', tag: '01', description: 'Onboarding inicial de nuevos clientes', color: 'text-mv-green', bg: 'bg-mv-green', bgLight: 'bg-emerald-50', borderActive: 'border-mv-green' },
  { value: 'upgrade', label: 'Upgrade', tag: '02', description: 'Ampliación de canales o plan', color: 'text-mv-orange', bg: 'bg-mv-orange', bgLight: 'bg-orange-50', borderActive: 'border-mv-orange' },
  { value: 'reonboarding', label: 'Reonboarding', tag: '03', description: 'Reactivación de clientes existentes', color: 'text-mv-magenta', bg: 'bg-mv-magenta', bgLight: 'bg-pink-50', borderActive: 'border-mv-magenta' },
]

const ESTIMATE_OPTIONS = [
  { value: 'optimista', label: 'Optimista', sublabel: 'P25', color: 'text-mv-green', iconBg: 'bg-emerald-50', iconColor: 'text-mv-green' },
  { value: 'esperado', label: 'Esperado', sublabel: 'Mediana', color: 'text-mv-blue', iconBg: 'bg-blue-50', iconColor: 'text-mv-blue' },
  { value: 'conservador', label: 'Conservador', sublabel: 'P80', color: 'text-mv-coral', iconBg: 'bg-red-50', iconColor: 'text-mv-coral' },
]

export default function Parametrizador() {
  const [selectedType, setSelectedType] = useState(null)
  const [portfolioProjects, setPortfolioProjects] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [projectsError, setProjectsError] = useState('')
  const [portfolioStats, setPortfolioStats] = useState(null)
  const [selectedAsanaProject, setSelectedAsanaProject] = useState(null)
  const [startDate, setStartDate] = useState(formatDate(getNextMonday(new Date())))
  const [estimateType, setEstimateType] = useState('esperado')
  const [showResults, setShowResults] = useState(false)
  const [parsed, setParsed] = useState(null)
  const [calibration, setCalibration] = useState(null)
  const [copied, setCopied] = useState(false)
  const [sendingToAsana, setSendingToAsana] = useState(false)
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0, message: '' })
  const [sendResult, setSendResult] = useState(null)

  // Calibración dinámica: coeficientes calculados desde el histórico real de Asana.
  // Si el endpoint falla, se usan las fórmulas estáticas (mismos valores calibrados).
  useEffect(() => {
    fetchCalibration().then(setCalibration).catch(() => setCalibration(null))
  }, [])

  const activeCalibration = calibration?.segments ? calibration : DEFAULT_CALIBRATION

  const estimations = useMemo(() => {
    if (!parsed) return null
    return calculateEstimation(parsed.plan, parsed.type, parsed.totalChannels, parsed.channels, activeCalibration)
  }, [parsed, activeCalibration])

  const tasks = useMemo(() => {
    if (!parsed || !estimations) return []
    return generateTasks(parsed, estimations[estimateType], startDate)
  }, [parsed, estimations, estimateType, startDate])

  useEffect(() => {
    if (!selectedType) return
    setLoadingProjects(true)
    setProjectsError('')
    setPortfolioProjects([])
    setSelectedAsanaProject(null)
    setShowResults(false)
    setParsed(null)
    setSendResult(null)

    fetchPortfolioProjects(selectedType)
      .then((data) => {
        setPortfolioProjects(data.projects)
        setPortfolioStats({ total: data.total, active: data.active, unparametrized: data.unparametrized })
      })
      .catch((err) => setProjectsError(err.message))
      .finally(() => setLoadingProjects(false))
  }, [selectedType])

  const handleSelectProject = (project) => {
    setSelectedAsanaProject(project)
    setSendResult(null)
    setParsed(parseProjectName(project.name))
    setShowResults(true)
  }

  const handleCopyName = async () => {
    if (!selectedAsanaProject) return
    await navigator.clipboard.writeText(selectedAsanaProject.name)
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

  const handleSendToAsana = async () => {
    if (!selectedAsanaProject || tasks.length === 0) return
    setSendingToAsana(true)
    setSendResult(null)
    setSendProgress({ current: 0, total: 0, message: 'Iniciando...' })
    try {
      const result = await sendTasksToAsana(
        selectedAsanaProject.gid, tasks,
        (current, total, message) => setSendProgress({ current, total, message })
      )
      setSendResult(result)
    } catch (err) {
      setSendResult({ created: 0, errors: [{ task: 'General', error: err.message }] })
    } finally {
      setSendingToAsana(false)
    }
  }

  const handleReset = () => {
    setSelectedType(null)
    setSelectedAsanaProject(null)
    setShowResults(false)
    setParsed(null)
    setSendResult(null)
    setPortfolioProjects([])
  }

  const uniqueChannels = parsed ? [...new Set(parsed.channels)] : []
  const activeType = PROJECT_TYPES.find(t => t.value === selectedType)

  return (
    <div className="space-y-6">
      {/* Hero header - brand-gradient like dashboard */}
      <div className="brand-gradient rounded-2xl p-8 text-white relative overflow-hidden">
        {/* Watermark logo */}
        <img
          src="/logo-multivende-blanco.png"
          alt=""
          className="absolute right-6 top-1/2 -translate-y-1/2 h-20 opacity-10 pointer-events-none"
        />
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1">
              Parametrizador
            </h1>
            <p className="text-white/60 text-sm">
              Generador automático de tareas para proyectos de onboarding
              {selectedType && (
                <span className="text-white/40"> — {activeType?.label}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {selectedType && (
              <button
                onClick={handleReset}
                className="text-sm text-white/60 hover:text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-all flex items-center gap-2"
              >
                <RotateCcw size={14} />
                Reiniciar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Step 1: Type selector - stat card style like dashboard */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <FolderOpen size={18} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Tipo de proyecto</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PROJECT_TYPES.map(type => (
            <button
              key={type.value}
              onClick={() => setSelectedType(type.value)}
              className={`relative p-5 rounded-2xl border-2 text-center transition-all duration-200 card-hover ${
                selectedType === type.value
                  ? `${type.bgLight} ${type.borderActive}`
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className={`w-10 h-10 rounded-full ${selectedType === type.value ? type.bgLight : 'bg-slate-50'} flex items-center justify-center mx-auto mb-3`}>
                <span className={`text-xs font-bold ${selectedType === type.value ? type.color : 'text-slate-400'}`}>{type.tag}</span>
              </div>
              <div className={`text-lg font-semibold mb-1 ${
                selectedType === type.value ? type.color : 'text-slate-700'
              }`}>
                {type.label}
              </div>
              <div className="text-xs text-slate-400">{type.description}</div>
              {selectedType === type.value && (
                <CheckCircle size={18} className={`absolute top-4 right-4 ${type.color}`} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Project selector */}
      {selectedType && (
        <div className="fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <FileText size={18} className="text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Proyecto sin parametrizar</h2>
            </div>
            {loadingProjects ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-12 h-12 rounded-full border-[3px] border-slate-200 border-t-mv-blue animate-spin" />
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-600">Escaneando portfolio <span className={activeType?.color}>{activeType?.label}</span></p>
                  <p className="text-xs text-slate-400 mt-1">Verificando tareas en cada proyecto...</p>
                </div>
              </div>
            ) : projectsError ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                <XCircle size={18} className="text-mv-coral shrink-0" />
                <p className="text-sm text-mv-coral">{projectsError}</p>
              </div>
            ) : (
              <>
                {portfolioStats && (
                  <div className="flex items-center gap-4 mb-5">
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${activeType?.bgLight} border ${activeType?.borderActive}`}>
                      <span className={`text-2xl font-bold ${activeType?.color}`}>{portfolioStats.unparametrized}</span>
                      <span className="text-xs text-slate-500">pendientes</span>
                    </div>
                    <span className="text-xs text-slate-400">de {portfolioStats.active} activos ({portfolioStats.total} totales)</span>
                  </div>
                )}

                {portfolioProjects.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-50 flex items-center justify-center">
                      <CheckCircle size={28} className="text-mv-green" />
                    </div>
                    <p className="font-semibold text-slate-700">Todo al día</p>
                    <p className="text-sm text-slate-400 mt-1">No hay proyectos pendientes en {activeType?.label}</p>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                    {portfolioProjects.map(p => (
                      <button
                        key={p.gid}
                        onClick={() => handleSelectProject(p)}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-150 flex items-center justify-between gap-3 group ${
                          selectedAsanaProject?.gid === p.gid
                            ? 'border-mv-navy bg-slate-50 shadow-sm'
                            : 'border-transparent hover:bg-slate-50 hover:border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                            selectedAsanaProject?.gid === p.gid ? 'bg-mv-green' : 'bg-slate-300 group-hover:bg-slate-400'
                          }`} />
                          <span className="text-sm text-slate-700 truncate">{p.name}</span>
                        </div>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-300 hover:text-mv-blue transition-colors shrink-0"
                        >
                          <ExternalLink size={13} />
                        </a>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showResults && parsed && estimations && (
        <>
          {/* Summary */}
          <div className="slide-up">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <Target size={18} className="text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Resumen detectado</h2>
              </div>
              {parsed.parseWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex items-center gap-3">
                  <AlertTriangle size={16} className="text-mv-orange shrink-0" />
                  <p className="text-sm text-slate-600">{parsed.parseWarnings.join(' | ')}</p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                <StatPill label="Empresa" value={parsed.company || '-'} />
                <StatPill label="País" value={parsed.country || '-'} />
                <StatPill label="Plan" value={parsed.plan} />
                <StatPill label="Tipo" value={parsed.type} />
                <StatPill label="Canales" value={parsed.totalChannels} highlight />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Canales detectados</label>
                <div className="flex flex-wrap gap-2">
                  {uniqueChannels.map(ch => {
                    const count = parsed.channels.filter(c => c === ch).length
                    return (
                      <span key={ch} className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200">
                        {ch}{count > 1 && <span className="ml-1.5 text-mv-blue font-bold">×{count}</span>}
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Estimates + Date */}
          <div className="slide-up">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <TrendingUp size={18} className="text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Estimación y fecha de inicio</h2>
                <div className="ml-auto">
                  {calibration?.source === 'live' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-mv-green" title={`Coeficientes recalculados desde Asana · ${new Date(calibration.generatedAt).toLocaleDateString('es-CL')}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-mv-green" />
                      Calibrado con {calibration.sampleSize} proyectos reales
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-400" title="Fórmulas estáticas calibradas con 1.083 proyectos históricos (jul 2026)">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                      Calibración estática
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {ESTIMATE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setEstimateType(opt.value)}
                    className={`p-5 rounded-2xl border-2 text-center transition-all duration-200 card-hover ${
                      estimateType === opt.value
                        ? `${opt.iconBg} border-current ${opt.color}`
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full ${opt.iconBg} flex items-center justify-center mx-auto mb-3`}>
                      <TrendingUp size={18} className={opt.iconColor} />
                    </div>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{opt.label}</div>
                    <div className={`text-4xl font-bold ${opt.color}`}>{estimations[opt.value]}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {Math.ceil(estimations[opt.value] / 7)} semanas · {opt.sublabel}
                    </div>
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Fecha de inicio</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full md:w-56 px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-mv-blue/30 focus:border-mv-blue transition-all"
                />
              </div>
            </div>
          </div>

          {/* Tasks table */}
          <div className="slide-up">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <CheckSquare size={18} className="text-slate-400" />
                  <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Tareas generadas</h2>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-mv-navy text-white text-xs font-semibold">
                  <CheckSquare size={12} />
                  {tasks.length}
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Sección</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Tarea</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t, i) => (
                      <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap text-xs">{t.section}</td>
                        <td className="px-4 py-2.5 text-slate-600">{t.task}</td>
                        <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{t.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Send to Asana */}
          <div className="slide-up">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <Send size={18} className="text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Enviar a Asana</h2>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Proyecto destino</p>
                    <p className="text-sm font-medium text-slate-700">{selectedAsanaProject.name}</p>
                  </div>
                  <a
                    href={selectedAsanaProject.url || `https://app.asana.com/0/${selectedAsanaProject.gid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-mv-blue transition-colors"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>

                {sendResult ? (
                  <div className={`rounded-xl p-5 border ${
                    sendResult.errors.length === 0
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-amber-50 border-amber-200'
                  }`}>
                    <div className="flex items-center gap-3 mb-2">
                      {sendResult.errors.length === 0 ? (
                        <CheckCircle size={20} className="text-mv-green" />
                      ) : (
                        <AlertTriangle size={20} className="text-mv-orange" />
                      )}
                      <p className="font-semibold text-slate-700">
                        {sendResult.created} tareas creadas
                        {sendResult.errors.length > 0 && ` · ${sendResult.errors.length} errores`}
                      </p>
                    </div>
                    {sendResult.errors.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {sendResult.errors.map((e, i) => (
                          <p key={i} className="text-xs text-mv-coral">{e.task}: {e.error}</p>
                        ))}
                      </div>
                    )}
                    <a
                      href={selectedAsanaProject.url || `https://app.asana.com/0/${selectedAsanaProject.gid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 mt-4 text-sm font-medium text-mv-blue hover:text-mv-navy transition-colors"
                    >
                      <ExternalLink size={14} />
                      Abrir proyecto en Asana
                    </a>
                  </div>
                ) : sendingToAsana ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Loader2 size={18} className="animate-spin text-mv-blue" />
                      <span className="text-sm text-slate-600">{sendProgress.message}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5">
                      <div
                        className="brand-gradient h-1.5 rounded-full transition-all duration-300"
                        style={{ width: sendProgress.total ? `${(sendProgress.current / sendProgress.total) * 100}%` : '0%' }}
                      />
                    </div>
                    <p className="text-xs text-slate-400 text-right">{sendProgress.current} / {sendProgress.total}</p>
                  </div>
                ) : (
                  <button
                    onClick={handleSendToAsana}
                    className="w-full brand-gradient hover:opacity-90 text-white py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 hover:shadow-lg hover:shadow-mv-navy/20 active:scale-[0.99] flex items-center justify-center gap-2"
                  >
                    <Send size={16} />
                    Crear {tasks.length} tareas en Asana
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* CSV fallback - compact */}
          <div className="slide-up">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Exportar como alternativa</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyName}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg transition-all"
                  >
                    {copied ? <CheckCircle size={12} /> : <Copy size={12} />}
                    {copied ? 'Copiado' : 'Copiar nombre'}
                  </button>
                  <button
                    onClick={handleDownloadCSV}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg transition-all"
                  >
                    <Download size={12} />
                    CSV
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Formula reference */}
          <div className="text-xs text-slate-300 text-center py-2">
            {(() => {
              const s = activeCalibration.segments
              return `Starter: ${s.starter.base}+${s.starter.perChannel}×ch | Pro: ${s.pro.base}+${s.pro.perChannel}×ch | Advanced: ${s.advanced.base}+${s.advanced.perChannel}×ch | Enterprise: ${s.enterprise.base}+${s.enterprise.perChannel}×ch | Upgrade: ${s.upgrade.base}+${s.upgrade.perChannel}×ch | Reonb: ${s.reonboarding.base}+${s.reonboarding.perChannel}×ch · Complejas: +${activeCalibration.complexExtraDays}d (no Upgrade)`
            })()}
          </div>
        </>
      )}
    </div>
  )
}

function StatPill({ label, value, highlight }) {
  return (
    <div className={`rounded-2xl p-4 text-center ${highlight ? 'brand-gradient text-white' : 'bg-white border border-slate-200'}`}>
      <label className={`block text-[10px] font-semibold uppercase tracking-wider mb-1 ${highlight ? 'text-white/60' : 'text-slate-400'}`}>{label}</label>
      <div className={`text-lg font-bold ${highlight ? 'text-white' : 'text-slate-700'}`}>{value}</div>
    </div>
  )
}
