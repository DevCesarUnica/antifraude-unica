import { useState, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  getPropostasDashboard,
  getAuditoriaProposta,
  aprovarProposta,
  bloquearProposta,
  reprocessarProposta,
} from "@/lib/api";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface PropostaDashboard {
  id: string;
  ade: string;
  banco: string;
  convenio: string | null;
  produto: string | null;
  corretor: string | null;
  corretor_id: string | null;
  valor: number;
  status: string;
  cpf: string;
  nome_cliente: string | null;
  uf_cliente: string | null;
  observacoes: string | null;
  data_importacao: string;
  data_atualizacao: string;
  data_agendamento: string | null;
  possui_arquivos: boolean;
  score_fraude: number | null;
  resultado_motor: string | null;
  origem: string;
  tentativas: number;
}

interface DashboardResponse {
  items: PropostaDashboard[];
  total: number;
  skip: number;
  limit: number;
}

interface AuditoriaItem {
  evento: string;
  dados: Record<string, unknown>;
  usuario: string | null;
  timestamp: string;
}

// ── Helpers de formatação ────────────────────────────────────────────────────

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
  try {
    return format(new Date(s), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return s;
  }
}

function fmtDataSo(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return format(new Date(s), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return s;
  }
}

function safe(v: unknown): string {
  if (v == null) return "—";
  return String(v) || "—";
}

// ── Badge de status ──────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  APROVADA:         { label: "Aprovada",        bg: "rgba(34,197,94,0.15)",   color: "#22c55e" },
  CONFIRMADA_BANCO: { label: "Confirmada",      bg: "rgba(16,185,129,0.15)",  color: "#10b981" },
  ANALISE_MANUAL:   { label: "Analisar",        bg: "rgba(234,179,8,0.15)",   color: "#eab308" },
  EM_ANALISE:       { label: "Em Análise",      bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
  ENFILEIRADA:      { label: "Enfileirada",     bg: "rgba(148,163,184,0.15)", color: "#94a3b8" },
  BLOQUEADA:        { label: "Bloqueada",       bg: "rgba(239,68,68,0.15)",   color: "#ef4444" },
  REPROVADA:        { label: "Reprovada",       bg: "rgba(239,68,68,0.15)",   color: "#ef4444" },
  ENVIADA_BANCO:    { label: "Enviada",         bg: "rgba(168,85,247,0.15)",  color: "#a855f7" },
  ERRO:             { label: "Erro",            bg: "rgba(251,146,60,0.15)",  color: "#fb923c" },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, bg: "rgba(148,163,184,0.15)", color: "#94a3b8" };
  return (
    <span
      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap"
      style={{ backgroundColor: m.bg, color: m.color }}
    >
      {m.label}
    </span>
  );
}

// ── Score chip ───────────────────────────────────────────────────────────────

function ScoreChip({ score }: { score: number | null }) {
  if (score == null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const color = score >= 80 ? "#ef4444" : score >= 40 ? "#eab308" : "#22c55e";
  return (
    <span className="font-bold text-xs" style={{ color }}>{score}</span>
  );
}

// ── Origem chip ──────────────────────────────────────────────────────────────

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
  label, col, orderBy, orderDir, onSort,
}: {
  label: string; col: string; orderBy: string; orderDir: "asc" | "desc";
  onSort: (col: string) => void;
}) {
  const ativo = orderBy === col;
  return (
    <th
      onClick={() => onSort(col)}
      className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap"
      style={{ color: ativo ? "var(--text-primary)" : "var(--text-muted)" }}
    >
      {label}{" "}
      {ativo && <span style={{ opacity: 0.7 }}>{orderDir === "desc" ? "↓" : "↑"}</span>}
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

// ── Modal de detalhes ────────────────────────────────────────────────────────

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{children}</p>
    </div>
  );
}

