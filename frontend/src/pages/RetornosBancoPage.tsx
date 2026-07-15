import { useEffect, useState } from "react";
import Header from "../components/Header";
import { getRetornosBanco, registrarRetornoBanco, processarRetornoBanco } from "../lib/api";

interface RetornoBanco {
  id: string; proposta_id: string | null; banco: string; tipo_retorno: string;
  dados: Record<string, unknown> | null; processado: boolean;
  observacao: string | null; criado_em: string; processado_em: string | null;
}

const TIPOS = ["APROVACAO", "REPROVACAO", "PENDENCIA", "CANCELAMENTO", "INFORMATIVO"];
const TIPO_COR: Record<string, string> = {
  APROVACAO: "#22C55E", REPROVACAO: "#EF4444", PENDENCIA: "#F59E0B",
  CANCELAMENTO: "#6B7280", INFORMATIVO: "#3B82F6",
};
const EMPTY = { proposta_id: "", banco: "", tipo_retorno: "APROVACAO", observacao: "" };

export default function RetornosBancoPage() {
  const [retornos, setRetornos] = useState<RetornoBanco[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroBanco, setFiltroBanco] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroProcessado, setFiltroProcessado] = useState<string>("");
  const [modalCriar, setModalCriar] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [erro, setErro] = useState("");
  const [processando, setProcessando] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    try {
      setRetornos(await getRetornosBanco({
        banco: filtroBanco || undefined,
        tipo_retorno: filtroTipo || undefined,
        processado: filtroProcessado !== "" ? filtroProcessado === "true" : undefined,
      }));
    } finally { setLoading(false); }
  };

  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPendente = retornos.filter((r) => !r.processado).length;

  const salvar = async () => {
    setErro("");
    try {
      await registrarRetornoBanco({ ...form, proposta_id: form.proposta_id || null, observacao: form.observacao || null });
      setModalCriar(false); setForm(EMPTY); carregar();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg ?? "Erro ao registrar retorno");
    }
  };

  const processar = async (id: string) => {
    setProcessando(id);
    try {
      await processarRetornoBanco(id);
      carregar();
    } finally { setProcessando(null); }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-primary)" }}>
      <Header />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-black uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>
              Retornos de Banco
            </h1>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Respostas dos bancos sobre propostas — aprovação, reprovação, pendência ou cancelamento
            </p>
          </div>
          <button onClick={() => { setForm(EMPTY); setErro(""); setModalCriar(true); }} className="px-4 py-2 rounded-lg text-xs font-bold text-white uppercase" style={{ backgroundColor: "#DC2626" }}>
            + Registrar Retorno
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl p-4" style={{ backgroundColor: "#F59E0B", color: "white" }}>
            <p className="text-2xl font-black">{totalPendente}</p>
            <p className="text-xs font-bold mt-1">Aguardando Processamento</p>
          </div>
          <div className="rounded-xl p-4" style={{ backgroundColor: "#22C55E", color: "white" }}>
            <p className="text-2xl font-black">{retornos.filter((r) => r.processado).length}</p>
            <p className="text-xs font-bold mt-1">Processados</p>
          </div>
          <div className="rounded-xl p-4" style={{ backgroundColor: "#3B82F6", color: "white" }}>
            <p className="text-2xl font-black">{retornos.length}</p>
            <p className="text-xs font-bold mt-1">Total (filtro atual)</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 mb-5 p-4 rounded-xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <input value={filtroBanco} onChange={(e) => setFiltroBanco(e.target.value)} placeholder="Banco..." className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
            <option value="">Todos os tipos</option>
            {TIPOS.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
          <select value={filtroProcessado} onChange={(e) => setFiltroProcessado(e.target.value)} className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
            <option value="">Todos</option>
            <option value="false">Não processados</option>
            <option value="true">Processados</option>
          </select>
          <button onClick={carregar} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#DC2626" }}>Filtrar</button>
        </div>

        {/* Tabela */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-subtle, var(--bg-mid))" }}>
                  {["Banco", "Tipo", "Proposta", "Observação", "Status", "Data", "Ações"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={7} className="text-center py-10" style={{ color: "var(--text-muted)" }}>Carregando...</td></tr>
                )}
                {!loading && retornos.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10" style={{ color: "var(--text-muted)" }}>Nenhum retorno encontrado.</td></tr>
                )}
                {retornos.map((r, idx) => (
                  <tr key={r.id} style={{ backgroundColor: idx % 2 === 0 ? "var(--bg-row-even, transparent)" : "var(--bg-row-odd, transparent)", borderBottom: "1px solid var(--border-mid, var(--border))" }}>
                    <td className="px-4 py-3 font-bold" style={{ color: "var(--text-primary)" }}>{r.banco}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: `${TIPO_COR[r.tipo_retorno] ?? "#6B7280"}20`, color: TIPO_COR[r.tipo_retorno] ?? "#6B7280" }}>
                        {r.tipo_retorno}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono" style={{ color: "var(--text-muted)" }}>
                      {r.proposta_id ? `${r.proposta_id.slice(0, 8)}...` : "—"}
                    </td>
                    <td className="px-4 py-3 max-w-[220px] truncate" style={{ color: "var(--text-secondary, var(--text-muted))" }} title={r.observacao ?? ""}>
                      {r.observacao ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.processado
                        ? <span className="text-xs font-bold" style={{ color: "#22C55E" }}>Processado</span>
                        : <span className="text-xs font-bold" style={{ color: "#F59E0B" }}>Pendente</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                      {new Date(r.criado_em).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!r.processado && (
                        <button
                          disabled={processando === r.id}
                          onClick={() => processar(r.id)}
                          className="px-3 py-1 rounded-lg text-[10px] font-bold disabled:opacity-50"
                          style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#22C55E" }}
                        >
                          {processando === r.id ? "..." : "Processar"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal registrar */}
      {modalCriar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-black uppercase mb-5" style={{ color: "var(--text-primary)" }}>Registrar Retorno de Banco</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>Banco</label>
                <input value={form.banco} onChange={(e) => setForm((f) => ({ ...f, banco: e.target.value }))} placeholder="Ex: HOPE" className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>Tipo de retorno</label>
                <select value={form.tipo_retorno} onChange={(e) => setForm((f) => ({ ...f, tipo_retorno: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                  {TIPOS.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>ID da Proposta (opcional)</label>
                <input value={form.proposta_id} onChange={(e) => setForm((f) => ({ ...f, proposta_id: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
                <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Se informado, "Processar" atualiza automaticamente o status da proposta.</p>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>Observação</label>
                <textarea value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} rows={3} className="w-full px-3 py-2 rounded-lg text-xs resize-none" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
              </div>
            </div>
            {erro && <p className="text-xs mt-3" style={{ color: "#EF4444" }}>{erro}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModalCriar(false)} className="flex-1 py-2 rounded-lg text-xs font-semibold" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}>Cancelar</button>
              <button onClick={salvar} disabled={!form.banco.trim()} className="flex-1 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50" style={{ backgroundColor: "#DC2626" }}>Registrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
