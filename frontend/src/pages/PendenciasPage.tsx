import { useEffect, useState } from "react";
import Header from "../components/Header";
import { getPendencias, criarPendencia, resolverPendencia, atualizarPendencia } from "../lib/api";

interface Pendencia {
  id: string; proposta_id: string | null; tipo: string; descricao: string;
  responsavel_id: string | null; prazo: string | null; resolvida: boolean;
  resolucao: string | null; criado_em: string; resolvida_em: string | null;
}

const TIPOS = ["DOCUMENTO", "ASSINATURA", "BANCO", "DADOS", "OUTROS"];
const TIPO_COR: Record<string, string> = { DOCUMENTO: "#F59E0B", ASSINATURA: "#3B82F6", BANCO: "#8B5CF6", DADOS: "#06B6D4", OUTROS: "#6B7280" };
const EMPTY = { proposta_id: "", tipo: "DOCUMENTO", descricao: "", responsavel_id: "", prazo: "" };

export default function PendenciasPage() {
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroResolvida, setFiltroResolvida] = useState<string>("false");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [modal, setModal] = useState<"criar" | "resolver" | null>(null);
  const [selecionada, setSelecionada] = useState<Pendencia | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [resolucaoTexto, setResolucaoTexto] = useState("");
  const [erro, setErro] = useState("");

  const carregar = async () => {
    setLoading(true);
    try {
      setPendencias(await getPendencias({
        resolvida: filtroResolvida !== "" ? filtroResolvida === "true" : undefined,
        tipo: filtroTipo || undefined,
      }));
    } finally { setLoading(false); }
  };

  useEffect(() => { carregar(); }, []);

  const salvar = async () => {
    setErro("");
    try {
      await criarPendencia({ ...form, proposta_id: form.proposta_id || null, responsavel_id: form.responsavel_id || null, prazo: form.prazo || null });
      setModal(null); carregar();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg ?? "Erro ao criar");
    }
  };

  const resolver = async () => {
    if (!selecionada) return;
    await resolverPendencia(selecionada.id, resolucaoTexto || undefined);
    setModal(null); carregar();
  };

  const abrirResolver = (p: Pendencia) => {
    setSelecionada(p);
    setResolucaoTexto("");
    setModal("resolver");
  };

  const vencida = (p: Pendencia) => {
    if (!p.prazo || p.resolvida) return false;
    return new Date(p.prazo) < new Date();
  };

  const diasRestantes = (prazo: string) => {
    const diff = new Date(prazo).getTime() - Date.now();
    const dias = Math.ceil(diff / 86400000);
    if (dias < 0) return `${Math.abs(dias)} dia(s) atraso`;
    if (dias === 0) return "Vence hoje";
    return `${dias} dia(s)`;
  };

  const pendenciasAbertasPorTipo = TIPOS.map((t) => ({ tipo: t, count: pendencias.filter((p) => p.tipo === t && !p.resolvida).length }));

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-primary)" }}>
      <Header />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-black uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>
            Painel de Pendências
          </h1>
          <button onClick={() => { setForm(EMPTY); setErro(""); setModal("criar"); }} className="px-4 py-2 rounded-lg text-xs font-bold text-white uppercase" style={{ backgroundColor: "#DC2626" }}>
            + Nova Pendência
          </button>
        </div>

        {/* KPIs por tipo */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {pendenciasAbertasPorTipo.map(({ tipo, count }) => (
            <div key={tipo} className="rounded-xl p-4 text-center" style={{ backgroundColor: "var(--bg-card)", border: `1px solid ${TIPO_COR[tipo]}40` }}>
              <p className="text-2xl font-black" style={{ color: TIPO_COR[tipo] }}>{count}</p>
              <p className="text-xs font-semibold mt-1" style={{ color: "var(--text-muted)" }}>{tipo}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 mb-5 p-4 rounded-xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <select value={filtroResolvida} onChange={(e) => setFiltroResolvida(e.target.value)} className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
            <option value="false">Em aberto</option>
            <option value="true">Resolvidas</option>
            <option value="">Todas</option>
          </select>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
            <option value="">Todos os tipos</option>
            {TIPOS.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
          <button onClick={carregar} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#DC2626" }}>Filtrar</button>
        </div>

        {/* Cards */}
        {loading ? (
          <div className="text-center py-16 text-xs" style={{ color: "var(--text-muted)" }}>Carregando...</div>
        ) : (
          <div className="flex flex-col gap-3">
            {pendencias.length === 0 && (
              <div className="text-center py-16 text-xs" style={{ color: "var(--text-muted)" }}>Nenhuma pendência encontrada</div>
            )}
            {pendencias.map((p) => (
              <div key={p.id} className="rounded-xl p-4 flex items-start justify-between gap-4" style={{ backgroundColor: "var(--bg-card)", border: `1px solid ${vencida(p) ? "#EF4444" : "var(--border)"}` }}>
                <div className="flex items-start gap-3 flex-1">
                  <div className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: TIPO_COR[p.tipo] }} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: `${TIPO_COR[p.tipo]}20`, color: TIPO_COR[p.tipo] }}>{p.tipo}</span>
                      {p.proposta_id && <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>Proposta: {p.proposta_id.slice(0, 8)}...</span>}
                      {vencida(p) && <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#EF4444" }}>VENCIDA</span>}
                    </div>
                    <p className="text-sm font-medium mt-1" style={{ color: "var(--text-primary)" }}>{p.descricao}</p>
                    {p.resolvida && p.resolucao && (
                      <p className="text-xs mt-1 italic" style={{ color: "#22C55E" }}>Resolução: {p.resolucao}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Aberta em {new Date(p.criado_em).toLocaleDateString("pt-BR")}
                      </span>
                      {p.prazo && !p.resolvida && (
                        <span className="text-xs font-semibold" style={{ color: vencida(p) ? "#EF4444" : "#F59E0B" }}>
                          Prazo: {diasRestantes(p.prazo)}
                        </span>
                      )}
                      {p.resolvida && p.resolvida_em && (
                        <span className="text-xs" style={{ color: "#22C55E" }}>Resolvida em {new Date(p.resolvida_em).toLocaleDateString("pt-BR")}</span>
                      )}
                    </div>
                  </div>
                </div>
                {!p.resolvida && (
                  <button onClick={() => abrirResolver(p)} className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold" style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#22C55E" }}>
                    Resolver
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal criar */}
      {modal === "criar" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-black uppercase mb-5" style={{ color: "var(--text-primary)" }}>Nova Pendência</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>Tipo</label>
                <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                  {TIPOS.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>Descrição</label>
                <textarea value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} rows={3} className="w-full px-3 py-2 rounded-lg text-xs resize-none" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>ID da Proposta (opcional)</label>
                <input value={form.proposta_id} onChange={(e) => setForm((f) => ({ ...f, proposta_id: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>Prazo</label>
                <input type="datetime-local" value={form.prazo} onChange={(e) => setForm((f) => ({ ...f, prazo: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
              </div>
            </div>
            {erro && <p className="text-xs mt-3" style={{ color: "#EF4444" }}>{erro}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal(null)} className="flex-1 py-2 rounded-lg text-xs font-semibold" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}>Cancelar</button>
              <button onClick={salvar} className="flex-1 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#DC2626" }}>Criar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal resolver */}
      {modal === "resolver" && selecionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-black uppercase mb-3" style={{ color: "var(--text-primary)" }}>Resolver Pendência</h2>
            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>{selecionada.descricao}</p>
            <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>Resolução (opcional)</label>
            <textarea value={resolucaoTexto} onChange={(e) => setResolucaoTexto(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg text-xs resize-none" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal(null)} className="flex-1 py-2 rounded-lg text-xs font-semibold" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}>Cancelar</button>
              <button onClick={resolver} className="flex-1 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#22C55E" }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
