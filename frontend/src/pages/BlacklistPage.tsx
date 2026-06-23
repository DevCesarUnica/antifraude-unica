import { useState, useEffect, useRef } from "react";
import Layout from "../components/Layout";
import {
  getBlacklist, criarEntradaBlacklist, removerEntradaBlacklist, importarBlacklist,
} from "../lib/api";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type TipoBlacklist = "CPF" | "CNPJ" | "TELEFONE" | "EMAIL";

interface EntradaBL {
  id: string;
  tipo: TipoBlacklist;
  valor: string;
  motivo: string;
  fonte: string | null;
  adicionado_por: string | null;
  ativo: boolean;
  criado_em: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any;

function fmtData(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR");
}

function fmtValor(tipo: TipoBlacklist, valor: string): string {
  if (tipo === "CPF" && valor.length === 11)
    return `${valor.slice(0,3)}.${valor.slice(3,6)}.${valor.slice(6,9)}-${valor.slice(9)}`;
  if (tipo === "CNPJ" && valor.length === 14)
    return `${valor.slice(0,2)}.${valor.slice(2,5)}.${valor.slice(5,8)}/${valor.slice(8,12)}-${valor.slice(12)}`;
  if (tipo === "TELEFONE" && valor.length === 11)
    return `(${valor.slice(0,2)}) ${valor.slice(2,7)}-${valor.slice(7)}`;
  if (tipo === "TELEFONE" && valor.length === 10)
    return `(${valor.slice(0,2)}) ${valor.slice(2,6)}-${valor.slice(6)}`;
  return valor;
}

const TIPO_COR: Record<TipoBlacklist, { bg: string; color: string }> = {
  CPF:      { bg: "rgba(220,38,38,0.12)",    color: "#DC2626"  },
  CNPJ:     { bg: "rgba(234,88,12,0.12)",    color: "#ea580c"  },
  TELEFONE: { bg: "rgba(168,85,247,0.12)",   color: "#a855f7"  },
  EMAIL:    { bg: "rgba(59,130,246,0.12)",   color: "#3b82f6"  },
};

function Badge({ tipo }: { tipo: TipoBlacklist }) {
  const { bg, color } = TIPO_COR[tipo] ?? TIPO_COR.CPF;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide" style={{ backgroundColor: bg, color }}>
      {tipo}
    </span>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: "#DC262620", borderTopColor: "#DC2626" }} />
    </div>
  );
}

function AlertErro({ msg }: { msg: string }) {
  return <p className="text-xs font-semibold px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.2)" }}>{msg}</p>;
}

function AlertOk({ msg }: { msg: string }) {
  return <p className="text-xs font-semibold px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(34,197,94,0.08)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }}>{msg}</p>;
}

// ── Página ────────────────────────────────────────────────────────────────────

const TIPOS: TipoBlacklist[] = ["CPF", "CNPJ", "TELEFONE", "EMAIL"];

