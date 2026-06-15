import { useState } from 'react'
import useStore from '../store/useStore'
import { importarProposta } from '../services/api'

const STATUS_COLORS = {
  ANALISAR: { bg: '#2563EB', label: 'Analisar' },
  ANALISAR_DOCUMENTO: { bg: '#1D4ED8', label: 'Analisar Doc.' },
  APROVAR: { bg: '#4F46E5', label: 'Aprovar' },
  PENDENTE: { bg: '#EA580C', label: 'Pendente' },
  PENDENCIA_REGULARIZADA: { bg: '#DC2626', label: 'Pend. Regularizada' },
  AGENDADA: { bg: '#D97706', label: 'Agendada' },
  APROVADA: { bg: '#16A34A', label: 'Aprovada' },
  REPROVADA: { bg: '#E11D48', label: 'Reprovada' },
  NAO_MAPEADA: { bg: '#0284C7', label: 'Não Mapeada' },
  AGUARDANDO_BANCO: { bg: '#6B7280', label: 'Aguard. Banco' }
}

function maskCPF(cpf) {
  if (!cpf) return '---'
  const digits = String(cpf).replace(/\D/g, '')
  if (digits.length !== 11) return cpf
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`
}

function formatCurrency(value) {
  if (value == null || isNaN(value)) return 'R$ 0,00'
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(dateStr) {
  if (!dateStr) return '---'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('pt-BR')
  } catch {
    return dateStr
  }
}

function StatusBadge({ status }) {
  const cfg = STATUS_COLORS[status] ?? { bg: '#6B7280', label: status ?? '—' }
  return (
    <span
      className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full text-white whitespace-nowrap"
      style={{ backgroundColor: cfg.bg }}
    >
      {cfg.label}
    </span>
  )
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 10 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className="h-4 rounded animate-pulse"
            style={{ backgroundColor: '#2D2D2D', width: i === 0 ? '40px' : '80px' }}
          />
        </td>
      ))}
    </tr>
  )
}

function gerarMock() {
  const statuses = Object.keys(STATUS_COLORS)
  const bancos = ['Bradesco', 'Itaú', 'Santander', 'BMG', 'Safra', 'PAN', 'Daycoval']
  const nomes = ['João Silva', 'Maria Oliveira', 'Carlos Santos', 'Ana Lima', 'Pedro Costa']
  const corretores = ['Corretor A', 'Corretor B', 'Corretor C']
  const convenios = ['INSS', 'SIAPE', 'Forças Armadas', 'Prefeitura']
  const grupos = ['Grupo Norte', 'Grupo Sul', 'Grupo Leste', 'Grupo Oeste']

  const cpfBase = String(Math.floor(Math.random() * 90000000000) + 10000000000)

  return {
    cpf_cliente: cpfBase,
    nome_cliente: nomes[Math.floor(Math.random() * nomes.length)],
    banco: bancos[Math.floor(Math.random() * bancos.length)],
    valor: parseFloat((Math.random() * 50000 + 1000).toFixed(2)),
    status: statuses[Math.floor(Math.random() * statuses.length)],
    corretor: corretores[Math.floor(Math.random() * corretores.length)],
    grupo: grupos[Math.floor(Math.random() * grupos.length)],
    convenio: convenios[Math.floor(Math.random() * convenios.length)]
  }
}

export default function ProposalsTable() {
  const { propostas, loading, filtroStatus, atualizarStatus, fetchPropostas, fetchSummary } =
    useStore()

  const [propostaSelecionada, setPropostaSelecionada] = useState(null)

  async function handleImportarMock() {
    try {
      await importarProposta(gerarMock())
      await fetchPropostas(filtroStatus)
      await fetchSummary()
    } catch (err) {
      console.error('[ProposalsTable] importar mock error:', err)
    }
  }

  const total = propostas.length

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: 'var(--bg-card)' }}
    >
      {/* Cabeçalho da tabela */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-4"
        style={{ backgroundColor: 'var(--bg-mid)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <h2 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>Propostas</h2>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: '#DC2626' }}
          >
            {total}
          </span>
          {filtroStatus && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: STATUS_COLORS[filtroStatus]?.bg ?? '#6B7280' }}
            >
              Filtro: {STATUS_COLORS[filtroStatus]?.label ?? filtroStatus}
            </span>
          )}
        </div>
        <button
          onClick={handleImportarMock}
          className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg text-white transition-all duration-150 hover:opacity-80 active:scale-95"
          style={{ backgroundColor: '#DC2626' }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Importar Mock
        </button>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-mid)' }}>
              {[
                'ID',
                'CPF Cliente',
                'Banco',
                'Valor',
                'Status',
                'Corretor',
                'Grupo',
                'Convênio',
                'Data',
                'Ações'
              ].map((col) => (
                <th
                  key={col}
                  className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-xs whitespace-nowrap"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : propostas.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-16" style={{ color: '#6B7280' }}>
                  <div className="flex flex-col items-center gap-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-12 h-12 opacity-30"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <p className="text-sm">Nenhuma proposta encontrada</p>
                    {filtroStatus && (
                      <p className="text-xs opacity-60">
                        Filtro ativo: {STATUS_COLORS[filtroStatus]?.label ?? filtroStatus}
                      </p>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              propostas.map((proposta, idx) => (
                <tr
                  key={proposta.id ?? idx}
                  style={{
                    backgroundColor: idx % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)',
                    transition: 'background-color 0.1s ease'
                  }}
                  className="hover:bg-[#DC2626]/10"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(220,38,38,0.08)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      idx % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)'
                  }}
                >
                  {/* ID */}
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: '#6B7280' }}>
                    {proposta.id ?? '—'}
                  </td>

                  {/* CPF */}
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                    {maskCPF(proposta.cpf_cliente)}
                  </td>

                  {/* Banco */}
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                    {proposta.banco ?? '—'}
                  </td>

                  {/* Valor */}
                  <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: '#16A34A' }}>
                    {formatCurrency(proposta.valor)}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <StatusBadge status={proposta.status} />
                  </td>

                  {/* Corretor */}
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                    {typeof proposta.corretor === 'object'
                      ? proposta.corretor?.nome ?? '—'
                      : proposta.corretor ?? '—'}
                  </td>

                  {/* Grupo */}
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                    {proposta.corretor?.grupo?.nome ?? proposta.grupo ?? '—'}
                  </td>

                  {/* Convênio */}
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                    {proposta.convenio ?? '—'}
                  </td>

                  {/* Data */}
                  <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: '#6B7280' }}>
                    {formatDate(proposta.created_at ?? proposta.data)}
                  </td>

                  {/* Ações */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      <ActionBtn
                        color="#16A34A"
                        label="Aprovar"
                        onClick={() => atualizarStatus(proposta.id, 'APROVADA')}
                      />
                      <ActionBtn
                        color="#DC2626"
                        label="Reprovar"
                        onClick={() => atualizarStatus(proposta.id, 'REPROVADA')}
                      />
                      <ActionBtn
                        color="#D97706"
                        label="Analisar"
                        onClick={() => atualizarStatus(proposta.id, 'ANALISAR')}
                      />
                      <ActionBtn
                        color="#6B7280"
                        label="Detalhes"
                        onClick={() => setPropostaSelecionada(proposta)}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {propostaSelecionada && (
        <DetalhesModal
          proposta={propostaSelecionada}
          onClose={() => setPropostaSelecionada(null)}
        />
      )}
    </div>
  )
}

function DetalhesModal({ proposta, onClose }) {
  const corretor = typeof proposta.corretor === 'object' ? proposta.corretor : null
  const corretorNome = corretor?.nome ?? proposta.corretor ?? '—'
  const grupoNome = corretor?.grupo?.nome ?? proposta.grupo ?? '—'
  const grupoLimite = corretor?.grupo?.limite
  const statusCfg = STATUS_COLORS[proposta.status] ?? { bg: '#6B7280', label: proposta.status }

  function Row({ label, value, highlight }) {
    return (
      <div
        className="flex items-start justify-between py-3 gap-4"
        style={{ borderBottom: '1px solid var(--border-mid)' }}
      >
        <span className="text-xs font-semibold uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
          {label}
        </span>
        <span
          className="text-sm text-right font-medium"
          style={{ color: highlight ? 'var(--text-primary)' : 'var(--text-secondary)' }}
        >
          {value}
        </span>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-mid)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho vermelho */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ backgroundColor: '#DC2626' }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-red-200">
              Proposta #{proposta.id ?? '—'}
            </p>
            <h2 className="text-white font-black text-lg leading-tight mt-0.5">
              Detalhes da Proposta
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white transition-all duration-150 hover:bg-white/20 active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Badge de status */}
        <div
          className="px-6 py-3 flex items-center gap-2"
          style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-mid)' }}
        >
          <span className="text-xs text-gray-400 font-medium">Status atual:</span>
          <span
            className="text-xs font-bold px-3 py-1 rounded-full text-white uppercase tracking-wide"
            style={{ backgroundColor: statusCfg.bg }}
          >
            {statusCfg.label}
          </span>
        </div>

        {/* Corpo */}
        <div className="px-6 py-2">
          {/* Seção Cliente */}
          <p className="text-xs font-bold uppercase tracking-widest mt-4 mb-1" style={{ color: '#DC2626' }}>
            ▎ Cliente
          </p>
          <Row label="CPF" value={maskCPF(proposta.cpf_cliente)} highlight />
          {proposta.nome_cliente && <Row label="Nome" value={proposta.nome_cliente} highlight />}

          {/* Seção Operação */}
          <p className="text-xs font-bold uppercase tracking-widest mt-4 mb-1" style={{ color: '#DC2626' }}>
            ▎ Operação
          </p>
          <Row label="Banco" value={proposta.banco ?? '—'} />
          <Row
            label="Valor"
            value={<span className="text-green-400 font-black">{formatCurrency(proposta.valor)}</span>}
          />
          <Row label="Convênio" value={proposta.convenio ?? '—'} />
          <Row label="Data" value={formatDate(proposta.created_at ?? proposta.data)} />

          {/* Seção Distribuição */}
          <p className="text-xs font-bold uppercase tracking-widest mt-4 mb-1" style={{ color: '#DC2626' }}>
            ▎ Distribuição
          </p>
          <Row label="Corretor" value={corretorNome} />
          <Row label="Grupo" value={grupoNome} />
          {grupoLimite != null && (
            <Row label="Limite do Grupo" value={formatCurrency(grupoLimite)} />
          )}

          {/* Observação */}
          {proposta.observacao && (
            <>
              <p className="text-xs font-bold uppercase tracking-widest mt-4 mb-1" style={{ color: '#DC2626' }}>
                ▎ Observação
              </p>
              <p className="text-sm pb-3" style={{ color: '#E5E5E5' }}>{proposta.observacao}</p>
            </>
          )}
        </div>

        {/* Rodapé */}
        <div
          className="px-6 py-4 flex justify-end"
          style={{ borderTop: '1px solid var(--border-mid)', backgroundColor: 'var(--bg-subtle)' }}
        >
          <button
            onClick={onClose}
            className="text-sm font-semibold px-6 py-2 rounded-lg text-white transition-all duration-150 hover:opacity-80 active:scale-95"
            style={{ backgroundColor: '#DC2626' }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

function ActionBtn({ color, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-semibold px-2 py-1 rounded-md text-white transition-all duration-100 active:scale-95 whitespace-nowrap"
      style={{ backgroundColor: color, opacity: 0.9 }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.9')}
    >
      {label}
    </button>
  )
}
