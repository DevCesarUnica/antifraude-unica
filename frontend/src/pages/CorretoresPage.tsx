import { useEffect, useState, useCallback, useRef } from "react";
import Header from "../components/Header";
import {
  getCorretoresUnificados,
  criarCorretor, atualizarCorretor, desativarCorretor, getCorretorById,
  getGrupos, importarCorretoresCSV,
  iniciarExportacaoCorretores, statusExportacaoCorretores, baixarExportacaoCorretores,
} from "../lib/api";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface CorretorUnificado {
  id: string;
  codigo: string;
  nome: string;
  email: string | null;
  status: "ativo" | "inativo";
  tipo: string | null;
  loja: string | null;
  privilegio: string | null;
  origem: "interno" | "storm";
  criado_em: string | null;
}

interface PaginacaoStorm {
  total: number;
  paginas: number;
  pagina_atual: number;
  por_pagina: number;
}

interface RespostaUnificada {
  items: CorretorUnificado[];
  paginacao_storm: PaginacaoStorm | null;
  sync_em: string;
}

interface Grupo { id: string; nome: string; ativo: boolean; }

const EMPTY_FORM = {
  nome: "", cpf: "", codigo_externo: "", email: "", telefone: "", grupo_id: "", limite_valor_diario: 0,
};

// ── Badges ────────────────────────────────────────────────────────────────────

function BadgeOrigem({ origem }: { origem: "interno" | "storm" }) {
  const style =
    origem === "interno"
      ? { backgroundColor: "rgba(59,130,246,0.15)", color: "#3B82F6" }
      : { backgroundColor: "rgba(139,92,246,0.15)", color: "#8B5CF6" };
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider" style={style}>
      {origem === "interno" ? "Interno" : "Storm"}
    </span>
  );
}

