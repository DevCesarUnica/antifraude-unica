import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getPropostasDashboard, aprovarProposta, bloquearProposta, reprocessarProposta } from "@/lib/api";
import PropostaDetalheModal, { type PropostaDashboard } from "@/components/PropostaDetalheModal";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface DashboardResponse {
  items: PropostaDashboard[];
  total: number;
  skip: number;
  limit: number;
}

// ── Helpers de formatação (usados na tabela) ─────────────────────────────────

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtCPF(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return cpf;
}

function fmtData(s: string | null | undefined): string {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yyyy HH:mm", { locale: ptBR }); }
  catch { return s; }
}

function fmtDataSo(s: string | null | undefined): string {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yyyy", { locale: ptBR }); }
  catch { return s; }
}

function safe(v: unknown): string {
  if (v == null) return "—";
  return String(v) || "—";
}

// ── Info de colunas ───────────────────────────────────────────────────────────

interface ColInfoData {
  title: string;
  icon: string;
  description: string;
  details: string[];
}

const COL_INFO: Record<string, ColInfoData> = {
  ade: {
    title: "Proposta (ADE)",
    icon: "🔢",
    description: "Código identificador único da proposta no sistema antifraude, gerado automaticamente no momento da importação.",
    details: [
      "O chip colorido ao lado indica a origem: HOPE (vermelho), STORM (azul) ou MANUAL (cinza).",
      "Use este código para rastrear a proposta em auditorias e comunicações com o banco.",
      "Clique no cabeçalho para ordenar por código de proposta.",
    ],
  },
  arq: {
    title: "Arquivos Anexados",
    icon: "📎",
    description: "Indica se a proposta possui documentos ou comprovantes vinculados.",
    details: [
      "📎 verde = há arquivos anexados (documentos, contratos, fotos, comprovantes).",
      "— = nenhum arquivo foi vinculado a esta proposta.",
      "Propostas com documentação completa agilizam a análise e aprovação.",
    ],
  },
  banco: {
    title: "Banco",
    icon: "🏦",
    description: "Instituição financeira responsável pela concessão e processamento do crédito.",
    details: [
      "Indica qual banco receberá a proposta após aprovação pela mesa de crédito.",
      "Cada banco possui regras, prazos e critérios próprios de análise.",
      "Clique no cabeçalho para agrupar e ordenar por banco.",
    ],
  },
  convenio: {
    title: "Convênio",
    icon: "🤝",
    description: "Entidade ou empresa conveniada que autoriza o desconto em folha de pagamento do cliente.",
    details: [
      "Pode ser INSS, Prefeitura, Governo Estadual, Forças Armadas ou empresa privada.",
      "O convênio define a margem consignável disponível e as regras de elegibilidade.",
      "Propostas sem convênio identificado podem exigir validação adicional pela equipe.",
    ],
  },
  produto: {
    title: "Produto",
    icon: "📋",
    description: "Modalidade da operação de crédito ofertada ao cliente.",
    details: [
      "Exemplos: Crédito Consignado, Refinanciamento, Portabilidade, Novo Empréstimo, Cartão.",
      "Cada produto tem taxas, prazos e regras de margem distintos.",
      "O tipo de produto impacta diretamente nos critérios de análise do motor antifraude.",
    ],
  },
  corretor: {
    title: "Corretor",
    icon: "👤",
    description: "Profissional responsável pela captação, cadastro e envio da proposta.",
    details: [
      "Cada proposta é vinculada ao corretor que a inseriu no sistema.",
      "O histórico individual pode ser consultado nos relatórios de desempenho.",
      "Padrões suspeitos de um mesmo corretor são sinalizados automaticamente pelo motor de regras.",
    ],
  },
  valor: {
    title: "Valor da Operação",
    icon: "💰",
    description: "Valor bruto da operação em reais, conforme informado na proposta.",
    details: [
      "Exibido no formato R$ com separador de milhar e duas casas decimais.",
      "Representa o valor total liberado ao cliente, antes de tarifas e encargos.",
      "Clique no cabeçalho para ordenar do menor para o maior valor e vice-versa.",
    ],
  },
  status: {
    title: "Situação da Proposta",
    icon: "🚦",
    description: "Status atual da proposta no fluxo de análise antifraude.",
    details: [
      "🟡 Analisar — aguardando revisão manual pela equipe da mesa de crédito.",
      "🔵 Em Análise — em processamento automático pelo motor de regras.",
      "⚫ Enfileirada — na fila de entrada, aguardando início do processamento.",
      "🟢 Aprovada / Confirmada — liberada e confirmada para envio ao banco.",
      "🟣 Enviada — encaminhada ao banco aguardando contratação.",
      "🔴 Bloqueada / Reprovada — barrada por suspeita de fraude ou não conformidade.",
      "🟠 Erro — falha técnica no processamento; utilize 'Reprocessar' para nova tentativa.",
    ],
  },
  cpf: {
    title: "CPF do Cliente",
    icon: "🪪",
    description: "Cadastro de Pessoa Física do titular da proposta de crédito.",
    details: [
      "Exibido no formato 000.000.000-00 para facilitar leitura e conferência.",
      "Utilizado para verificar duplicidades e histórico de propostas do mesmo cliente.",
      "O motor antifraude cruza o CPF com listas de restrição, blacklist interna e base de fraudes.",
    ],
  },
  nome_cliente: {
    title: "Nome do Cliente",
    icon: "🧑",
    description: "Nome completo do titular da proposta conforme cadastro.",
    details: [
      "Deve coincidir com o documento de identidade e o cadastro na entidade conveniada.",
      "Clique no cabeçalho para ordenar as propostas alfabeticamente por nome.",
      "Quando o nome é truncado, passe o mouse sobre ele para ver o nome completo.",
    ],
  },
  obs: {
    title: "Observações",
    icon: "📝",
    description: "Campo livre para anotações internas da equipe sobre a proposta.",
    details: [
      "Registra justificativas de decisão, pendências, alertas ou informações adicionais.",
      "Visível apenas para a equipe interna — não é transmitido ao banco.",
      "Passe o mouse sobre o texto truncado para visualizar a observação completa.",
    ],
  },
  criado_em: {
    title: "Data de Importação",
    icon: "📥",
    description: "Data e hora em que a proposta entrou no sistema antifraude.",
    details: [
      "Registrado automaticamente ao importar via integração (HOPE/STORM) ou cadastro manual.",
      "Exibido no formato DD/MM/AAAA HH:MM (horário de Brasília).",
      "Clique no cabeçalho para ordenar pelas propostas mais recentes ou mais antigas.",
    ],
  },
  atualizado_em: {
    title: "Última Atualização",
    icon: "🔄",
    description: "Data e hora da última modificação de status ou dados da proposta.",
    details: [
      "Atualizado automaticamente a cada mudança de status, edição de dados ou nova ação.",
      "Permite identificar propostas estagnadas que podem precisar de atenção.",
      "Clique no cabeçalho para ordenar pelas propostas mais recentemente movimentadas.",
    ],
  },
  agend: {
    title: "Agendamento",
    icon: "📅",
    description: "Data programada para análise, contato ou ação sobre a proposta.",
    details: [
      "Permite à mesa de crédito organizar a fila de trabalho por data prevista.",
      "Propostas sem agendamento definido exibem '—'.",
      "Utilize o agendamento para priorizar propostas com prazo ou compromisso definido.",
    ],
  },
  acoes: {
    title: "Ações Disponíveis",
    icon: "⚡",
    description: "Abre o painel de operações para executar ações sobre a proposta selecionada.",
    details: [
      "Aprovar — libera a proposta e encaminha ao banco para contratação.",
      "Bloquear — marca como suspeita, impede o envio e registra o motivo.",
      "Reprocessar — reenvia ao motor antifraude para nova análise automática.",
      "Detalhes — exibe o histórico completo, documentos e todos os dados da proposta.",
    ],
  },
};

