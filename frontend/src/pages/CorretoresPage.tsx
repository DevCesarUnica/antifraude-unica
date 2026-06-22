import { useEffect, useState } from "react";
import Header from "../components/Header";
import {
  getCorretores, criarCorretor, atualizarCorretor, desativarCorretor,
  getGrupos, importarCorretoresCSV,
} from "../lib/api";

interface Corretor {
  id: string; nome: string; cpf: string; email: string | null;
  telefone: string | null; grupo_id: string | null; ativo: boolean;
  limite_valor_diario: number; criado_em: string;
}
interface Grupo { id: string; nome: string; ativo: boolean; }

const EMPTY_FORM = { nome: "", cpf: "", email: "", telefone: "", grupo_id: "", limite_valor_diario: 0 };

export default function CorretoresPage() {
  const [corretores, setCorretores] = useState<Corretor[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroNome, setFiltroNome] = useState("");
  const [filtroCPF, setFiltroCPF] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState<string>("true");
  const [modal, setModal] = useState<"criar" | "editar" | null>(null);
  const [selecionado, setSelecionado] = useState<Corretor | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [erro, setErro] = useState("");
  const [importando, setImportando] = useState(false);

  const carregar = async () => {
    setLoading(true);
    try {
      const [c, g] = await Promise.all([
        getCorretores({ nome: filtroNome || undefined, cpf: filtroCPF || undefined, ativo: filtroAtivo !== "" ? filtroAtivo === "true" : undefined }),
        getGrupos(),
      ]);
      setCorretores(c);
      setGrupos(g);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const abrirCriar = () => { setForm(EMPTY_FORM); setErro(""); setModal("criar"); };
  const abrirEditar = (c: Corretor) => {
    setSelecionado(c);
    setForm({ nome: c.nome, cpf: c.cpf, email: c.email ?? "", telefone: c.telefone ?? "", grupo_id: c.grupo_id ?? "", limite_valor_diario: c.limite_valor_diario });
    setErro(""); setModal("editar");
  };

  const salvar = async () => {
    setErro("");
    try {
      const payload = { ...form, email: form.email || null, telefone: form.telefone || null, grupo_id: form.grupo_id || null };
      if (modal === "criar") await criarCorretor(payload);
      else if (selecionado) await atualizarCorretor(selecionado.id, { nome: form.nome, email: form.email || null, telefone: form.telefone || null, grupo_id: form.grupo_id || null, limite_valor_diario: form.limite_valor_diario });
      setModal(null);
      carregar();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg ?? "Erro ao salvar");
    }
  };

  const desativar = async (c: Corretor) => {
    if (!confirm(`Desativar ${c.nome}?`)) return;
    await desativarCorretor(c.id);
    carregar();
  };

  const importarCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    try {
      const result = await importarCorretoresCSV(file);
      alert(`Importação concluída: ${result.sucesso} sucesso, ${result.erro} erros`);
      carregar();
    } catch {
      alert("Erro na importação");
    } finally {
      setImportando(false);
      e.target.value = "";
    }
  };

  const grupoNome = (id: string | null) => grupos.find((g) => g.id === id)?.nome ?? "—";

  const filtrar = () => carregar();

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-primary)" }}>
      <Header />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-black uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>
            Corretores
          </h1>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer">
              <input type="file" accept=".csv" className="hidden" onChange={importarCSV} />
              <span className="px-3 py-2 text-xs font-semibold rounded-lg transition-all" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                {importando ? "Importando..." : "Importar CSV"}
              </span>
            </label>
            <button onClick={abrirCriar} className="px-4 py-2 rounded-lg text-xs font-bold text-white uppercase" style={{ backgroundColor: "#DC2626" }}>
              + Novo Corretor
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 mb-5 p-4 rounded-xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <input value={filtroNome} onChange={(e) => setFiltroNome(e.target.value)} placeholder="Nome..." className="px-3 py-2 rounded-lg text-xs flex-1 min-w-32" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
          <input value={filtroCPF} onChange={(e) => setFiltroCPF(e.target.value)} placeholder="CPF..." className="px-3 py-2 rounded-lg text-xs w-40" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
          <select value={filtroAtivo} onChange={(e) => setFiltroAtivo(e.target.value)} className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
            <option value="">Todos</option>
          </select>
          <button onClick={filtrar} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#DC2626" }}>Filtrar</button>
        </div>

        {/* Tabela */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {loading ? (
            <div className="text-center py-16 text-xs" style={{ color: "var(--text-muted)" }}>Carregando...</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ backgroundColor: "var(--bg-mid)", borderBottom: "1px solid var(--border)" }}>
                  {["Nome", "CPF", "E-mail", "Grupo", "Limite Diário", "Status", "Ações"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {corretores.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12" style={{ color: "var(--text-muted)" }}>Nenhum corretor encontrado</td></tr>
                )}
                {corretores.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-3 font-semibold" style={{ color: "var(--text-primary)" }}>{c.nome}</td>
                    <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{c.cpf}</td>
                    <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{c.email ?? "—"}</td>
                    <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{grupoNome(c.grupo_id)}</td>
                    <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                      {c.limite_valor_diario > 0 ? `R$ ${c.limite_valor_diario.toLocaleString("pt-BR")}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: c.ativo ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: c.ativo ? "#22C55E" : "#EF4444" }}>
                        {c.ativo ? "ATIVO" : "INATIVO"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => abrirEditar(c)} className="px-2 py-1 rounded text-xs font-semibold" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}>Editar</button>
                        {c.ativo && (
                          <button onClick={() => desativar(c)} className="px-2 py-1 rounded text-xs font-semibold" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#EF4444" }}>Desativar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-black uppercase mb-5" style={{ color: "var(--text-primary)" }}>
              {modal === "criar" ? "Novo Corretor" : "Editar Corretor"}
            </h2>
            <div className="flex flex-col gap-3">
              {[
                { label: "Nome", key: "nome", type: "text" },
                { label: "CPF", key: "cpf", type: "text", disabled: modal === "editar" },
                { label: "E-mail", key: "email", type: "email" },
                { label: "Telefone", key: "telefone", type: "text" },
              ].map(({ label, key, type, disabled }) => (
                <div key={key}>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>{label}</label>
                  <input
                    type={type}
                    value={form[key as keyof typeof form] as string}
                    disabled={disabled}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-xs"
                    style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)", opacity: disabled ? 0.5 : 1 }}
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>Grupo</label>
                <select value={form.grupo_id} onChange={(e) => setForm((f) => ({ ...f, grupo_id: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                  <option value="">Sem grupo</option>
                  {grupos.filter((g) => g.ativo).map((g) => (<option key={g.id} value={g.id}>{g.nome}</option>))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>Limite Valor Diário (R$)</label>
                <input type="number" value={form.limite_valor_diario} onChange={(e) => setForm((f) => ({ ...f, limite_valor_diario: Number(e.target.value) }))} className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
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
