import { useState, Component, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPropostas, aprovarProposta, bloquearProposta, reprocessarProposta } from "@/lib/api";
import Layout from "@/components/Layout";
import { StatusBadge } from "@/lib/statusBadge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Error boundary para capturar crashes e exibir mensagem em vez de tela azul
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 rounded-xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid #ef4444" }}>
          <p className="text-sm font-bold" style={{ color: "#ef4444" }}>Erro ao renderizar propostas</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{String(this.state.error)}</p>
          <button onClick={() => this.setState({ error: null })} className="mt-3 px-3 py-1 text-xs rounded text-white" style={{ backgroundColor: "#2563eb" }}>
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const STATUSES = ["", "ENFILEIRADA", "EM_ANALISE", "APROVADA", "BLOQUEADA", "ANALISE_MANUAL", "ERRO"];

const FILTROS_VAZIOS = { status: "", banco: "", cpf: "", nome: "" };
const LIMIT = 50;

const inputCls: React.CSSProperties = {
  backgroundColor: "var(--bg-mid)", color: "var(--text-primary)",
  border: "1px solid var(--border)", borderRadius: "0.5rem",
  padding: "0.4rem 0.75rem", fontSize: "0.8rem", outline: "none",
  width: "100%",
};

function safe(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v || "—";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "—";
}