// ── Popup de informação de coluna ─────────────────────────────────────────────

function ColInfoButton({ colKey }: { colKey: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const info = COL_INFO[colKey];

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (
        btnRef.current?.contains(e.target as Node) ||
        popupRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  if (!info) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const popupW = 310;
      let left = rect.left;
      if (left + popupW > window.innerWidth - 12) left = window.innerWidth - popupW - 12;
      if (left < 12) left = 12;
      setPos({ top: rect.bottom + 6, left });
    }
    setOpen((o) => !o);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleClick}
        title={`O que é ${info.title}?`}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 14, height: 14, borderRadius: "50%",
          fontSize: 8, fontWeight: 800, lineHeight: 1,
          backgroundColor: open ? "rgba(96,165,250,0.3)" : "rgba(96,165,250,0.12)",
          color: open ? "#93c5fd" : "#60a5fa",
          border: `1px solid ${open ? "rgba(96,165,250,0.5)" : "rgba(96,165,250,0.25)"}`,
          cursor: "pointer", flexShrink: 0,
          transition: "all 0.15s ease",
          verticalAlign: "middle",
        }}
      >
        ?
      </button>

      {mounted && open && createPortal(
        <div
          ref={popupRef}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            zIndex: 99999,
            width: 310,
            backgroundColor: "#0f1520",
            border: "1px solid rgba(96,165,250,0.2)",
            borderRadius: 12,
            boxShadow: "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(96,165,250,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
            overflow: "hidden",
            opacity: 1,
          }}
        >
          {/* Accent line */}
          <div style={{ height: 2, background: "linear-gradient(90deg, #3b82f6, #8b5cf6)" }} />

          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 14px 10px",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}>
            <span style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              backgroundColor: "rgba(59,130,246,0.12)",
              fontSize: 16,
            }}>
              {info.icon}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {info.title}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              style={{
                background: "none", border: "none", color: "#475569",
                cursor: "pointer", fontSize: 12, lineHeight: 1,
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 20, height: 20, borderRadius: 4,
                transition: "color 0.1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#94a3b8")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: "12px 14px 14px" }}>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
              {info.description}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {info.details.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ color: "#3b82f6", fontWeight: 700, fontSize: 11, flexShrink: 0, marginTop: 1 }}>›</span>
                  <span style={{ fontSize: 11, color: "#64748b", lineHeight: 1.55 }}>{d}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.04)", backgroundColor: "rgba(0,0,0,0.2)" }}>
            <p style={{ margin: 0, fontSize: 10, color: "#334155", fontStyle: "italic" }}>
              Mesa de Crédito · Sistema Antifraude Unica
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Badge de status ──────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  APROVADA:         { label: "Aprovada",    bg: "rgba(34,197,94,0.15)",   color: "#22c55e" },
  CONFIRMADA_BANCO: { label: "Confirmada",  bg: "rgba(16,185,129,0.15)",  color: "#10b981" },
  ANALISE_MANUAL:   { label: "Analisar",    bg: "rgba(234,179,8,0.15)",   color: "#eab308" },
  EM_ANALISE:       { label: "Em Análise",  bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
  ENFILEIRADA:      { label: "Enfileirada", bg: "rgba(148,163,184,0.15)", color: "#94a3b8" },
  BLOQUEADA:        { label: "Bloqueada",   bg: "rgba(239,68,68,0.15)",   color: "#ef4444" },
  REPROVADA:        { label: "Reprovada",   bg: "rgba(239,68,68,0.15)",   color: "#ef4444" },
  ENVIADA_BANCO:    { label: "Enviada",     bg: "rgba(168,85,247,0.15)",  color: "#a855f7" },
  ERRO:             { label: "Erro",        bg: "rgba(251,146,60,0.15)",  color: "#fb923c" },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, bg: "rgba(148,163,184,0.15)", color: "#94a3b8" };
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ backgroundColor: m.bg, color: m.color }}>
      {m.label}
    </span>
  );
}

