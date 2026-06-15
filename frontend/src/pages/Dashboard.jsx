import { useEffect } from 'react'
import useStore from '../store/useStore'
import StatusCard from '../components/StatusCard'
import ProposalsTable from '../components/ProposalsTable'

const CARD_CONFIG = [
  { title: 'Analisar', status: 'ANALISAR', bgColor: '#2563EB' },
  { title: 'Analisar Documento', status: 'ANALISAR_DOCUMENTO', bgColor: '#1D4ED8' },
  { title: 'Aprovar', status: 'APROVAR', bgColor: '#4F46E5' },
  { title: 'Pendente', status: 'PENDENTE', bgColor: '#EA580C' },
  { title: 'Pendência Regularizada', status: 'PENDENCIA_REGULARIZADA', bgColor: '#DC2626' },
  { title: 'Agendada', status: 'AGENDADA', bgColor: '#D97706' },
  { title: 'Aprovadas', status: 'APROVADA', bgColor: '#16A34A' },
  { title: 'Reprovadas', status: 'REPROVADA', bgColor: '#9F1239' },
  { title: 'Não Mapeadas', status: 'NAO_MAPEADA', bgColor: '#0284C7' },
  { title: 'Aguardando Banco', status: 'AGUARDANDO_BANCO', bgColor: '#6B7280' }
]

function formatCurrency(value) {
  if (value == null || isNaN(value)) return 'R$ 0,00'
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function StatPill({ label, value, color }) {
  return (
    <div
      className="flex flex-col items-center justify-center px-4 py-3 rounded-xl flex-shrink-0"
      style={{ backgroundColor: 'var(--bg-card)', minWidth: '130px' }}
    >
      <span className="text-xs uppercase tracking-wide font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span className="text-lg font-black" style={{ color: color ?? 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  )
}

export default function Dashboard() {
  const {
    summary,
    propostas,
    filtroStatus,
    loading,
    fetchPropostas,
    fetchSummary,
    setFiltroStatus
  } = useStore()

  useEffect(() => {
    fetchSummary()
    fetchPropostas()
  }, [])

  // Calcula stats rápidas a partir do summary
  const totalPropostas = summary.reduce((acc, s) => acc + (s.quantidade ?? 0), 0)
  const totalValor = summary.reduce((acc, s) => acc + (Number(s.valor_total) || 0), 0)
  const aprovadas = summary.find((s) => s.status === 'APROVADA')?.quantidade ?? 0
  const aprovacaoPct =
    totalPropostas > 0 ? ((aprovadas / totalPropostas) * 100).toFixed(1) : '0.0'

  // Monta mapa de summary por status
  const summaryMap = {}
  summary.forEach((s) => {
    summaryMap[s.status] = s
  })

  return (
    <div className="flex flex-col gap-6">
      {/* Stats rápidas */}
      <div className="overflow-x-auto pb-1 -mx-1 px-1">
      <div className="flex gap-3 items-center" style={{ minWidth: 'max-content' }}>
        <StatPill label="Total de Propostas" value={totalPropostas} color="var(--text-primary)" />
        <StatPill label="Valor Total" value={formatCurrency(totalValor)} color="#16A34A" />
        <StatPill label="Taxa de Aprovação" value={`${aprovacaoPct}%`} color="#2563EB" />
        <StatPill label="Aprovadas" value={aprovadas} color="#16A34A" />
        <StatPill
          label="Reprovadas"
          value={summary.find((s) => s.status === 'REPROVADA')?.quantidade ?? 0}
          color="#E11D48"
        />
        {filtroStatus && (
          <button
            onClick={() => setFiltroStatus(filtroStatus)}
            className="flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-xl transition-all hover:opacity-80"
            style={{ backgroundColor: '#DC2626', color: '#fff' }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Limpar filtro
          </button>
        )}
      </div>
      </div>

      {/* Grid de StatusCards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {CARD_CONFIG.map((cfg) => {
          const summaryItem = summaryMap[cfg.status]
          const active = filtroStatus === cfg.status
          return (
            <div
              key={cfg.status}
              className="transition-opacity duration-150"
              style={{ opacity: filtroStatus && !active ? 0.55 : 1 }}
            >
              <StatusCard
                title={cfg.title}
                quantidade={summaryItem?.quantidade ?? 0}
                valorTotal={summaryItem?.valor_total ?? 0}
                bgColor={cfg.bgColor}
                active={active}
                onClick={() => setFiltroStatus(cfg.status)}
              />
            </div>
          )
        })}
      </div>

      {/* Tabela de propostas */}
      <ProposalsTable />
    </div>
  )
}
