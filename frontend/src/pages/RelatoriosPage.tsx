import { useEffect, useState } from "react";
import Header from "../components/Header";
import { getKPIs, getRelatorioPropostas, getRelatorioAntifraude, getRelatorioCorretores, baixarRelatorioCSV } from "../lib/api";

interface KPIs {
  total_propostas: number; aprovadas: number; reprovadas: number;
  em_analise: number; volume_aprovado: number; score_medio_fraude: number | null;
  taxa_aprovacao: number;
}
interface PropostaRow { id: string; proposta_id_externo: string; cpf_cliente: string; nome_cliente: string | null; banco: string; valor: number; status: string; score_fraude: number | null; criado_em: string; }
interface AntifraudeRow { id: string; proposta_id_externo: string; cpf_cliente: string; banco: string; valor: number; score_fraude: number; resultado_motor: string; status: string; }

const ABAS = ["KPIs", "Propostas", "Antifraude", "Corretores"] as const;
type Aba = typeof ABAS[number];

const STATUS_CORES: Record<string, string> = { APROVADA: "#22C55E", REPROVADA: "#EF4444", BLOQUEADA: "#DC2626", ANALISE_MANUAL: "#F59E0B", EM_ANALISE: "#3B82F6", ENFILEIRADA: "#6B7280" };
const SCORE_COR = (s: number) => s < 30 ? "#22C55E" : s < 60 ? "#F59E0B" : "#EF4444";

