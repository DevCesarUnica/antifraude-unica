import { useEffect, useState } from "react";
import Header from "../components/Header";
import { getGrupos, criarGrupo, atualizarGrupo, desativarGrupo } from "../lib/api";

interface Grupo {
  id: string; nome: string; descricao: string | null; limite_valor: number; ativo: boolean; criado_em: string;
}

const EMPTY = { nome: "", descricao: "", limite_valor: 0 };

export default function GruposPage() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"criar" | "editar" | null>(null);
  const [selecionado, setSelecionado] = useState<Grupo | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [erro, setErro] = useState("");

  const carregar = async () => {
    setLoading(true);
    try { setGrupos(await getGrupos()); } finally { setLoading(false); }
  };

  useEffect(() => { carregar(); }, []);

  const abrirCriar = () => { setForm(EMPTY); setErro(""); setModal("criar"); };
  const abrirEditar = (g: Grupo) => {
    setSelecionado(g);
    setForm({ nome: g.nome, descricao: g.descricao ?? "", limite_valor: g.limite_valor });
    setErro(""); setModal("editar");
  };

  const salvar = async () => {
    setErro("");
    try {
      const payload = { ...form, descricao: form.descricao || null };
      if (modal === "criar") await criarGrupo(payload);
      else if (selecionado) await atualizarGrupo(selecionado.id, payload);
      setModal(null); carregar();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg ?? "Erro ao salvar");
    }
  };

  const desativar = async (g: Grupo) => {
    if (!confirm(`Desativar grupo "${g.nome}"?`)) return;
    await desativarGrupo(g.id); carregar();
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-primary)" }}>
      <Header />
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-black uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>
            Grupos de Corretores
          </h1>
          <button onClick={abrirCriar} className="px-4 py-2 rounded-lg text-xs font-bold text-white uppercase" style={{ backgroundColor: "#DC2626" }}>
            + Novo Grupo
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading && <div className="col-span-3 text-center py-16 text-xs" style={{ color: "var(--text-muted)" }}>Carregando...</div>}
          {!loading && grupos.length === 0 && (
            <div className="col-span-3 text-center py-16 text-xs" style={{ color: "var(--text-muted)" }}>Nenhum grupo cadastrado</div>
          )}
          {grupos.map((g) => (
            <div key={g.id} className="rounded-xl p-5 flex flex-col gap-3" style={{ backgroundColor: "var(--bg-card)", border: `1px solid ${g.ativo ? "var(--border)" : "rgba(239,68,68,0.3)"}` }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-black" style={{ color: "var(--text-primary)" }}>{g.nome}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{g.descricao ?? "Sem descrição"}</p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0" style={{ backgroundColor: g.ativo ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: g.ativo ? "#22C55E" : "#EF4444" }}>
                  {g.ativo ? "ATIVO" : "INATIVO"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Limite por grupo</p>
                  <p className="text-sm font-bold" style={{ color: "#DC2626" }}>
                    {g.limite_valor > 0 ? `R$ ${g.limite_valor.toLocaleString("pt-BR")}` : "Sem limite"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => abrirEditar(g)} className="px-2 py-1 rounded text-xs font-semibold" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}>Editar</button>
                  {g.ativo && (
                    <button onClick={() => desativar(g)} className="px-2 py-1 rounded text-xs font-semibold" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#EF4444" }}>Desativar</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-black uppercase mb-5" style={{ color: "var(--text-primary)" }}>
              {modal === "criar" ? "Novo Grupo" : "Editar Grupo"}
            </h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>Nome</label>
                <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>Descrição</label>
                <textarea value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} rows={3} className="w-full px-3 py-2 rounded-lg text-xs resize-none" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>Limite de Valor (R$)</label>
                <input type="number" value={form.limite_valor} onChange={(e) => setForm((f) => ({ ...f, limite_valor: Number(e.target.value) }))} className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
              </div>
            </div>
            {erro && <p className="text-xs mt-3" style={{ color: "#EF4444" }}>{erro}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal(null)} className="flex-1 py-2 rounded-lg text-xs font-semibold" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}>Cancelar</button>
              <button onClick={salvar} className="flex-1 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#DC2626" }}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