function fmtValor(v: unknown): string {
  const n = Number(v);
  if (v == null || isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(v: unknown): string {
  if (!v) return "—";
  try {
    const d = new Date(String(v));
    if (isNaN(d.getTime())) return "—";
    return format(d, "dd/MM/yy HH:mm", { locale: ptBR });
  } catch {
    return "—";
  }
}

export default function PropostasPage() {
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [aplicados, setAplicados] = useState(FILTROS_VAZIOS);
  const [skip, setSkip] = useState(0);
  const qc = useQueryClient();

  const temFiltro = Object.values(aplicados).some(Boolean);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["propostas", aplicados, skip],
    queryFn: () => getPropostas({
      status: aplicados.status || undefined,
      banco:  aplicados.banco  || undefined,
      cpf:    aplicados.cpf    || undefined,
      nome:   aplicados.nome   || undefined,
      skip,
      limit: LIMIT,
    }),
    refetchInterval: 8_000,
  });

  const propostas   = data?.items ?? [];
  const total       = data?.total ?? 0;
  const paginaAtual  = Math.floor(skip / LIMIT) + 1;
  const totalPaginas = Math.max(1, Math.ceil(total / LIMIT));

  const mutAprovar     = useMutation({ mutationFn: aprovarProposta,     onSuccess: () => qc.invalidateQueries({ queryKey: ["propostas"] }) });
  const mutBloquear    = useMutation({ mutationFn: bloquearProposta,    onSuccess: () => qc.invalidateQueries({ queryKey: ["propostas"] }) });
  const mutReprocessar = useMutation({ mutationFn: reprocessarProposta, onSuccess: () => qc.invalidateQueries({ queryKey: ["propostas"] }) });

  const aplicarFiltros = () => { setAplicados({ ...filtros }); setSkip(0); };

  const limparFiltros = () => {
    setFiltros(FILTROS_VAZIOS);
    setAplicados(FILTROS_VAZIOS);
    setSkip(0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") aplicarFiltros();
  };

  return (
    <Layout>
      <div className="flex flex-col gap-4">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>Propostas</h1>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {total.toLocaleString("pt-BR")} registro{total !== 1 ? "s" : ""}
              {temFiltro ? " (filtrado)" : ""}
            </p>
          </div>
        </div>

        {/* Filtros */}
        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Status</label>
              <select value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })} onKeyDown={onKeyDown} style={inputCls}>
                {STATUSES.map((s) => <option key={s} value={s}>{s || "Todos"}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Banco</label>
              <input value={filtros.banco} onChange={(e) => setFiltros({ ...filtros, banco: e.target.value })} onKeyDown={onKeyDown} placeholder="Ex: BMG, HOPE, Pan..." style={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Nome do cliente</label>
              <input value={filtros.nome} onChange={(e) => setFiltros({ ...filtros, nome: e.target.value })} onKeyDown={onKeyDown} placeholder="Parte do nome" style={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>CPF</label>
              <input value={filtros.cpf} onChange={(e) => setFiltros({ ...filtros, cpf: e.target.value })} onKeyDown={onKeyDown} placeholder="000.000.000-00" autoComplete="off" style={inputCls} />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={aplicarFiltros} className="px-4 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-80" style={{ backgroundColor: "#DC2626" }}>
              Pesquisar
            </button>
            {temFiltro && (
              <button onClick={limparFiltros} className="px-4 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* Erro de rede */}
        {isError && (
          <div className="p-4 rounded-xl text-sm" style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid #ef4444", color: "#ef4444" }}>
            Erro ao buscar propostas: {String(error)}
          </div>
        )}

        {/* Tabela */}
        <ErrorBoundary>
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 800 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-subtle)" }}>
                    {["ID Externo", "Nome", "CPF", "Banco", "Valor", "Status", "Score", "Data", ""].map((h, i) => (
                      <th key={i} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide ${i >= 4 ? "text-right" : "text-left"}`}
                        style={{ color: "var(--text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr><td colSpan={9} className="text-center py-10 text-sm" style={{ color: "var(--text-muted)" }}>Carregando...</td></tr>
                  )}
                  {!isLoading && !isError && propostas.length === 0 && (
                    <tr><td colSpan={9} className="text-center py-10 text-sm" style={{ color: "var(--text-muted)" }}>
                      {temFiltro ? "Nenhuma proposta encontrada para os filtros aplicados." : "Nenhuma proposta encontrada."}
                    </td></tr>
                  )}
                  {propostas.map((p: any, idx: number) => {
                    const statusStr = safe(p.status);
                    const score = typeof p.score_fraude === "number" ? p.score_fraude : null;
                    return (
                      <tr key={safe(p.id) || idx} style={{ backgroundColor: idx % 2 === 0 ? "var(--bg-row-even)" : "var(--bg-row-odd)", borderBottom: "1px solid var(--border-mid)" }}>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{safe(p.proposta_id_externo)}</td>
                        <td className="px-4 py-3 text-xs font-medium" style={{ color: "var(--text-primary)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {safe(p.nome_cliente)}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>{safe(p.cpf_cliente)}</td>
                        <td className="px-4 py-3 text-xs font-medium" style={{ color: "var(--text-primary)" }}>{safe(p.banco)}</td>
                        <td className="px-4 py-3 text-right text-xs font-medium" style={{ color: "var(--text-primary)" }}>{fmtValor(p.valor)}</td>
                        <td className="px-4 py-3 text-right">
                          <StatusBadge status={statusStr} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {score != null ? (
                            <span className="font-bold text-xs" style={{ color: score >= 80 ? "#f87171" : score >= 40 ? "#fbbf24" : "#34d399" }}>
                              {score}
                            </span>
                          ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-xs" style={{ color: "var(--text-muted)" }}>{fmtData(p.criado_em)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-end">
                            {p.status === "ANALISE_MANUAL" && (
                              <>
                                <button onClick={() => mutAprovar.mutate(p.id)} className="px-2 py-1 text-xs rounded font-semibold text-white transition-opacity hover:opacity-80" style={{ backgroundColor: "#16a34a" }}>Aprovar</button>
                                <button onClick={() => mutBloquear.mutate(p.id)} className="px-2 py-1 text-xs rounded font-semibold text-white transition-opacity hover:opacity-80" style={{ backgroundColor: "#DC2626" }}>Bloquear</button>
                              </>
                            )}
                            {(p.status === "ERRO" || p.status === "BLOQUEADA") && (
                              <button onClick={() => mutReprocessar.mutate(p.id)} className="px-2 py-1 text-xs rounded font-semibold text-white transition-opacity hover:opacity-80" style={{ backgroundColor: "#2563eb" }}>Reprocessar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paginação */}
          {total > LIMIT && (
            <div className="flex items-center justify-end gap-2 px-1">
              <button
                disabled={skip === 0 || isLoading}
                onClick={() => setSkip(Math.max(0, skip - LIMIT))}
                className="px-3 py-1 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: "var(--bg-mid)", color: skip === 0 ? "var(--text-muted)" : "var(--text-primary)", opacity: skip === 0 ? 0.5 : 1 }}
              >‹ Anterior</button>
              <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}>
                {paginaAtual} / {totalPaginas}
              </span>
              <button
                disabled={paginaAtual >= totalPaginas || isLoading}
                onClick={() => setSkip(skip + LIMIT)}
                className="px-3 py-1 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: "var(--bg-mid)", color: paginaAtual >= totalPaginas ? "var(--text-muted)" : "var(--text-primary)", opacity: paginaAtual >= totalPaginas ? 0.5 : 1 }}
              >Próxima ›</button>
            </div>
          )}
        </ErrorBoundary>
      </div>
    </Layout>
  );
}