export default function RelatoriosPage() {
  const [aba, setAba] = useState<Aba>("KPIs");
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [propostas, setPropostas] = useState<PropostaRow[]>([]);
  const [antifraude, setAntifraude] = useState<AntifraudeRow[]>([]);
  const [corretores, setCorretores] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [baixando, setBaixando] = useState(false);

  // Filtros propostas
  const [filtros, setFiltros] = useState({ status: "", banco: "", data_inicio: "", data_fim: "" });

  useEffect(() => {
    carregarKPIs();
  }, []);

  const carregarKPIs = async () => {
    setLoading(true);
    try { setKpis(await getKPIs()); } finally { setLoading(false); }
  };

  const carregarPropostas = async () => {
    setLoading(true);
    try {
      setPropostas(await getRelatorioPropostas({ status: filtros.status || undefined, banco: filtros.banco || undefined, data_inicio: filtros.data_inicio || undefined, data_fim: filtros.data_fim || undefined }));
    } finally { setLoading(false); }
  };

  const carregarAntifraude = async () => {
    setLoading(true);
    try { setAntifraude(await getRelatorioAntifraude()); } finally { setLoading(false); }
  };

  const carregarCorretores = async () => {
    setLoading(true);
    try { setCorretores(await getRelatorioCorretores()); } finally { setLoading(false); }
  };

  const mudarAba = (a: Aba) => {
    setAba(a);
    if (a === "KPIs") carregarKPIs();
    if (a === "Propostas") carregarPropostas();
    if (a === "Antifraude") carregarAntifraude();
    if (a === "Corretores") carregarCorretores();
  };

  const baixarCSV = async () => {
    setBaixando(true);
    try {
      const tipoMap: Record<Aba, "propostas" | "antifraude" | "corretores" | "auditoria"> = { KPIs: "propostas", Propostas: "propostas", Antifraude: "antifraude", Corretores: "corretores" };
      const blob = await baixarRelatorioCSV(tipoMap[aba]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${tipoMap[aba]}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setBaixando(false); }
  };

  const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-primary)" }}>
      <Header />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-black uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>Relatórios</h1>
          {aba !== "KPIs" && (
            <button onClick={baixarCSV} disabled={baixando} className="px-4 py-2 rounded-lg text-xs font-bold text-white uppercase" style={{ backgroundColor: baixando ? "#6B7280" : "#DC2626" }}>
              {baixando ? "Baixando..." : "Exportar CSV"}
            </button>
          )}
        </div>

        {/* Abas */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {ABAS.map((a) => (
            <button key={a} onClick={() => mudarAba(a)} className="px-4 py-2 rounded-lg text-xs font-bold uppercase" style={{ backgroundColor: aba === a ? "#DC2626" : "transparent", color: aba === a ? "#fff" : "var(--text-muted)" }}>
              {a}
            </button>
          ))}
        </div>

        {/* === KPIs === */}
        {aba === "KPIs" && (
          <div>
            {loading && <div className="text-center py-16 text-xs" style={{ color: "var(--text-muted)" }}>Carregando...</div>}
            {kpis && (
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                  {[
                    { label: "Total Propostas", value: kpis.total_propostas.toLocaleString(), cor: "var(--text-primary)" },
                    { label: "Aprovadas", value: kpis.aprovadas.toLocaleString(), cor: "#22C55E" },
                    { label: "Reprovadas", value: kpis.reprovadas.toLocaleString(), cor: "#EF4444" },
                    { label: "Em Análise", value: kpis.em_analise.toLocaleString(), cor: "#F59E0B" },
                    { label: "Volume Aprovado", value: formatBRL(kpis.volume_aprovado), cor: "#22C55E" },
                    { label: "Score Médio Fraude", value: kpis.score_medio_fraude != null ? `${kpis.score_medio_fraude}` : "—", cor: kpis.score_medio_fraude != null ? SCORE_COR(kpis.score_medio_fraude) : "var(--text-muted)" },
                    { label: "Taxa de Aprovação", value: `${kpis.taxa_aprovacao}%`, cor: kpis.taxa_aprovacao >= 70 ? "#22C55E" : "#F59E0B" },
                  ].map(({ label, value, cor }) => (
                    <div key={label} className="rounded-xl p-5" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
                      <p className="text-2xl font-black" style={{ color: cor }}>{value}</p>
                      <p className="text-xs mt-1 font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</p>
                    </div>
                  ))}
                </div>

                {/* Barras de status por volume */}
                <div className="rounded-xl p-5" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <h2 className="text-xs font-bold uppercase mb-4" style={{ color: "var(--text-muted)" }}>Distribuição de Propostas</h2>
                  <div className="flex flex-col gap-3">
                    {[
                      { label: "Aprovadas", value: kpis.aprovadas, cor: "#22C55E" },
                      { label: "Reprovadas", value: kpis.reprovadas, cor: "#EF4444" },
                      { label: "Em Análise", value: kpis.em_analise, cor: "#F59E0B" },
                    ].map(({ label, value, cor }) => (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{label}</span>
                          <span className="text-xs font-bold" style={{ color: cor }}>{value}</span>
                        </div>
                        <div className="h-2 rounded-full" style={{ backgroundColor: "var(--bg-mid)" }}>
                          <div className="h-2 rounded-full" style={{ width: kpis.total_propostas > 0 ? `${(value / kpis.total_propostas * 100).toFixed(1)}%` : "0%", backgroundColor: cor, transition: "width 0.5s" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* === PROPOSTAS === */}
        {aba === "Propostas" && (
          <div>
            <div className="flex flex-wrap gap-3 mb-5 p-4 rounded-xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <select value={filtros.status} onChange={(e) => setFiltros((f) => ({ ...f, status: e.target.value }))} className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                <option value="">Todos status</option>
                {Object.keys(STATUS_CORES).map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
              <input value={filtros.banco} onChange={(e) => setFiltros((f) => ({ ...f, banco: e.target.value }))} placeholder="Banco..." className="px-3 py-2 rounded-lg text-xs flex-1 min-w-32" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
              <input type="date" value={filtros.data_inicio} onChange={(e) => setFiltros((f) => ({ ...f, data_inicio: e.target.value }))} className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
              <input type="date" value={filtros.data_fim} onChange={(e) => setFiltros((f) => ({ ...f, data_fim: e.target.value }))} className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
              <button onClick={carregarPropostas} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#DC2626" }}>Consultar</button>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
              {loading ? <div className="text-center py-16 text-xs" style={{ color: "var(--text-muted)" }}>Carregando...</div> : (
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ backgroundColor: "var(--bg-mid)", borderBottom: "1px solid var(--border)" }}>
                      {["ID Externo", "CPF", "Nome", "Banco", "Valor", "Status", "Score", "Data"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left font-bold uppercase" style={{ color: "var(--text-muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {propostas.length === 0 && <tr><td colSpan={8} className="text-center py-12" style={{ color: "var(--text-muted)" }}>Sem dados</td></tr>}
                    {propostas.map((p) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "var(--text-primary)" }}>{p.proposta_id_externo}</td>
                        <td className="px-4 py-2.5 font-mono" style={{ color: "var(--text-muted)" }}>{p.cpf_cliente}</td>
                        <td className="px-4 py-2.5" style={{ color: "var(--text-primary)" }}>{p.nome_cliente ?? "—"}</td>
                        <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{p.banco}</td>
                        <td className="px-4 py-2.5 font-bold" style={{ color: "var(--text-primary)" }}>{formatBRL(p.valor)}</td>
                        <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: `${STATUS_CORES[p.status] ?? "#6B7280"}20`, color: STATUS_CORES[p.status] ?? "#6B7280" }}>{p.status}</span></td>
                        <td className="px-4 py-2.5 font-bold" style={{ color: p.score_fraude != null ? SCORE_COR(p.score_fraude) : "var(--text-muted)" }}>{p.score_fraude ?? "—"}</td>
                        <td className="px-4 py-2.5 font-mono" style={{ color: "var(--text-muted)" }}>{new Date(p.criado_em).toLocaleDateString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* === ANTIFRAUDE === */}
        {aba === "Antifraude" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={carregarAntifraude} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#DC2626" }}>Atualizar</button>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
              {loading ? <div className="text-center py-16 text-xs" style={{ color: "var(--text-muted)" }}>Carregando...</div> : (
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ backgroundColor: "var(--bg-mid)", borderBottom: "1px solid var(--border)" }}>
                      {["ID Externo", "CPF", "Banco", "Valor", "Score", "Decisão", "Status"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left font-bold uppercase" style={{ color: "var(--text-muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {antifraude.length === 0 && <tr><td colSpan={7} className="text-center py-12" style={{ color: "var(--text-muted)" }}>Sem dados</td></tr>}
                    {antifraude.map((p) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "var(--text-primary)" }}>{p.proposta_id_externo}</td>
                        <td className="px-4 py-2.5 font-mono" style={{ color: "var(--text-muted)" }}>{p.cpf_cliente}</td>
                        <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{p.banco}</td>
                        <td className="px-4 py-2.5 font-bold" style={{ color: "var(--text-primary)" }}>{formatBRL(p.valor)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm" style={{ color: SCORE_COR(p.score_fraude) }}>{p.score_fraude}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-gray-700 max-w-16">
                              <div className="h-1.5 rounded-full" style={{ width: `${Math.min(p.score_fraude, 100)}%`, backgroundColor: SCORE_COR(p.score_fraude) }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-bold" style={{ color: p.resultado_motor === "APROVADO" ? "#22C55E" : p.resultado_motor === "BLOQUEADO" ? "#EF4444" : "#F59E0B" }}>{p.resultado_motor}</td>
                        <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: `${STATUS_CORES[p.status] ?? "#6B7280"}20`, color: STATUS_CORES[p.status] ?? "#6B7280" }}>{p.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* === CORRETORES === */}
        {aba === "Corretores" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={carregarCorretores} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#DC2626" }}>Atualizar</button>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
              {loading ? <div className="text-center py-16 text-xs" style={{ color: "var(--text-muted)" }}>Carregando...</div> : (
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ backgroundColor: "var(--bg-mid)", borderBottom: "1px solid var(--border)" }}>
                      {["Nome", "CPF", "E-mail", "Limite Diário", "Status"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left font-bold uppercase" style={{ color: "var(--text-muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(corretores as Record<string, unknown>[]).length === 0 && <tr><td colSpan={5} className="text-center py-12" style={{ color: "var(--text-muted)" }}>Sem dados</td></tr>}
                    {(corretores as Record<string, unknown>[]).map((c, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="px-4 py-2.5 font-semibold" style={{ color: "var(--text-primary)" }}>{String(c.nome)}</td>
                        <td className="px-4 py-2.5 font-mono" style={{ color: "var(--text-muted)" }}>{String(c.cpf)}</td>
                        <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{c.email ? String(c.email) : "—"}</td>
                        <td className="px-4 py-2.5" style={{ color: "var(--text-primary)" }}>
                          {Number(c.limite_valor_diario) > 0 ? formatBRL(Number(c.limite_valor_diario)) : "—"}
                        </td>
                        <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: c.ativo ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: c.ativo ? "#22C55E" : "#EF4444" }}>{c.ativo ? "ATIVO" : "INATIVO"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