export default function BlacklistPage() {
  const [items, setItems] = useState<EntradaBL[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ tipo: "CPF" as TipoBlacklist, valor: "", motivo: "", fonte: "" });
  const [salvando, setSalvando] = useState(false);

  const [excluindo, setExcluindo] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);
  const [importResult, setImportResult] = useState<{ inseridos: number; pulados: number } | null>(null);

  const LIMITE = 20;

  const carregar = async (p = pagina) => {
    setLoading(true); setErro("");
    try {
      const data = await getBlacklist({ pagina: p, limite: LIMITE, tipo: filtroTipo || undefined, busca: busca || undefined });
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e: AnyData) {
      setErro(e?.response?.data?.detail ?? "Erro ao carregar blacklist.");
    } finally { setLoading(false); }
  };

  useEffect(() => { carregar(1); setPagina(1); }, [busca, filtroTipo]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = async () => {
    if (!form.valor.trim() || !form.motivo.trim()) { setErro("Valor e motivo são obrigatórios."); return; }
    setSalvando(true); setErro(""); setMsg("");
    try {
      await criarEntradaBlacklist({ tipo: form.tipo, valor: form.valor, motivo: form.motivo, fonte: form.fonte || undefined });
      setMsg("Entrada adicionada com sucesso.");
      setShowModal(false);
      setForm({ tipo: "CPF", valor: "", motivo: "", fonte: "" });
      carregar(1); setPagina(1);
    } catch (e: AnyData) {
      setErro(e?.response?.data?.detail ?? "Erro ao salvar.");
    } finally { setSalvando(false); }
  };

  const excluir = async (id: string) => {
    setExcluindo(id); setErro(""); setMsg("");
    try {
      await removerEntradaBlacklist(id);
      setMsg("Entrada removida.");
      setItems((prev) => prev.filter((i) => i.id !== id));
      setTotal((t) => t - 1);
    } catch (e: AnyData) {
      setErro(e?.response?.data?.detail ?? "Erro ao remover.");
    } finally { setExcluindo(null); }
  };

  const importarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true); setErro(""); setMsg(""); setImportResult(null);
    try {
      const res = await importarBlacklist(file);
      setImportResult(res);
      carregar(1); setPagina(1);
    } catch (e: AnyData) {
      setErro(e?.response?.data?.detail ?? "Erro ao importar.");
    } finally {
      setImportando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const totalPaginas = Math.ceil(total / LIMITE);

  return (
    <Layout>
      <div className="space-y-5 max-w-5xl">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>Blacklist</h1>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              CPF, CNPJ, telefone e e-mail bloqueados pelo sistema antifraude.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importando}
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all"
              style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
            >
              {importando ? "Importando..." : "Importar CSV"}
            </button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={importarArquivo} />
            <button
              onClick={() => { setShowModal(true); setErro(""); setMsg(""); }}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: "#DC2626" }}
            >
              + Adicionar
            </button>
          </div>
        </div>

        {/* Contadores por tipo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TIPOS.map((t) => {
            const count = items.filter((i) => i.tipo === t).length;
            const { bg, color } = TIPO_COR[t];
            return (
              <button
                key={t}
                onClick={() => setFiltroTipo(filtroTipo === t ? "" : t)}
                className="rounded-xl p-3 text-left transition-all"
                style={{
                  backgroundColor: filtroTipo === t ? bg : "var(--bg-card)",
                  border: `1px solid ${filtroTipo === t ? color : "var(--border)"}`,
                }}
              >
                <p className="text-xs font-black uppercase tracking-widest" style={{ color }}>{t}</p>
                <p className="text-xl font-black mt-1" style={{ color: "var(--text-primary)" }}>
                  {filtroTipo === t ? items.length : count}
                </p>
              </button>
            );
          })}
        </div>

        {/* Feedback */}
        {msg && <AlertOk msg={msg} />}
        {importResult && (
          <AlertOk msg={`Importação concluída: ${importResult.inseridos} inseridos, ${importResult.pulados} ignorados (duplicados).`} />
        )}
        {erro && <AlertErro msg={erro} />}

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por valor..."
            className="flex-1 min-w-44 px-3 py-2 rounded-lg text-xs"
            style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          />
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="px-3 py-2 rounded-lg text-xs"
            style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            <option value="">Todos os tipos</option>
            {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="self-center text-xs" style={{ color: "var(--text-muted)" }}>
            {total} entrada{total !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Tabela */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {loading ? <Spinner /> : items.length === 0 ? (
            <p className="text-center py-12 text-xs" style={{ color: "var(--text-muted)" }}>
              {busca || filtroTipo ? "Nenhuma entrada encontrada para o filtro." : "Blacklist vazia. Adicione entradas manualmente ou importe um CSV."}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ backgroundColor: "var(--bg-mid)", borderBottom: "1px solid var(--border)" }}>
                  {["Tipo", "Valor", "Motivo", "Fonte", "Adicionado em", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-bold uppercase text-[10px]" style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-2.5"><Badge tipo={item.tipo} /></td>
                    <td className="px-4 py-2.5 font-mono font-bold" style={{ color: "var(--text-primary)" }}>
                      {fmtValor(item.tipo, item.valor)}
                    </td>
                    <td className="px-4 py-2.5 max-w-xs truncate" style={{ color: "var(--text-muted)" }}>{item.motivo}</td>
                    <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{item.fonte ?? "—"}</td>
                    <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{fmtData(item.criado_em)}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => excluir(item.id)}
                        disabled={excluindo === item.id}
                        className="px-2.5 py-1 rounded text-[10px] font-semibold transition-all"
                        style={{ backgroundColor: "rgba(220,38,38,0.08)", color: "#DC2626" }}
                      >
                        {excluindo === item.id ? "..." : "Remover"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { const p = Math.max(1, pagina - 1); setPagina(p); carregar(p); }}
              disabled={pagina === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: "var(--bg-mid)", color: pagina === 1 ? "var(--text-muted)" : "var(--text-primary)", opacity: pagina === 1 ? 0.5 : 1 }}
            >&#8249; Anterior</button>
            <span className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}>
              {pagina} / {totalPaginas}
            </span>
            <button
              onClick={() => { const p = Math.min(totalPaginas, pagina + 1); setPagina(p); carregar(p); }}
              disabled={pagina >= totalPaginas}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: "var(--bg-mid)", color: pagina >= totalPaginas ? "var(--text-muted)" : "var(--text-primary)", opacity: pagina >= totalPaginas ? 0.5 : 1 }}
            >Próxima &#8250;</button>
          </div>
        )}

      </div>

      {/* Modal adicionar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.65)" }}>
          <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h3 className="text-sm font-black uppercase" style={{ color: "var(--text-primary)" }}>Adicionar à Blacklist</h3>

            <div>
              <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Tipo</label>
              <div className="flex gap-2">
                {TIPOS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm((f) => ({ ...f, tipo: t, valor: "" }))}
                    className="flex-1 py-1.5 rounded-lg text-xs font-bold uppercase transition-all"
                    style={{
                      backgroundColor: form.tipo === t ? TIPO_COR[t].bg : "var(--bg-mid)",
                      color: form.tipo === t ? TIPO_COR[t].color : "var(--text-muted)",
                      border: `1px solid ${form.tipo === t ? TIPO_COR[t].color : "var(--border)"}`,
                    }}
                  >{t}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>
                {form.tipo === "CPF" ? "CPF (somente números)" : form.tipo === "CNPJ" ? "CNPJ (somente números)" : form.tipo === "TELEFONE" ? "Telefone (somente números)" : "E-mail"}
              </label>
              <input
                value={form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                placeholder={form.tipo === "CPF" ? "00000000000" : form.tipo === "CNPJ" ? "00000000000000" : form.tipo === "TELEFONE" ? "11999999999" : "email@exemplo.com"}
                className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
                style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Motivo *</label>
              <textarea
                value={form.motivo}
                onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
                rows={2}
                placeholder="Descreva o motivo do bloqueio..."
                className="w-full px-3 py-2 rounded-lg text-xs resize-none"
                style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Fonte (opcional)</label>
              <input
                value={form.fonte}
                onChange={(e) => setForm((f) => ({ ...f, fonte: e.target.value }))}
                placeholder="Ex: análise manual, denúncia, bureau..."
                className="w-full px-3 py-2 rounded-lg text-xs"
                style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              />
            </div>

            {erro && <AlertErro msg={erro} />}

            <div className="flex gap-3">
              <button
                onClick={() => { setShowModal(false); setErro(""); }}
                className="flex-1 py-2 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}
              >Cancelar</button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="flex-1 py-2 rounded-lg text-xs font-bold text-white"
                style={{ backgroundColor: "#DC2626", opacity: salvando ? 0.7 : 1 }}
              >{salvando ? "Salvando..." : "Adicionar"}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