function BadgeStatus({ status }: { status: "ativo" | "inativo" }) {
  const ativo = status === "ativo";
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-bold"
      style={{
        backgroundColor: ativo ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
        color: ativo ? "#22C55E" : "#EF4444",
      }}
    >
      {ativo ? "ATIVO" : "INATIVO"}
    </span>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function CorretoresPage() {
  // ─ Dados
  const [items, setItems]         = useState<CorretorUnificado[]>([]);
  const [paginacao, setPaginacao] = useState<PaginacaoStorm | null>(null);
  const [syncEm, setSyncEm]       = useState<string | null>(null);
  const [pagina, setPagina]       = useState(1);
  const [loading, setLoading]     = useState(false);
  const [stormOff, setStormOff]   = useState(false);

  // ─ Filtros controlados (valor digitado)
  const [filtroNome,   setFiltroNome]   = useState("");
  const [filtroCodigo, setFiltroCodigo] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroOrigem, setFiltroOrigem] = useState("");

  // ─ Filtros aplicados (usados na requisição)
  const [buscaNome,   setBuscaNome]   = useState("");
  const [buscaCodigo, setBuscaCodigo] = useState("");
  const [buscaStatus, setBuscaStatus] = useState("");
  const [buscaOrigem, setBuscaOrigem] = useState("");

  // ─ Modal criar/editar (apenas internos)
  const [grupos,      setGrupos]      = useState<Grupo[]>([]);
  const [modal,       setModal]       = useState<"criar" | "editar" | null>(null);
  const [selecionado, setSelecionado] = useState<CorretorUnificado | null>(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [erroModal,   setErroModal]   = useState("");
  const [importando,  setImportando]  = useState(false);
  const [exportando,  setExportando]  = useState(false);
  const [exportPct,   setExportPct]   = useState(0);
  const exportPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (exportPollRef.current) clearInterval(exportPollRef.current);
  }, []);

  const sincronizandoRef = useRef(false);

  // ── Carregar dados ──────────────────────────────────────────────────────────

  const carregar = useCallback(async (
    pag: number,
    nome: string,
    codigo: string,
    status: string,
    origem: string,
  ) => {
    if (sincronizandoRef.current) return;
    setLoading(true);
    setStormOff(false);
    try {
      const res: RespostaUnificada = await getCorretoresUnificados({
        pagina: pag,
        nome: nome || undefined,
        codigo: codigo || undefined,
        status: status || undefined,
        origem: origem || undefined,
      });
      setItems(res.items ?? []);
      setPaginacao(res.paginacao_storm ?? null);
      setSyncEm(res.sync_em ?? null);
      if (!res.paginacao_storm && origem !== "interno") setStormOff(true);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getGrupos().then(setGrupos).catch(() => {});
    carregar(1, "", "", "", "");
  }, []);

  // ── Filtrar / Sincronizar ──────────────────────────────────────────────────

  const aplicarFiltros = () => {
    setBuscaNome(filtroNome);
    setBuscaCodigo(filtroCodigo);
    setBuscaStatus(filtroStatus);
    setBuscaOrigem(filtroOrigem);
    setPagina(1);
    carregar(1, filtroNome, filtroCodigo, filtroStatus, filtroOrigem);
  };

  const limparFiltros = () => {
    setFiltroNome(""); setBuscaNome("");
    setFiltroCodigo(""); setBuscaCodigo("");
    setFiltroStatus(""); setBuscaStatus("");
    setFiltroOrigem(""); setBuscaOrigem("");
    setPagina(1);
    carregar(1, "", "", "", "");
  };

  const sincronizar = () => {
    sincronizandoRef.current = false;
    carregar(pagina, buscaNome, buscaCodigo, buscaStatus, buscaOrigem);
  };

  const irParaPagina = (pag: number) => {
    if (!paginacao || pag < 1 || pag > paginacao.paginas) return;
    setPagina(pag);
    carregar(pag, buscaNome, buscaCodigo, buscaStatus, buscaOrigem);
  };

  // ── CRUD Internos ───────────────────────────────────────────────────────────

  const abrirCriar = () => {
    setForm(EMPTY_FORM); setErroModal(""); setModal("criar");
  };

  const abrirEditar = async (c: CorretorUnificado) => {
    setSelecionado(c);
    setForm({ ...EMPTY_FORM, nome: c.nome, cpf: c.codigo, email: c.email ?? "" });
    setErroModal(""); setModal("editar");
    try {
      const detalhe = await getCorretorById(c.id);
      setForm((f) => ({
        ...f,
        cpf: detalhe.cpf ?? "",
        codigo_externo: detalhe.codigo_externo ?? "",
        telefone: detalhe.telefone ?? "",
        grupo_id: detalhe.grupo_id ?? "",
        limite_valor_diario: detalhe.limite_valor_diario ?? 0,
      }));
    } catch {
      // mantém os valores parciais já preenchidos a partir da listagem
    }
  };

  const salvar = async () => {
    setErroModal("");
    try {
      const payload = {
        ...form,
        codigo_externo: form.codigo_externo || null,
        email: form.email || null,
        telefone: form.telefone || null,
        grupo_id: form.grupo_id || null,
      };
      if (modal === "criar") {
        await criarCorretor(payload);
      } else if (selecionado) {
        await atualizarCorretor(selecionado.id, {
          nome: form.nome,
          codigo_externo: form.codigo_externo || null,
          email: form.email || null,
          telefone: form.telefone || null,
          grupo_id: form.grupo_id || null,
          limite_valor_diario: form.limite_valor_diario,
        });
      }
      setModal(null);
      carregar(pagina, buscaNome, buscaCodigo, buscaStatus, buscaOrigem);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErroModal(msg ?? "Erro ao salvar");
    }
  };

  const desativar = async (c: CorretorUnificado) => {
    if (!confirm(`Desativar ${c.nome}?`)) return;
    await desativarCorretor(c.id);
    carregar(pagina, buscaNome, buscaCodigo, buscaStatus, buscaOrigem);
  };

  const importarCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    try {
      const result = await importarCorretoresCSV(file);
      alert(`Importação concluída: ${result.sucesso} sucesso, ${result.erro} erros`);
      carregar(pagina, buscaNome, buscaCodigo, buscaStatus, buscaOrigem);
    } catch {
      alert("Erro na importação");
    } finally {
      setImportando(false);
      e.target.value = "";
    }
  };

  const exportarExcel = async () => {
    setExportando(true); setExportPct(0);
    try {
      const { job_id } = await iniciarExportacaoCorretores({
        nome: buscaNome || undefined,
        codigo: buscaCodigo || undefined,
        status: buscaStatus || undefined,
        origem: buscaOrigem || undefined,
      });

      exportPollRef.current = setInterval(async () => {
        try {
          const st = await statusExportacaoCorretores(job_id);
          setExportPct(st.percentual);

          if (st.status === "concluido") {
            if (exportPollRef.current) clearInterval(exportPollRef.current);
            const blob = await baixarExportacaoCorretores(job_id);
            const pad = (n: number) => String(n).padStart(2, "0");
            const agora = new Date();
            const nomeArquivo = `corretores_${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}_${pad(agora.getHours())}-${pad(agora.getMinutes())}.xlsx`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = nomeArquivo; a.click();
            URL.revokeObjectURL(url);
            setExportando(false);
          } else if (st.status === "erro") {
            if (exportPollRef.current) clearInterval(exportPollRef.current);
            alert(st.erro ?? "Erro ao exportar corretores");
            setExportando(false);
          }
        } catch {
          if (exportPollRef.current) clearInterval(exportPollRef.current);
          alert("Erro ao acompanhar a exportação");
          setExportando(false);
        }
      }, 1000);
    } catch {
      alert("Erro ao iniciar a exportação");
      setExportando(false);
    }
  };

  // ── Formatações ─────────────────────────────────────────────────────────────

  const formatarSyncEm = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const totalInterno = items.filter((i) => i.origem === "interno").length;
  const totalStorm   = items.filter((i) => i.origem === "storm").length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-primary)" }}>
      <Header />
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Cabeçalho */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-black uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>
              Corretores
            </h1>
            {syncEm && (
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Última sincronização: {formatarSyncEm(syncEm)}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Sincronizar Storm */}
            <button
              onClick={sincronizar}
              disabled={loading}
              className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: "rgba(139,92,246,0.15)", color: "#8B5CF6", border: "1px solid rgba(139,92,246,0.3)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
              </svg>
              {loading ? "Sincronizando..." : "Sincronizar Storm"}
            </button>

            {/* Importar CSV */}
            <label className="cursor-pointer">
              <input type="file" accept=".csv" className="hidden" onChange={importarCSV} />
              <span
                className="px-3 py-2 text-xs font-semibold rounded-lg block"
                style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              >
                {importando ? "Importando..." : "Importar CSV"}
              </span>
            </label>

            {/* Exportar Excel */}
            <button
              onClick={exportarExcel}
              disabled={exportando}
              className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide disabled:opacity-50"
              style={{ backgroundColor: "rgba(22,163,74,0.15)", color: "#16a34a", border: "1px solid rgba(22,163,74,0.3)" }}
            >
              {exportando ? `Exportando... ${exportPct}%` : "⬇ Baixar Excel"}
            </button>

            {/* Novo corretor */}
            <button
              onClick={abrirCriar}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white uppercase"
              style={{ backgroundColor: "#DC2626" }}
            >
              + Novo Corretor
            </button>
          </div>
        </div>

        {/* Aviso Storm offline */}
        {stormOff && (
          <div className="mb-4 px-4 py-2.5 rounded-lg text-xs flex items-center gap-2" style={{ backgroundColor: "rgba(139,92,246,0.08)", color: "#8B5CF6", border: "1px solid rgba(139,92,246,0.25)" }}>
            <span>⚠</span>
            <span>Colaboradores Storm indisponíveis no momento. Exibindo apenas corretores internos.</span>
          </div>
        )}

        {/* Filtros */}
        <div
          className="flex flex-wrap gap-3 mb-5 p-4 rounded-xl"
          style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <input
            value={filtroCodigo}
            onChange={(e) => setFiltroCodigo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()}
            placeholder="Código / usuário..."
            className="px-3 py-2 rounded-lg text-xs w-40"
            style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          />
          <input
            value={filtroNome}
            onChange={(e) => setFiltroNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()}
            placeholder="Buscar por nome..."
            className="px-3 py-2 rounded-lg text-xs flex-1 min-w-40"
            style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          />
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="px-3 py-2 rounded-lg text-xs"
            style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            <option value="">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
          <select
            value={filtroOrigem}
            onChange={(e) => setFiltroOrigem(e.target.value)}
            className="px-3 py-2 rounded-lg text-xs"
            style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            <option value="">Todas as origens</option>
            <option value="interno">Interno</option>
            <option value="storm">Storm</option>
          </select>
          <button
            onClick={aplicarFiltros}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white"
            style={{ backgroundColor: "#DC2626" }}
          >
            Filtrar
          </button>
          {(buscaNome || buscaCodigo || buscaStatus || buscaOrigem) && (
            <button
              onClick={limparFiltros}
              className="px-3 py-2 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
            >
              Limpar
            </button>
          )}

          {/* Contadores */}
          {!loading && items.length > 0 && (
            <div className="ml-auto flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
              {totalInterno > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: "#3B82F6" }} />
                  {totalInterno} interno{totalInterno !== 1 ? "s" : ""}
                </span>
              )}
              {totalStorm > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: "#8B5CF6" }} />
                  {paginacao ? `${paginacao.total.toLocaleString("pt-BR")} Storm` : `${totalStorm} Storm`}
                </span>
              )}
              {paginacao && paginacao.paginas > 1 && (
                <span>pág. {paginacao.pagina_atual}/{paginacao.paginas}</span>
              )}
            </div>
          )}
        </div>

        {/* Tabela unificada */}
        <div
          className="rounded-xl overflow-x-auto"
          style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          {loading ? (
            <div className="text-center py-16 text-xs" style={{ color: "var(--text-muted)" }}>
              <div
                className="inline-block w-5 h-5 border-2 border-t-transparent rounded-full animate-spin mb-2"
                style={{ borderColor: "#DC2626", borderTopColor: "transparent" }}
              />
              <br />Carregando corretores...
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ backgroundColor: "var(--bg-mid)", borderBottom: "1px solid var(--border)" }}>
                  {["Código", "Nome", "E-mail", "Tipo", "Status", "Origem", "Loja/Sala", "Privilégio", "Ações"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left font-bold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-16" style={{ color: "var(--text-muted)" }}>
                      Nenhum corretor encontrado
                    </td>
                  </tr>
                )}
                {items.map((c) => (
                  <tr
                    key={c.id}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td className="px-4 py-3">
                      <span
                        className="font-mono font-bold px-2 py-0.5 rounded text-xs"
                        style={
                          c.origem === "storm"
                            ? { backgroundColor: "rgba(139,92,246,0.1)", color: "#8B5CF6" }
                            : { backgroundColor: "rgba(59,130,246,0.1)", color: "#3B82F6" }
                        }
                      >
                        {c.codigo}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: "var(--text-primary)", maxWidth: "12rem" }}>
                      <span className="block truncate" title={c.nome}>{c.nome}</span>
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-muted)", maxWidth: "11rem" }}>
                      <span className="block truncate" title={c.email ?? ""}>{c.email ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-muted)", maxWidth: "10rem" }}>
                      <span className="block truncate" title={c.tipo ?? ""}>{c.tipo ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <BadgeStatus status={c.status} />
                    </td>
                    <td className="px-4 py-3">
                      <BadgeOrigem origem={c.origem} />
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                      {c.loja ?? "—"}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-muted)", maxWidth: "9rem" }}>
                      <span className="block truncate" title={c.privilegio ?? ""}>{c.privilegio ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      {c.origem === "interno" ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => abrirEditar(c)}
                            className="px-2 py-1 rounded text-xs font-semibold"
                            style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}
                          >
                            Editar
                          </button>
                          {c.status === "ativo" && (
                            <button
                              onClick={() => desativar(c)}
                              className="px-2 py-1 rounded text-xs font-semibold"
                              style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#EF4444" }}
                            >
                              Desativar
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Storm</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginação Storm */}
        {paginacao && paginacao.paginas > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
            <span className="text-xs mr-1" style={{ color: "var(--text-muted)" }}>Storm:</span>
            <button
              onClick={() => irParaPagina(1)}
              disabled={pagina === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
              style={{ backgroundColor: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >«</button>
            <button
              onClick={() => irParaPagina(pagina - 1)}
              disabled={pagina === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
              style={{ backgroundColor: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >‹</button>

            {Array.from({ length: Math.min(7, paginacao.paginas) }, (_, i) => {
              const inicio = Math.max(1, Math.min(pagina - 3, paginacao.paginas - 6));
              return inicio + i;
            }).filter((p) => p >= 1 && p <= paginacao.paginas).map((p) => (
              <button
                key={p}
                onClick={() => irParaPagina(p)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{
                  backgroundColor: p === pagina ? "#8B5CF6" : "var(--bg-card)",
                  color: p === pagina ? "#fff" : "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              >{p}</button>
            ))}

            <button
              onClick={() => irParaPagina(pagina + 1)}
              disabled={pagina === paginacao.paginas}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
              style={{ backgroundColor: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >›</button>
            <button
              onClick={() => irParaPagina(paginacao.paginas)}
              disabled={pagina === paginacao.paginas}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
              style={{ backgroundColor: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >»</button>
          </div>
        )}
      </div>

      {/* Modal criar/editar (apenas corretores internos) */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
          onClick={() => setModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do modal */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: "#3B82F6" }}>
                  Corretor Interno
                </p>
                <h2 className="text-sm font-black" style={{ color: "var(--text-primary)" }}>
                  {modal === "criar" ? "Novo Corretor" : "Editar Corretor"}
                </h2>
              </div>
              <button onClick={() => setModal(null)} className="text-lg" style={{ color: "var(--text-muted)" }}>✕</button>
            </div>

            <div className="flex flex-col gap-3">
              {[
                { label: "Nome",           key: "nome",           type: "text"  },
                { label: "CPF",            key: "cpf",            type: "text",  disabled: modal === "editar" },
                { label: "Código Externo", key: "codigo_externo", type: "text"  },
                { label: "E-mail",         key: "email",          type: "email" },
                { label: "Telefone",       key: "telefone",       type: "text"  },
              ].map(({ label, key, type, disabled }) => (
                <div key={key}>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>{label}</label>
                  <input
                    type={type}
                    value={form[key as keyof typeof form] as string}
                    disabled={disabled}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-xs"
                    style={{
                      backgroundColor: "var(--bg-mid)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                      opacity: disabled ? 0.5 : 1,
                    }}
                  />
                </div>
              ))}

              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>Grupo</label>
                <select
                  value={form.grupo_id}
                  onChange={(e) => setForm((f) => ({ ...f, grupo_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-xs"
                  style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                >
                  <option value="">Sem grupo</option>
                  {grupos.filter((g) => g.ativo).map((g) => (
                    <option key={g.id} value={g.id}>{g.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>
                  Limite Valor Diário (R$)
                </label>
                <input
                  type="number"
                  value={form.limite_valor_diario}
                  onChange={(e) => setForm((f) => ({ ...f, limite_valor_diario: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg text-xs"
                  style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                />
              </div>
            </div>

            {erroModal && (
              <p className="text-xs mt-3" style={{ color: "#EF4444" }}>{erroModal}</p>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setModal(null)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                className="flex-1 py-2 rounded-lg text-xs font-bold text-white"
                style={{ backgroundColor: "#DC2626" }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
