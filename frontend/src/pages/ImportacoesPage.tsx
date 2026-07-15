import { useEffect, useState } from "react";
import Header from "../components/Header";
import {
  getLayouts, criarLayout, atualizarLayout, desativarLayout,
  getMapeamentosLayout, criarMapeamento, removerMapeamento,
  getImportacoesPropostas, importarPropostasCSV,
} from "../lib/api";

interface Layout { id: string; nome: string; tipo: string; separador: string; encoding: string; tem_cabecalho: boolean; ativo: boolean; }
interface Mapeamento { id: string; layout_id: string; coluna_origem: string; campo_destino: string; obrigatorio: boolean; ordem: number; }
interface Importacao { id: string; arquivo_nome: string; total_linhas: number; processadas: number | null; sucesso: number; erro: number; status: string; criado_em: string; concluido_em: string | null; log_erros: Array<{ linha: number; erro: string }> | null; }

const CAMPOS_PROPOSTA = ["proposta_id_externo", "cpf_cliente", "nome_cliente", "uf_cliente", "banco", "convenio", "produto", "valor", "corretor_id"];
const LAYOUT_EMPTY = { nome: "", tipo: "PROPOSTA", separador: ",", encoding: "utf-8", tem_cabecalho: true };
const MAP_EMPTY = { coluna_origem: "", campo_destino: "", obrigatorio: false, ordem: 0 };

const STATUS_COR: Record<string, string> = { CONCLUIDO: "#22C55E", PROCESSANDO: "#F59E0B", ERRO: "#EF4444", PENDENTE: "#6B7280" };