function ModalDetalhes({
  proposta,
  onClose,
  onAprovar,
  onBloquear,
  onReprocessar,
}: {
  proposta: PropostaDashboard;
  onClose: () => void;
  onAprovar: () => Promise<void>;
  onBloquear: () => Promise<void>;
  onReprocessar: () => Promise<void>;
}) {
  const [auditoria, setAuditoria] = useState<AuditoriaItem[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [acao, setAcao] = useState<"aprovar" | "bloquear" | "reprocessar" | null>(null);
  const [loadingAcao, setLoadingAcao] = useState(false);
  const [msgAcao, setMsgAcao] = useState("");

  useEffect(() => {
    setLoadingAudit(true);
    getAuditoriaProposta(proposta.id)
      .then((d: AuditoriaItem[]) => setAuditoria(d ?? []))
      .catch(() => setAuditoria([]))
      .finally(() => setLoadingAudit(false));
  }, [proposta.id]);

  const executar = async () => {
    if (!acao) return;
    setLoadingAcao(true); setMsgAcao("");
    try {
      if (acao === "aprovar") await onAprovar();
      else if (acao === "bloquear") await onBloquear();
      else await onReprocessar();
      onClose();
    } catch {
      setMsgAcao("Erro ao executar ação. Verifique o console.");
      setLoadingAcao(false);
    }
  };

  const podeAprovar     = proposta.status === "ANALISE_MANUAL";
  const podeBloquear    = ["ANALISE_MANUAL", "APROVADA", "EM_ANALISE"].includes(proposta.status);
  const podeReprocessar = ["ERRO", "BLOQUEADA"].includes(proposta.status);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex flex-col rounded-2xl overflow-hidden w-full max-w-3xl max-h-[92vh]"
        style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-mid)" }}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-black font-mono" style={{ color: "#DC2626" }}>{proposta.ade}</span>
              <StatusBadge status={proposta.status} />
              <OrigemChip origem={proposta.origem} />
              {proposta.score_fraude != null && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: "var(--bg-card)", color: "var(--text-muted)" }}>
                  Score: <ScoreChip score={proposta.score_fraude} />
                </span>
              )}
            </div>
            <p className="text-base font-bold mt-1" style={{ color: "var(--text-primary)" }}>{proposta.nome_cliente ?? "—"}</p>
            <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{fmtCPF(proposta.cpf)}</p>
          </div>
          <button onClick={onClose} className="ml-4 text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ backgroundColor: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>✕ Fechar</button>
        </div>

        {/* Corpo com scroll */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {/* Dados da proposta */}
          <section>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: "#DC2626" }}>Dados da Proposta</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
              <Campo label="Banco">{proposta.banco}</Campo>
              <Campo label="Convênio">{safe(proposta.convenio)}</Campo>
              <Campo label="Produto">{safe(proposta.produto)}</Campo>
              <Campo label="Valor"><span className="font-bold">{fmtBRL(proposta.valor)}</span></Campo>
              <Campo label="Corretor">{safe(proposta.corretor)}</Campo>
              <Campo label="UF">{safe(proposta.uf_cliente)}</Campo>
              <Campo label="Resultado Motor">{safe(proposta.resultado_motor)}</Campo>
              <Campo label="Tentativas">{String(proposta.tentativas)}</Campo>
              <Campo label="Arquivos">{proposta.possui_arquivos ? "✓ Sim" : "Não"}</Campo>
            </div>
          </section>

          {/* Datas */}
          <section>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: "#DC2626" }}>Datas</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
              <Campo label="Importação">{fmtData(proposta.data_importacao)}</Campo>
              <Campo label="Atualização">{fmtData(proposta.data_atualizacao)}</Campo>
              <Campo label="Agendamento">{fmtDataSo(proposta.data_agendamento)}</Campo>
            </div>
          </section>

          {/* Observações */}
          {proposta.observacoes && (
            <section>
              <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "#DC2626" }}>Observações / Motivo</p>
              <p className="text-xs p-3 rounded-lg" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                {proposta.observacoes}
              </p>
            </section>
          )}

          {/* Histórico de auditoria */}
          <section>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: "#DC2626" }}>Histórico</p>
            {loadingAudit ? (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Carregando histórico...</p>
            ) : auditoria.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Nenhum evento registrado.</p>
            ) : (
              <div className="space-y-1.5">
                {[...auditoria].reverse().map((ev, i) => (
                  <div key={i} className="flex gap-3 py-2 px-3 rounded-lg" style={{ backgroundColor: "var(--bg-mid)", border: "1px solid var(--border)" }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase" style={{ color: "#60a5fa" }}>{ev.evento}</span>
                        {ev.usuario && <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>por {ev.usuario}</span>}
                      </div>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{fmtData(ev.timestamp)}</p>
                      {ev.dados && Object.keys(ev.dados).length > 0 && (
                        <pre className="text-[9px] mt-1 overflow-x-auto" style={{ color: "var(--text-muted)" }}>
                          {JSON.stringify(ev.dados, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Rodapé com ações */}
        <div className="px-6 py-4 flex items-center gap-3 flex-wrap" style={{ borderTop: "1px solid var(--border)", backgroundColor: "var(--bg-mid)" }}>
          <span className="text-[10px] font-bold uppercase tracking-wide mr-2" style={{ color: "var(--text-muted)" }}>Ações:</span>
          {podeAprovar && (
            <button
              onClick={() => setAcao("aprovar")}
              disabled={loadingAcao}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: "#16a34a", opacity: loadingAcao ? 0.65 : 1 }}
            >
              ✓ Aprovar
            </button>
          )}
          {podeBloquear && (
            <button
              onClick={() => setAcao("bloquear")}
              disabled={loadingAcao}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: "#DC2626", opacity: loadingAcao ? 0.65 : 1 }}
            >
              ✕ Bloquear
            </button>
          )}
          {podeReprocessar && (
            <button
              onClick={() => setAcao("reprocessar")}
              disabled={loadingAcao}
              className="px-4 py-1.5 rounded-lg text-xs font-bold"
              style={{ backgroundColor: "rgba(96,165,250,0.15)", color: "#60a5fa" }}
            >
              ↺ Reprocessar
            </button>
          )}
          {!podeAprovar && !podeBloquear && !podeReprocessar && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Nenhuma ação disponível para este status.</span>
          )}
          {acao && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Confirmar <strong>{acao}</strong>?
              </span>
              <button onClick={executar} disabled={loadingAcao} className="px-3 py-1 rounded text-xs font-bold text-white" style={{ backgroundColor: "#DC2626" }}>
                {loadingAcao ? "..." : "Sim"}
              </button>
              <button onClick={() => setAcao(null)} className="px-3 py-1 rounded text-xs font-semibold" style={{ backgroundColor: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                Não
              </button>
            </div>
          )}
          {msgAcao && <p className="text-xs w-full mt-1" style={{ color: "#f87171" }}>{msgAcao}</p>}
        </div>
      </div>
    </div>
  );
}

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
                <ColHeader label="Proposta (ADE)" col="ade"          orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Arq.</th>
                <ColHeader label="Banco"          col="banco"        orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Convênio</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Produto</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Corretor</th>
                <ColHeader label="Valor"          col="valor"        orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <ColHeader label="Situação"       col="status"       orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>CPF</th>
                <ColHeader label="Cliente"        col="nome_cliente" orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Obs.</th>
                <ColHeader label="Importação"     col="criado_em"    orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <ColHeader label="Atualização"    col="atualizado_em" orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Agend.</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Ações</th>
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
        <ModalDetalhes
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
