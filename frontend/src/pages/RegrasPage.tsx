import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getRegras, criarRegra, desativarRegra } from "@/lib/api";
import Layout from "@/components/Layout";

const TIPOS = ["BLACKLIST", "VALOR_MAXIMO", "BANCO_CONVENIO", "UF_BLOQUEADA", "SCORE_RISCO", "LIMITE_DIARIO"];

const FORM_VAZIO = { nome: "", tipo: "VALOR_MAXIMO", parametros: '{"valor_maximo": 50000}', peso_score: 30, bloqueante: false, prioridade: 100 };

const inputStyle = {
  backgroundColor: "var(--bg-mid)", color: "var(--text-primary)",
  border: "1px solid var(--border)", borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem", fontSize: "0.875rem", width: "100%", outline: "none",
};

export default function RegrasPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [jsonErro, setJsonErro] = useState("");

  const { data: regras = [], isLoading } = useQuery({ queryKey: ["regras"], queryFn: () => getRegras() });

  const mutCriar = useMutation({
    mutationFn: () => {
      try {
        return criarRegra({ ...form, parametros: JSON.parse(form.parametros) });
      } catch {
        throw new Error("JSON inválido nos parâmetros");
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["regras"] }); setShowForm(false); setForm(FORM_VAZIO); setJsonErro(""); },
    onError: (e: any) => setJsonErro(e.message),
  });

  const mutDesativar = useMutation({
    mutationFn: desativarRegra,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["regras"] }),
  });

  return (
    <Layout>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>Regras Antifraude</h1>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Configuradas no banco — sem deploy para alterar</p>
          </div>
          {!showForm && (
            <button onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-80"
              style={{ backgroundColor: "#DC2626", boxShadow: "0 4px 14px rgba(220,38,38,0.3)" }}>
              + Nova Regra
            </button>
          )}
        </div>

        {showForm && (
          <div className="rounded-xl p-6 space-y-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="font-bold text-sm uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>Nova regra</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Nome</label>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "#DC2626")} onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Tipo</label>
                <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={inputStyle}>
                  {TIPOS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Parâmetros (JSON)</label>
                <textarea value={form.parametros} onChange={(e) => setForm({ ...form, parametros: e.target.value })} rows={3}
                  className="font-mono" style={{ ...inputStyle, resize: "vertical" }}
                  onFocus={(e) => (e.target.style.borderColor = "#DC2626")} onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Peso no score</label>
                <input type="number" value={form.peso_score} onChange={(e) => setForm({ ...form, peso_score: +e.target.value })} style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "#DC2626")} onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Prioridade</label>
                <input type="number" value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: +e.target.value })} style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "#DC2626")} onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="bloqueante" checked={form.bloqueante} onChange={(e) => setForm({ ...form, bloqueante: e.target.checked })} />
                <label htmlFor="bloqueante" className="text-sm" style={{ color: "var(--text-secondary)" }}>Bloqueante (bloqueia proposta imediatamente)</label>
              </div>
            </div>
            {jsonErro && <p className="text-xs" style={{ color: "#f87171" }}>{jsonErro}</p>}
            {mutCriar.isError && !jsonErro && (
              <p className="text-xs" style={{ color: "#f87171" }}>{(mutCriar.error as any)?.response?.data?.detail ?? "Erro ao salvar"}</p>
            )}
            <div className="flex gap-2">
              <button onClick={() => mutCriar.mutate()} disabled={mutCriar.isPending}
                className="px-5 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: "#DC2626" }}>
                {mutCriar.isPending ? "Salvando..." : "Salvar"}
              </button>
              <button onClick={() => { setShowForm(false); setJsonErro(""); }}
                className="px-5 py-2 text-sm font-medium transition-opacity hover:opacity-70" style={{ color: "var(--text-muted)" }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-subtle)" }}>
                {["Nome", "Tipo", "Peso", "Prioridade", "Bloqueante", "Ativo", ""].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-left" style={{ color: "var(--text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="text-center py-10 text-sm" style={{ color: "var(--text-muted)" }}>Carregando...</td></tr>}
              {!isLoading && regras.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-sm" style={{ color: "var(--text-muted)" }}>Nenhuma regra cadastrada</td></tr>}
              {regras.map((r: any, idx: number) => (
                <tr key={r.id} style={{ backgroundColor: idx % 2 === 0 ? "var(--bg-row-even)" : "var(--bg-row-odd)", borderBottom: "1px solid var(--border-mid)" }}>
                  <td className="px-4 py-3 font-medium text-xs" style={{ color: "var(--text-primary)" }}>{r.nome}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626" }}>{r.tipo}</span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>{r.peso_score}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>{r.prioridade}</td>
                  <td className="px-4 py-3">
                    {r.bloqueante
                      ? <span className="text-xs font-bold" style={{ color: "#f87171" }}>Sim</span>
                      : <span className="text-xs" style={{ color: "var(--text-muted)" }}>Não</span>}
                  </td>
                  <td className="px-4 py-3">
                    {r.ativo
                      ? <span className="text-xs font-bold" style={{ color: "#34d399" }}>Ativo</span>
                      : <span className="text-xs" style={{ color: "var(--text-muted)" }}>Inativo</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.ativo && (
                      <button onClick={() => mutDesativar.mutate(r.id)}
                        className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-80"
                        style={{ color: "#f87171", backgroundColor: "rgba(248,113,113,0.1)" }}>
                        Desativar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