export default function ImportacoesPage() {
  const [aba, setAba] = useState<"layouts" | "importacoes">("importacoes");
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [mapeamentos, setMapeamentos] = useState<Mapeamento[]>([]);
  const [layoutSelecionado, setLayoutSelecionado] = useState<Layout | null>(null);
  const [importacoes, setImportacoes] = useState<Importacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalLayout, setModalLayout] = useState<"criar" | "editar" | null>(null);
  const [formLayout, setFormLayout] = useState(LAYOUT_EMPTY);
  const [formMap, setFormMap] = useState(MAP_EMPTY);
  const [erroLog, setErroLog] = useState<Importacao | null>(null);
  const [importando, setImportando] = useState(false);
  const [layoutImportId, setLayoutImportId] = useState("");

  const carregarLayouts = async () => {
    const l = await getLayouts();
    setLayouts(l);
  };

  const carregarImportacoes = async () => {
    setLoading(true);
    try { setImportacoes(await getImportacoesPropostas()); } finally { setLoading(false); }
  };

  useEffect(() => {
    carregarLayouts();
    carregarImportacoes();
  }, []);

  const abrirLayout = async (l: Layout) => {
    setLayoutSelecionado(l);
    setMapeamentos(await getMapeamentosLayout(l.id));
  };

  const salvarLayout = async () => {
    if (modalLayout === "criar") await criarLayout(formLayout);
    else if (layoutSelecionado) await atualizarLayout(layoutSelecionado.id, formLayout);
    setModalLayout(null);
    carregarLayouts();
  };

  const adicionarMap = async () => {
    if (!layoutSelecionado) return;
    await criarMapeamento(layoutSelecionado.id, formMap);
    setMapeamentos(await getMapeamentosLayout(layoutSelecionado.id));
    setFormMap(MAP_EMPTY);
  };

  const removerMap = async (mid: string) => {
    if (!layoutSelecionado) return;
    await removerMapeamento(layoutSelecionado.id, mid);
    setMapeamentos(await getMapeamentosLayout(layoutSelecionado.id));
  };

  const importarCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    try {
      const result = await importarPropostasCSV(file, layoutImportId || undefined);
      alert(`Importação concluída: ${result.sucesso} sucesso, ${result.erro} erros`);
      carregarImportacoes();
    } catch {
      alert("Erro ao importar");
    } finally {
      setImportando(false);
      e.target.value = "";
    }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-primary)" }}>
      <Header />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-xl font-black uppercase tracking-widest mb-6" style={{ color: "var(--text-primary)" }}>
          Importações
        </h1>

        {/* Abas */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {(["importacoes", "layouts"] as const).map((a) => (
            <button key={a} onClick={() => setAba(a)} className="px-4 py-2 rounded-lg text-xs font-bold uppercase" style={{ backgroundColor: aba === a ? "#DC2626" : "transparent", color: aba === a ? "#fff" : "var(--text-muted)" }}>
              {a === "importacoes" ? "Histórico" : "Layouts"}
            </button>
          ))}
        </div>

        {/* === ABA IMPORTAÇÕES === */}
        {aba === "importacoes" && (
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-5 p-4 rounded-xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <select value={layoutImportId} onChange={(e) => setLayoutImportId(e.target.value)} className="px-3 py-2 rounded-lg text-xs flex-1" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                <option value="">Sem layout (cabeçalho padrão)</option>
                {layouts.filter((l) => l.ativo && l.tipo === "PROPOSTA").map((l) => (<option key={l.id} value={l.id}>{l.nome}</option>))}
              </select>
              <label className="cursor-pointer">
                <input type="file" accept=".csv" className="hidden" onChange={importarCSV} />
                <span className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#DC2626" }}>
                  {importando ? "Importando..." : "Importar CSV de Propostas"}
                </span>
              </label>
            </div>

            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
              {loading ? (
                <div className="text-center py-16 text-xs" style={{ color: "var(--text-muted)" }}>Carregando...</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ backgroundColor: "var(--bg-mid)", borderBottom: "1px solid var(--border)" }}>
                      {["Arquivo", "Total", "Sucesso", "Erros", "Status", "Data", ""].map((h) => (
                        <th key={h} className="px-4 py-3 text-left font-bold uppercase" style={{ color: "var(--text-muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importacoes.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-12" style={{ color: "var(--text-muted)" }}>Nenhuma importação</td></tr>
                    )}
                    {importacoes.map((imp) => (
                      <tr key={imp.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="px-4 py-3 font-medium" style={{ color: "var(--text-primary)" }}>{imp.arquivo_nome}</td>
                        <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{imp.total_linhas}</td>
                        <td className="px-4 py-3 font-bold" style={{ color: "#22C55E" }}>{imp.sucesso}</td>
                        <td className="px-4 py-3 font-bold" style={{ color: imp.erro > 0 ? "#EF4444" : "var(--text-muted)" }}>{imp.erro}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: `${STATUS_COR[imp.status] ?? "#6B7280"}20`, color: STATUS_COR[imp.status] ?? "#6B7280" }}>
                            {imp.status}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{new Date(imp.criado_em).toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-3">
                          {imp.log_erros && imp.log_erros.length > 0 && (
                            <button onClick={() => setErroLog(imp)} className="px-2 py-1 rounded text-xs" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#EF4444" }}>Ver erros</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* === ABA LAYOUTS === */}
        {aba === "layouts" && (
          <div className="flex gap-5">
            <div className="w-72 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold uppercase" style={{ color: "var(--text-muted)" }}>Layouts</h2>
                <button onClick={() => { setFormLayout(LAYOUT_EMPTY); setModalLayout("criar"); }} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#DC2626" }}>+ Novo</button>
              </div>
              <div className="flex flex-col gap-2">
                {layouts.map((l) => (
                  <button key={l.id} onClick={() => abrirLayout(l)} className="text-left p-3 rounded-xl transition-all" style={{ backgroundColor: layoutSelecionado?.id === l.id ? "rgba(220,38,38,0.1)" : "var(--bg-card)", border: `1px solid ${layoutSelecionado?.id === l.id ? "#DC2626" : "var(--border)"}` }}>
                    <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{l.nome}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{l.tipo} · {l.separador === "," ? "Vírgula" : "Ponto-e-vírgula"}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1">
              {!layoutSelecionado ? (
                <div className="text-center py-20 text-xs" style={{ color: "var(--text-muted)" }}>Selecione um layout</div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-sm font-black" style={{ color: "var(--text-primary)" }}>{layoutSelecionado.nome}</h2>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Tipo: {layoutSelecionado.tipo} · Separador: "{layoutSelecionado.separador}" · Encoding: {layoutSelecionado.encoding}</p>
                    </div>
                    <button onClick={() => desativarLayout(layoutSelecionado.id).then(carregarLayouts).then(() => setLayoutSelecionado(null))} className="px-2 py-1 rounded text-xs" style={{ color: "#EF4444", backgroundColor: "rgba(239,68,68,0.1)" }}>Desativar</button>
                  </div>

                  <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
                    <h3 className="text-xs font-bold uppercase mb-3" style={{ color: "var(--text-muted)" }}>Mapeamentos de Colunas</h3>
                    <div className="flex gap-2 mb-3">
                      <input value={formMap.coluna_origem} onChange={(e) => setFormMap((f) => ({ ...f, coluna_origem: e.target.value }))} placeholder="Coluna do CSV" className="flex-1 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
                      <select value={formMap.campo_destino} onChange={(e) => setFormMap((f) => ({ ...f, campo_destino: e.target.value }))} className="flex-1 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                        <option value="">Campo destino</option>
                        {CAMPOS_PROPOSTA.map((c) => (<option key={c} value={c}>{c}</option>))}
                      </select>
                      <button onClick={adicionarMap} className="px-3 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#DC2626" }}>+</button>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <th className="py-2 text-left font-bold" style={{ color: "var(--text-muted)" }}>Coluna CSV</th>
                          <th className="py-2 text-left font-bold" style={{ color: "var(--text-muted)" }}>Campo Destino</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {mapeamentos.map((m) => (
                          <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td className="py-2 font-mono" style={{ color: "var(--text-primary)" }}>{m.coluna_origem}</td>
                            <td className="py-2 font-mono" style={{ color: "#DC2626" }}>{m.campo_destino}</td>
                            <td className="py-2 text-right">
                              <button onClick={() => removerMap(m.id)} className="px-2 py-0.5 rounded text-xs" style={{ color: "#EF4444", backgroundColor: "rgba(239,68,68,0.1)" }}>x</button>
                            </td>
                          </tr>
                        ))}
                        {mapeamentos.length === 0 && (
                          <tr><td colSpan={3} className="py-4 text-center" style={{ color: "var(--text-muted)" }}>Nenhum mapeamento</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal criar layout */}
      {modalLayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-black uppercase mb-5" style={{ color: "var(--text-primary)" }}>Novo Layout</h2>
            <div className="flex flex-col gap-3">
              {[{ label: "Nome", key: "nome", type: "text" }, { label: "Separador", key: "separador", type: "text" }, { label: "Encoding", key: "encoding", type: "text" }].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>{label}</label>
                  <input type={type} value={formLayout[key as keyof typeof formLayout] as string} onChange={(e) => setFormLayout((f) => ({ ...f, [key]: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>Tipo</label>
                <select value={formLayout.tipo} onChange={(e) => setFormLayout((f) => ({ ...f, tipo: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                  <option value="PROPOSTA">Proposta</option>
                  <option value="CORRETOR">Corretor</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-primary)" }}>
                <input type="checkbox" checked={formLayout.tem_cabecalho} onChange={(e) => setFormLayout((f) => ({ ...f, tem_cabecalho: e.target.checked }))} />
                Tem cabeçalho
              </label>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModalLayout(null)} className="flex-1 py-2 rounded-lg text-xs font-semibold" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}>Cancelar</button>
              <button onClick={salvarLayout} className="flex-1 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#DC2626" }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal log de erros */}
      {erroLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.8)" }}>
          <div className="w-full max-w-lg rounded-2xl p-6" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black uppercase" style={{ color: "var(--text-primary)" }}>Erros — {erroLog.arquivo_nome}</h2>
              <button onClick={() => setErroLog(null)} className="text-xs" style={{ color: "var(--text-muted)" }}>Fechar</button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {(erroLog.log_erros ?? []).map((e, i) => (
                <div key={i} className="flex gap-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="text-xs font-mono font-bold" style={{ color: "#EF4444", minWidth: "40px" }}>L{e.linha}</span>
                  <span className="text-xs" style={{ color: "var(--text-primary)" }}>{e.erro}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