function OrigemChip({ origem }: { origem: string }) {
  const meta: Record<string, { label: string; color: string }> = {
    hope:   { label: "HOPE",   color: "#DC2626" },
    storm:  { label: "STORM",  color: "#3b82f6" },
    manual: { label: "MANUAL", color: "#94a3b8" },
  };
  const m = meta[origem] ?? { label: origem.toUpperCase(), color: "#94a3b8" };
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: `${m.color}15`, color: m.color }}>
      {m.label}
    </span>
  );
}

// ── Cabeçalho de coluna ordenável ────────────────────────────────────────────

function ColHeader({
  label, col, orderBy, orderDir, onSort, infoKey,
}: {
  label: string; col: string; orderBy: string; orderDir: "asc" | "desc";
  onSort: (col: string) => void;
  infoKey?: string;
}) {
  const ativo = orderBy === col;
  return (
    <th
      onClick={() => onSort(col)}
      className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap"
      style={{ color: ativo ? "var(--text-primary)" : "var(--text-muted)" }}
    >
      <span className="inline-flex items-center gap-1.5">
        {label}
        {ativo && <span style={{ opacity: 0.7 }}>{orderDir === "desc" ? "↓" : "↑"}</span>}
        {infoKey && <ColInfoButton colKey={infoKey} />}
      </span>
    </th>
  );
}

