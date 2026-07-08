import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Layout from "../components/Layout";
import { getEsteiras, getVinculosEsteira, importarEsteirasWebdeck } from "../lib/api";

interface Esteira {
  id: string;
  nome: string;
  descricao: string | null;
  limite_valor: number;
  metadados: { origem?: string; grupos_webdeck?: string[] } | null;
  ativo: boolean;
  criado_em: string;
  total_corretores: number;
}

interface Vinculo {
  corretor_id: string;
  corretor_nome: string;
  codigo_externo: string | null;
  corretor_ativo: boolean;
  banco_grupo: string | null;
  data_entrada: string | null;
}

interface ImportResultado {
  esteiras_criadas: number;
  esteiras_atualizadas: number;
  corretores_criados: number;
  corretores_atualizados: number;
  vinculos_criados: number;
  vinculos_atualizados: number;
  total_erros: number;
  erros: { linha: number; erro: string }[];
}

function fmtValor(v: number) {
  return v > 0 ? `R$ ${v.toLocaleString("pt-BR")}` : "Sem limite";
}

function fmtData(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function StatCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="rounded-xl p-5 flex flex-col gap-1 flex-1 min-w-[150px]" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
      <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{value}</p>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
      {sub && <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{sub}</p>}
    </div>
  );
}

