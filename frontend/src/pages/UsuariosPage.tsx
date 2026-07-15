import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getUsuarios, criarUsuario, atualizarUsuario, desativarUsuario, excluirUsuario } from "@/lib/api";
import Layout from "@/components/Layout";

const PERFIS = ["operador", "analista", "gestor", "admin"];
const FORM_VAZIO = { nome: "", email: "", username: "", senha: "", cargo: "", perfil: "analista" };

const inputStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-mid)", color: "var(--text-primary)",
  border: "1px solid var(--border)", borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem", fontSize: "0.875rem", width: "100%", outline: "none",
};

export default function UsuariosPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [editando, setEditando] = useState<any>(null);
  const [confirmarExcluir, setConfirmarExcluir] = useState<any>(null);

  const usuarioAtual = (() => {
    try { return JSON.parse(localStorage.getItem("usuario") || "null"); } catch { return null; }
  })();

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ["usuarios"],
    queryFn: getUsuarios,
  });

  const mutCriar = useMutation({
    mutationFn: () => criarUsuario(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["usuarios"] }); setShowForm(false); setForm(FORM_VAZIO); },
  });

  const mutAtualizar = useMutation({
    mutationFn: (data: any) => atualizarUsuario(editando.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["usuarios"] }); setEditando(null); },
  });

  const mutToggle = useMutation({
    mutationFn: (u: any) =>
      u.ativo ? desativarUsuario(u.id) : atualizarUsuario(u.id, { ativo: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usuarios"] }),
  });

  const mutExcluir = useMutation({
    mutationFn: (id: string) => excluirUsuario(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["usuarios"] }); setConfirmarExcluir(null); },
  });

  const podeExcluir = (u: any) => {
    if (u.id === usuarioAtual?.id) return false;
    if (usuarioAtual?.perfil === "admin") return true;
    if (usuarioAtual?.perfil === "gestor" && u.perfil !== "admin") return true;
    return false;
  };

  return (
    <Layout>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>Usuários</h1>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{usuarios.length} usuário{usuarios.length !== 1 ? "s" : ""} cadastrado{usuarios.length !== 1 ? "s" : ""}</p>
          </div>
          {!showForm && !editando && (
            <button onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-80"
              style={{ backgroundColor: "#DC2626", boxShadow: "0 4px 14px rgba(220,38,38,0.3)" }}>
              + Novo Usuário
            </button>
          )}
        </div>

        {showForm && (
          <div className="rounded-xl p-6 space-y-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="font-bold text-sm uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>Novo usuário</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Nome</label>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "#DC2626")} onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>E-mail</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "#DC2626")} onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Usuário (login)</label>
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "#DC2626")} onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Senha</label>
                <input type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "#DC2626")} onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Cargo</label>
                <input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "#DC2626")} onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Perfil</label>
                <select value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value })} style={inputStyle}>
                  {PERFIS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            {mutCriar.isError && (
              <p className="text-xs" style={{ color: "#f87171" }}>{(mutCriar.error as any)?.response?.data?.detail ?? "Erro ao criar usuário"}</p>
            )}
            <div className="flex gap-2">
              <button onClick={() => mutCriar.mutate()} disabled={mutCriar.isPending}
                className="px-5 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: "#DC2626" }}>
                {mutCriar.isPending ? "Salvando..." : "Criar"}
              </button>
              <button onClick={() => { setShowForm(false); setForm(FORM_VAZIO); }}
                className="px-5 py-2 text-sm font-medium" style={{ color: "var(--text-muted)" }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {editando && (
          <div className="rounded-xl p-6 space-y-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="font-bold text-sm uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>Editar: {editando.nome}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Nome</label>
                <input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "#DC2626")} onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Cargo</label>
                <input value={editando.cargo ?? ""} onChange={(e) => setEditando({ ...editando, cargo: e.target.value })} style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "#DC2626")} onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Perfil</label>
                <select value={editando.perfil} onChange={(e) => setEditando({ ...editando, perfil: e.target.value })} style={inputStyle}>
                  {PERFIS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Nova senha (deixe em branco para manter)</label>
                <input type="password" value={editando._novaSenha ?? ""} onChange={(e) => setEditando({ ...editando, _novaSenha: e.target.value })} style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "#DC2626")} onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
              </div>
            </div>
            {mutAtualizar.isError && (
              <p className="text-xs" style={{ color: "#f87171" }}>{(mutAtualizar.error as any)?.response?.data?.detail ?? "Erro ao atualizar"}</p>
            )}
            <div className="flex gap-2">
              <button onClick={() => {
                const payload: any = { nome: editando.nome, cargo: editando.cargo, perfil: editando.perfil };
                if (editando._novaSenha) payload.senha = editando._novaSenha;
                mutAtualizar.mutate(payload);
              }} disabled={mutAtualizar.isPending}
                className="px-5 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: "#DC2626" }}>
                {mutAtualizar.isPending ? "Salvando..." : "Salvar"}
              </button>
              <button onClick={() => setEditando(null)}
                className="px-5 py-2 text-sm font-medium" style={{ color: "var(--text-muted)" }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-subtle)" }}>
                {["Nome", "E-mail / Usuário", "Cargo", "Perfil", "Status", ""].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-left" style={{ color: "var(--text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="text-center py-10 text-sm" style={{ color: "var(--text-muted)" }}>Carregando...</td></tr>}
              {!isLoading && usuarios.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-sm" style={{ color: "var(--text-muted)" }}>Nenhum usuário</td></tr>}
              {usuarios.map((u: any, idx: number) => (
                <tr key={u.id} style={{ backgroundColor: idx % 2 === 0 ? "var(--bg-row-even)" : "var(--bg-row-odd)", borderBottom: "1px solid var(--border-mid)" }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                        style={{ backgroundColor: BADGE_PERFIL[u.perfil] ?? "#3b82f6" }}>
                        {u.nome?.[0]?.toUpperCase() ?? "U"}
                      </div>
                      <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{u.nome}</span>
                      {u.id === usuarioAtual?.id && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626" }}>você</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{u.email}</p>
                    {u.username && <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>@{u.username}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>{u.cargo ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded font-bold uppercase tracking-wide"
                      style={{ backgroundColor: `${BADGE_PERFIL[u.perfil] ?? "#3b82f6"}22`, color: BADGE_PERFIL[u.perfil] ?? "#3b82f6" }}>
                      {u.perfil}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.ativo
                      ? <span className="text-xs font-bold" style={{ color: "#34d399" }}>Ativo</span>
                      : <span className="text-xs" style={{ color: "var(--text-muted)" }}>Inativo</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => setEditando({ ...u })}
                        className="px-2 py-1 text-xs rounded transition-opacity hover:opacity-80"
                        style={{ color: "#60a5fa", backgroundColor: "rgba(96,165,250,0.1)" }}>
                        Editar
                      </button>
                      <button onClick={() => mutToggle.mutate(u)}
                        className="px-2 py-1 text-xs rounded transition-opacity hover:opacity-80"
                        style={{ color: u.ativo ? "#fb923c" : "#34d399", backgroundColor: u.ativo ? "rgba(251,146,60,0.1)" : "rgba(52,211,153,0.1)" }}>
                        {u.ativo ? "Desativar" : "Ativar"}
                      </button>
                      {podeExcluir(u) && (
                        <button onClick={() => setConfirmarExcluir(u)}
                          className="px-2 py-1 text-xs rounded transition-opacity hover:opacity-80"
                          style={{ color: "#f87171", backgroundColor: "rgba(248,113,113,0.1)" }}>
                          Excluir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {confirmarExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
            style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h3 className="font-bold text-base mb-2" style={{ color: "var(--text-primary)" }}>Excluir usuário</h3>
            <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
              Tem certeza que deseja excluir <strong>{confirmarExcluir.nome}</strong>?
            </p>
            <p className="text-xs mb-6" style={{ color: "#f87171" }}>
              Esta ação é irreversível — o usuário será removido permanentemente do banco de dados.
            </p>
            <div className="flex gap-3">
              <button onClick={() => mutExcluir.mutate(confirmarExcluir.id)} disabled={mutExcluir.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: "#DC2626" }}>
                {mutExcluir.isPending ? "Excluindo..." : "Sim, excluir"}
              </button>
              <button onClick={() => setConfirmarExcluir(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

const BADGE_PERFIL: Record<string, string> = {
  admin: "#DC2626", gestor: "#f97316", analista: "#3b82f6", operador: "#64748b",
};