// ── Filtros ──────────────────────────────────────────────────────────────────

interface Filtros {
  banco: string; status: string; cpf: string; nome: string;
  corretor: string; valor_min: string; valor_max: string;
  data_inicio: string; data_fim: string;
}

const FILTROS_VAZIOS: Filtros = {
  banco: "", status: "", cpf: "", nome: "",
  corretor: "", valor_min: "", valor_max: "",
  data_inicio: "", data_fim: "",
};

const STATUSES_OPCOES = [
  "", "ENFILEIRADA", "EM_ANALISE", "ANALISE_MANUAL", "APROVADA",
  "BLOQUEADA", "REPROVADA", "ENVIADA_BANCO", "CONFIRMADA_BANCO", "ERRO",
];

const inputCls: React.CSSProperties = {
  backgroundColor: "var(--bg-mid)", color: "var(--text-primary)",
  border: "1px solid var(--border)", borderRadius: "0.5rem",
  padding: "0.35rem 0.6rem", fontSize: "0.72rem", outline: "none", width: "100%",
};


// ── Componente principal ──────────────────────────────────────────────────────

const LIMIT = 50;

export default function DashboardPropostasTable() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [aplicados, setAplicados] = useState<Filtros>(FILTROS_VAZIOS);
  const [skip, setSkip] = useState(0);
  const [orderBy, setOrderBy] = useState("criado_em");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("desc");

  const [modalProposta, setModalProposta] = useState<PropostaDashboard | null>(null);

  const carregar = useCallback(async (s: number) => {
    setLoading(true); setErro("");
    try {
      const params: Record<string, unknown> = {
        skip: s,
        limit: LIMIT,
        order_by: orderBy,
        order_dir: orderDir,
      };
      if (aplicados.banco)       params.banco       = aplicados.banco;
      if (aplicados.status)      params.status      = aplicados.status;
      if (aplicados.cpf)         params.cpf         = aplicados.cpf;
      if (aplicados.nome)        params.nome        = aplicados.nome;
      if (aplicados.corretor)    params.corretor    = aplicados.corretor;
      if (aplicados.valor_min)   params.valor_min   = Number(aplicados.valor_min);
      if (aplicados.valor_max)   params.valor_max   = Number(aplicados.valor_max);
      if (aplicados.data_inicio) params.data_inicio = aplicados.data_inicio;
      if (aplicados.data_fim)    params.data_fim    = aplicados.data_fim;

      const res: DashboardResponse = await getPropostasDashboard(params as Parameters<typeof getPropostasDashboard>[0]);
      setData(res);
      setSkip(s);
    } catch {
      setErro("Erro ao carregar propostas. Tente novamente.");
    } finally { setLoading(false); }
  }, [aplicados, orderBy, orderDir]);

  useEffect(() => { carregar(0); }, [aplicados, orderBy, orderDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const aplicarFiltros = () => { setAplicados({ ...filtros }); };
  const limparFiltros  = () => { setFiltros(FILTROS_VAZIOS); setAplicados(FILTROS_VAZIOS); };

  const handleSort = (col: string) => {
    if (col === orderBy) setOrderDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setOrderBy(col); setOrderDir("desc"); }
  };

  const paginaAtual  = Math.floor(skip / LIMIT) + 1;
  const totalPaginas = data ? Math.ceil(data.total / LIMIT) : 1;
  const temFiltro    = Object.values(aplicados).some(Boolean);

  const abrirModal = (p: PropostaDashboard) => setModalProposta(p);

  const acaoModal = (fn: (id: string) => Promise<unknown>) => async () => {
    if (!modalProposta) return;
    await fn(modalProposta.id);
    setModalProposta(null);
    carregar(skip);
  };

  return (
    <div className="space-y-3">
      {/* ── Filtros ─────────────────────────────────────────────────── */}
      <div className="rounded-xl p-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Filtros</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Banco</label>
            <input value={filtros.banco} onChange={(e) => setFiltros({ ...filtros, banco: e.target.value })} onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()} placeholder="Ex: BMG, HOPE..." style={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Status</label>
            <select value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })} style={inputCls}>
              {STATUSES_OPCOES.map((s) => <option key={s} value={s}>{s || "Todos"}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>CPF</label>
            <input value={filtros.cpf} onChange={(e) => setFiltros({ ...filtros, cpf: e.target.value })} onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()} placeholder="000.000.000-00" style={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Nome</label>
            <input value={filtros.nome} onChange={(e) => setFiltros({ ...filtros, nome: e.target.value })} onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()} placeholder="Parte do nome" style={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Corretor</label>
            <input value={filtros.corretor} onChange={(e) => setFiltros({ ...filtros, corretor: e.target.value })} onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()} placeholder="Nome do corretor" style={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Valor mín</label>
            <input type="number" value={filtros.valor_min} onChange={(e) => setFiltros({ ...filtros, valor_min: e.target.value })} placeholder="0,00" style={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Valor máx</label>
            <input type="number" value={filtros.valor_max} onChange={(e) => setFiltros({ ...filtros, valor_max: e.target.value })} placeholder="99999,00" style={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Data início</label>
            <input type="date" value={filtros.data_inicio} onChange={(e) => setFiltros({ ...filtros, data_inicio: e.target.value })} style={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Data fim</label>
            <input type="date" value={filtros.data_fim} onChange={(e) => setFiltros({ ...filtros, data_fim: e.target.value })} style={inputCls} />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={aplicarFiltros} className="px-4 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#DC2626" }}>Pesquisar</button>
          {temFiltro && (
            <button onClick={limparFiltros} className="px-4 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>Limpar</button>
          )}
        </div>
      </div>

      {/* ── Barra de info + paginação ────────────────────────────────── */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {loading ? "Carregando..." : data ? (
            <>{data.total.toLocaleString("pt-BR")} proposta{data.total !== 1 ? "s" : ""}{temFiltro ? " (filtrado)" : ""}</>
          ) : ""}
        </p>
        {data && data.total > LIMIT && (
          <div className="flex items-center gap-2">
            <button
              disabled={skip === 0 || loading}
              onClick={() => carregar(Math.max(0, skip - LIMIT))}
              className="px-3 py-1 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: "var(--bg-mid)", color: skip === 0 ? "var(--text-muted)" : "var(--text-primary)", opacity: skip === 0 ? 0.5 : 1 }}
            >‹ Anterior</button>
            <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}>
              {paginaAtual} / {totalPaginas}
            </span>
            <button
              disabled={paginaAtual >= totalPaginas || loading}
              onClick={() => carregar(skip + LIMIT)}
              className="px-3 py-1 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: "var(--bg-mid)", color: paginaAtual >= totalPaginas ? "var(--text-muted)" : "var(--text-primary)", opacity: paginaAtual >= totalPaginas ? 0.5 : 1 }}
            >Próxima ›</button>
          </div>
        )}
      </div>

      {/* ── Erro ────────────────────────────────────────────────────── */}
      {erro && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
          {erro}
        </p>
      )}

      {/* ── Tabela ──────────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 1200 }}>
            <thead>
              <tr style={{ backgroundColor: "var(--bg-mid)", borderBottom: "2px solid var(--border)" }}>
                <ColHeader label="Proposta (ADE)" col="ade"           orderBy={orderBy} orderDir={orderDir} onSort={handleSort} infoKey="ade" />
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  <span className="inline-flex items-center gap-1.5">Arq. <ColInfoButton colKey="arq" /></span>
                </th>
                <ColHeader label="Banco"          col="banco"         orderBy={orderBy} orderDir={orderDir} onSort={handleSort} infoKey="banco" />
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  <span className="inline-flex items-center gap-1.5">Convênio <ColInfoButton colKey="convenio" /></span>
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  <span className="inline-flex items-center gap-1.5">Produto <ColInfoButton colKey="produto" /></span>
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  <span className="inline-flex items-center gap-1.5">Corretor <ColInfoButton colKey="corretor" /></span>
                </th>
                <ColHeader label="Valor"          col="valor"         orderBy={orderBy} orderDir={orderDir} onSort={handleSort} infoKey="valor" />
                <ColHeader label="Situação"       col="status"        orderBy={orderBy} orderDir={orderDir} onSort={handleSort} infoKey="status" />
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  <span className="inline-flex items-center gap-1.5">CPF <ColInfoButton colKey="cpf" /></span>
                </th>
                <ColHeader label="Cliente"        col="nome_cliente"  orderBy={orderBy} orderDir={orderDir} onSort={handleSort} infoKey="nome_cliente" />
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  <span className="inline-flex items-center gap-1.5">Obs. <ColInfoButton colKey="obs" /></span>
                </th>
                <ColHeader label="Importação"     col="criado_em"     orderBy={orderBy} orderDir={orderDir} onSort={handleSort} infoKey="criado_em" />
                <ColHeader label="Atualização"    col="atualizado_em" orderBy={orderBy} orderDir={orderDir} onSort={handleSort} infoKey="atualizado_em" />
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  <span className="inline-flex items-center gap-1.5">Agend. <ColInfoButton colKey="agend" /></span>
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  <span className="inline-flex items-center justify-end gap-1.5">Ações <ColInfoButton colKey="acoes" /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={15} className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>Carregando propostas...</td></tr>
              )}
              {!loading && (!data || data.items.length === 0) && (
                <tr><td colSpan={15} className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>
                  {temFiltro ? "Nenhuma proposta encontrada para os filtros." : "Nenhuma proposta cadastrada."}
                </td></tr>
              )}
              {!loading && data?.items.map((p, idx) => (
                <tr
                  key={p.id}
                  style={{
                    backgroundColor: idx % 2 === 0 ? "var(--bg-row-even)" : "var(--bg-row-odd)",
                    borderBottom: "1px solid var(--border-mid)",
                  }}
                >
                  {/* Proposta ADE */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <OrigemChip origem={p.origem} />
                      <span className="font-mono font-bold text-[10px]" style={{ color: "#DC2626" }}>{p.ade}</span>
                    </div>
                  </td>
                  {/* Arquivos */}
                  <td className="px-3 py-2.5 text-center">
                    {p.possui_arquivos
                      ? <span style={{ color: "#22c55e" }}>📎</span>
                      : <span style={{ color: "var(--text-muted)", opacity: 0.3 }}>—</span>}
                  </td>
                  {/* Banco */}
                  <td className="px-3 py-2.5 whitespace-nowrap font-medium" style={{ color: "var(--text-primary)" }}>{p.banco}</td>
                  {/* Convênio */}
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary, var(--text-muted))", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{safe(p.convenio)}</td>
                  {/* Produto */}
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{safe(p.produto)}</td>
                  {/* Corretor */}
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{safe(p.corretor)}</td>
                  {/* Valor */}
                  <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{fmtBRL(p.valor)}</td>
                  {/* Situação */}
                  <td className="px-3 py-2.5"><StatusBadge status={p.status} /></td>
                  {/* CPF */}
                  <td className="px-3 py-2.5 font-mono whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{fmtCPF(p.cpf)}</td>
                  {/* Nome */}
                  <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{safe(p.nome_cliente)}</td>
                  {/* Obs */}
                  <td className="px-3 py-2.5" style={{ color: "var(--text-muted)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.observacoes ? <span title={p.observacoes}>{p.observacoes.slice(0, 35)}{p.observacoes.length > 35 ? "…" : ""}</span> : "—"}
                  </td>
                  {/* Importação */}
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{fmtData(p.data_importacao)}</td>
                  {/* Atualização */}
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{fmtData(p.data_atualizacao)}</td>
                  {/* Agendamento */}
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{fmtDataSo(p.data_agendamento)}</td>
                  {/* Ações */}
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => abrirModal(p)}
                      className="px-3 py-1 rounded-lg text-[10px] font-bold"
                      style={{ backgroundColor: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.25)" }}
                    >
                      Opções
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal ───────────────────────────────────────────────────── */}
      {modalProposta && (
        <PropostaDetalheModal
          proposta={modalProposta}
          onClose={() => setModalProposta(null)}
          onAprovar={acaoModal(aprovarProposta)}
          onBloquear={acaoModal(bloquearProposta)}
          onReprocessar={acaoModal(reprocessarProposta)}
        />
      )}
    </div>
  );
}