export default function EsteirasPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [busca, setBusca] = useState("");
  const [esteiraSelecionada, setEsteiraSelecionada] = useState<Esteira | null>(null);
  const [buscaVinculo, setBuscaVinculo] = useState("");
  const [importando, setImportando] = useState(false);
  const [resultadoImport, setResultadoImport] = useState<ImportResultado | null>(null);
  const [erroImport, setErroImport] = useState("");

  const { data: esteiras = [], isLoading } = useQuery<Esteira[]>({
    queryKey: ["esteiras"],
    queryFn: () => getEsteiras(),
  });

  const { data: vinculos = [], isLoading: carregandoVinculos } = useQuery<Vinculo[]>({
    queryKey: ["esteira-vinculos", esteiraSelecionada?.id],
    queryFn: () => getVinculosEsteira(esteiraSelecionada!.id),
    enabled: !!esteiraSelecionada,
  });

  const totalCorretoresVinculados = useMemo(
    () => esteiras.reduce((acc, e) => acc + (e.total_corretores || 0), 0),
    [esteiras]
  );
  const comLimite = esteiras.filter((e) => e.limite_valor > 0).length;
  const semLimite = esteiras.length - comLimite;

  const esteirasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return esteiras;
    return esteiras.filter((e) => e.nome.toLowerCase().includes(q));
  }, [esteiras, busca]);

  const vinculosFiltrados = useMemo(() => {
    const q = buscaVinculo.trim().toLowerCase();
    if (!q) return vinculos;
    return vinculos.filter(
      (v) => v.corretor_nome.toLowerCase().includes(q) || (v.codigo_externo ?? "").toLowerCase().includes(q)
    );
  }, [vinculos, buscaVinculo]);

  const dispararImportacao = () => fileInputRef.current?.click();

  const aoSelecionarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportando(true);
    setErroImport("");
    setResultadoImport(null);
    try {
      const resultado = await importarEsteirasWebdeck(file);
      setResultadoImport(resultado);
      queryClient.invalidateQueries({ queryKey: ["esteiras"] });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErroImport(msg ?? "Falha ao importar o arquivo.");
    } finally {
      setImportando(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-black uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>
              Esteiras Comerciais
            </h1>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Faixas de limite e tabelas comerciais importadas do relatório WebDeck — cadastro operacional, não é regra antifraude.
            </p>
          </div>
          <div>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={aoSelecionarArquivo} />
            <button
              onClick={dispararImportacao}
              disabled={importando}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white uppercase disabled:opacity-60"
              style={{ backgroundColor: "#DC2626" }}
            >
              {importando ? "Importando..." : "Importar CSV do WebDeck"}
            </button>
          </div>
        </div>

        {/* Resultado da importação */}
        {resultadoImport && (
          <div className="rounded-xl p-4 mb-6" style={{ backgroundColor: "var(--bg-card)", border: "1px solid rgba(34,197,94,0.35)" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase" style={{ color: "#22C55E" }}>Importação concluída</p>
              <button onClick={() => setResultadoImport(null)} className="text-xs" style={{ color: "var(--text-muted)" }}>Fechar</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs" style={{ color: "var(--text-primary)" }}>
              <div>Esteiras criadas: <b>{resultadoImport.esteiras_criadas}</b></div>
              <div>Esteiras atualizadas: <b>{resultadoImport.esteiras_atualizadas}</b></div>
              <div>Corretores criados: <b>{resultadoImport.corretores_criados}</b></div>
              <div>Corretores atualizados: <b>{resultadoImport.corretores_atualizados}</b></div>
              <div>Vínculos criados: <b>{resultadoImport.vinculos_criados}</b></div>
              <div>Vínculos atualizados: <b>{resultadoImport.vinculos_atualizados}</b></div>
              <div style={{ color: resultadoImport.total_erros > 0 ? "#EF4444" : undefined }}>
                Linhas com erro: <b>{resultadoImport.total_erros}</b>
              </div>
            </div>
            {resultadoImport.erros.length > 0 && (
              <div className="mt-3 max-h-32 overflow-y-auto text-[10px]" style={{ color: "var(--text-muted)" }}>
                {resultadoImport.erros.slice(0, 20).map((er, i) => (
                  <div key={i}>Linha {er.linha}: {er.erro}</div>
                ))}
              </div>
            )}
          </div>
        )}
        {erroImport && (
          <div className="rounded-xl p-4 mb-6 text-xs" style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.35)", color: "#EF4444" }}>
            {erroImport}
          </div>
        )}

        {/* KPIs */}
        <div className="flex flex-wrap gap-4 mb-6">
          <StatCard label="Total de Esteiras" value={esteiras.length} color="#8B5CF6" />
          <StatCard label="Corretores Vinculados" value={totalCorretoresVinculados} color="#60A5FA" sub="soma de vínculos por esteira" />
          <StatCard label="Com Limite Definido" value={comLimite} color="#22C55E" />
          <StatCard label="Sem Limite / Categoria" value={semLimite} color="#94A3B8" sub="ex: BLACKLIST, LIVRE" />
        </div>

        {/* Busca */}
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar esteira por nome..."
          className="w-full sm:w-80 px-3 py-2 rounded-lg text-xs mb-4"
          style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        />

        {/* Tabela de esteiras */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="text-left px-4 py-3 font-bold uppercase" style={{ color: "var(--text-muted)" }}>Esteira</th>
                  <th className="text-left px-4 py-3 font-bold uppercase" style={{ color: "var(--text-muted)" }}>Tags WebDeck</th>
                  <th className="text-right px-4 py-3 font-bold uppercase" style={{ color: "var(--text-muted)" }}>Limite</th>
                  <th className="text-right px-4 py-3 font-bold uppercase" style={{ color: "var(--text-muted)" }}>Corretores</th>
                  <th className="text-center px-4 py-3 font-bold uppercase" style={{ color: "var(--text-muted)" }}>Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={6} className="text-center py-10" style={{ color: "var(--text-muted)" }}>Carregando...</td></tr>
                )}
                {!isLoading && esteirasFiltradas.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10" style={{ color: "var(--text-muted)" }}>Nenhuma esteira encontrada. Importe o relatório do WebDeck para começar.</td></tr>
                )}
                {esteirasFiltradas.map((e) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-3">
                      <p className="font-bold" style={{ color: "var(--text-primary)" }}>{e.nome}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {(e.metadados?.grupos_webdeck ?? []).slice(0, 4).map((tag) => (
                          <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: "rgba(139,92,246,0.12)", color: "#8B5CF6" }}>
                            {tag.replace(e.nome, "").trim() || tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold" style={{ color: e.limite_valor > 0 ? "#DC2626" : "var(--text-muted)" }}>
                      {fmtValor(e.limite_valor)}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: "var(--text-primary)" }}>{e.total_corretores}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: e.ativo ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: e.ativo ? "#22C55E" : "#EF4444" }}>
                        {e.ativo ? "ATIVA" : "INATIVA"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { setEsteiraSelecionada(e); setBuscaVinculo(""); }}
                        className="px-2 py-1 rounded text-[10px] font-semibold"
                        style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}
                      >
                        Ver corretores
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Drawer de corretores da esteira */}
      {esteiraSelecionada && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onClick={() => setEsteiraSelecionada(null)}>
          <div
            className="w-full max-w-md h-full flex flex-col"
            style={{ backgroundColor: "var(--bg-card)", borderLeft: "1px solid var(--border-mid)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-black" style={{ color: "var(--text-primary)" }}>{esteiraSelecionada.nome}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    {fmtValor(esteiraSelecionada.limite_valor)} · {esteiraSelecionada.total_corretores} corretor(es)
                  </p>
                </div>
                <button onClick={() => setEsteiraSelecionada(null)} className="text-xs" style={{ color: "var(--text-muted)" }}>Fechar</button>
              </div>
              <input
                value={buscaVinculo}
                onChange={(e) => setBuscaVinculo(e.target.value)}
                placeholder="Buscar corretor..."
                className="w-full mt-3 px-3 py-2 rounded-lg text-xs"
                style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {carregandoVinculos && <p className="text-xs text-center py-8" style={{ color: "var(--text-muted)" }}>Carregando...</p>}
              {!carregandoVinculos && vinculosFiltrados.length === 0 && (
                <p className="text-xs text-center py-8" style={{ color: "var(--text-muted)" }}>Nenhum corretor encontrado.</p>
              )}
              {vinculosFiltrados.map((v) => (
                <div key={v.corretor_id} className="rounded-lg p-3 mb-2" style={{ backgroundColor: "var(--bg-mid)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate" style={{ color: "var(--text-primary)" }}>{v.corretor_nome}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        Código: {v.codigo_externo ?? "—"} · Desde {fmtData(v.data_entrada)}
                      </p>
                    </div>
                    {v.banco_grupo && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0" style={{ backgroundColor: "rgba(139,92,246,0.12)", color: "#8B5CF6" }}>
                        {v.banco_grupo}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
