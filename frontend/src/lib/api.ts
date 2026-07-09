import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // 401 só faz logout se não for uma rota de integração externa (/storm, /titan)
    const url: string = err.config?.url ?? "";
    const isExternalIntegration = url.startsWith("/storm") || url.startsWith("/titan");
    if (err.response?.status === 401 && !isExternalIntegration) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ── Propostas ─────────────────────────────────────────────────────────────────

export const getPropostas = (params?: { status?: string; banco?: string; cpf?: string; nome?: string }) =>
  api.get("/propostas/", { params }).then((r) => r.data);

export const getPropostaSummary = () =>
  api.get("/propostas/summary").then((r) => r.data);

export const getPropostaById = (id: string) =>
  api.get(`/propostas/${id}`).then((r) => r.data);

export const getAuditoriaProposta = (id: string) =>
  api.get(`/propostas/${id}/auditoria`).then((r) => r.data);

export const getDebugProposta = (id: string) =>
  api.get(`/propostas/${id}/debug`).then((r) => r.data);

export const criarProposta = (data: unknown) =>
  api.post("/propostas/", data).then((r) => r.data);

export const aprovarProposta = (id: string) =>
  api.post(`/propostas/${id}/aprovar`).then((r) => r.data);

export const bloquearProposta = (id: string) =>
  api.post(`/propostas/${id}/bloquear`).then((r) => r.data);

export const reprocessarProposta = (id: string) =>
  api.post(`/propostas/${id}/reprocessar`).then((r) => r.data);

export const enviarPropostaBanco = (id: string) =>
  api.post(`/propostas/${id}/enviar-banco`).then((r) => r.data);

export const getPropostasDashboard = (params?: {
  banco?: string;
  status?: string;
  cpf?: string;
  nome?: string;
  corretor?: string;
  valor_min?: number;
  valor_max?: number;
  data_inicio?: string;
  data_fim?: string;
  order_by?: string;
  order_dir?: "asc" | "desc";
  skip?: number;
  limit?: number;
}) => api.get("/propostas/dashboard", { params }).then((r) => r.data);

// ── Regras ────────────────────────────────────────────────────────────────────

export const getRegras = (ativo?: boolean) =>
  api.get("/regras/", { params: ativo !== undefined ? { ativo } : {} }).then((r) => r.data);

export const criarRegra = (data: unknown) =>
  api.post("/regras/", data).then((r) => r.data);

export const atualizarRegra = (id: string, data: unknown) =>
  api.patch(`/regras/${id}`, data).then((r) => r.data);

export const desativarRegra = (id: string) =>
  api.delete(`/regras/${id}`).then((r) => r.data);

export const getAuditoriaRegra = (id: string) =>
  api.get(`/regras/${id}/auditoria`).then((r) => r.data);

export const gerarRegrasDeEsteiras = () =>
  api.post("/regras/gerar-de-esteiras").then((r) => r.data);

export const simularRegra = (data: {
  cpf_cliente: string;
  banco?: string;
  convenio?: string | null;
  uf_cliente?: string | null;
  produto?: string | null;
  valor: number;
}) => api.post("/regras/simular", data).then((r) => r.data);

// ── Titan ─────────────────────────────────────────────────────────────────────

export const getTitanStatus = () =>
  api.get("/titan/status").then((r) => r.data);

export const getTitanBancos = (forceRefresh = false) =>
  api.get("/titan/bancos", { params: { force_refresh: forceRefresh } }).then((r) => r.data);

export const getTitanProdutosBanco = (bancoId: number | string, forceRefresh = false) =>
  api.get(`/titan/bancos/${bancoId}/produtos`, { params: { force_refresh: forceRefresh } }).then((r) => r.data);

export const getTitanReferenciaBanco = (bancoId: number | string, forceRefresh = false) =>
  api.get(`/titan/bancos/${bancoId}/referencia`, { params: { force_refresh: forceRefresh } }).then((r) => r.data);

export const getTitanReferencia = (forceRefresh = false) =>
  api.get("/titan/referencia", { params: { force_refresh: forceRefresh } }).then((r) => r.data);

export const invalidarCacheTitan = (endpoint?: string) =>
  api.delete("/titan/cache", { params: endpoint ? { endpoint } : {} }).then((r) => r.data);

export const getHopeOperacoes = (params?: {
  pagina?: number;
  tamanho?: number;
  status_id?: number;
  data_inicio?: string;
  data_fim?: string;
}) => api.get("/titan/operacoes", { params }).then((r) => r.data);

// ── Bancos ────────────────────────────────────────────────────────────────────

export const getBancosIntegracoes = () =>
  api.get("/bancos/").then((r) => r.data);

export const getStatusBanco = (slug: string) =>
  api.get(`/bancos/${slug}/status`).then((r) => r.data);

export const getProdutosBanco = (slug: string) =>
  api.get(`/bancos/${slug}/produtos`).then((r) => r.data);

export const getReferenciaBanco = (slug: string, forceRefresh = false) =>
  api.get(`/bancos/${slug}/referencia`, { params: { force_refresh: forceRefresh } }).then((r) => r.data);

// ── Auth ──────────────────────────────────────────────────────────────────────

export const login = (identificador: string, senha: string) =>
  api.post("/auth/login", { identificador, senha }).then((r) => r.data);

export const getMe = () =>
  api.get("/auth/me").then((r) => r.data);

// ── Usuários ──────────────────────────────────────────────────────────────────

export const getUsuarios = () =>
  api.get("/usuarios/").then((r) => r.data);

export const criarUsuario = (data: unknown) =>
  api.post("/usuarios/", data).then((r) => r.data);

export const atualizarUsuario = (id: string, data: unknown) =>
  api.patch(`/usuarios/${id}`, data).then((r) => r.data);

export const desativarUsuario = (id: string) =>
  api.delete(`/usuarios/${id}`).then((r) => r.data);

export const excluirUsuario = (id: string) =>
  api.delete(`/usuarios/${id}/excluir`).then((r) => r.data);

// ── Storm (Colaborador) ───────────────────────────────────────────────────────

export const getStormStatus = () =>
  api.get("/storm/status").then((r) => r.data);

export const resetarCircuitBreakerStorm = () =>
  api.post("/storm/status/reset").then((r) => r.data);

export const getStormAntifraude = (esteira: string, pagina = 1) =>
  api.get("/storm/antifraude/contratos", { params: { esteira, pagina } }).then((r) => r.data);

export const getStormTiposRecusas = () =>
  api.get("/storm/antifraude/tipos-recusas").then((r) => r.data);

export const getStormTiposPendencias = () =>
  api.get("/storm/antifraude/tipos-pendencias").then((r) => r.data);

export const aprovarContratoStorm = (id: number) =>
  api.post(`/storm/antifraude/${id}/aprovar`).then((r) => r.data);

export const recusarContratoStorm = (id: number, data: { tipo_recusa_id: number; observacao?: string }) =>
  api.post(`/storm/antifraude/${id}/recusar`, data).then((r) => r.data);

export const pendenciarContratoStorm = (id: number, data: { tipo_pendencia_id: number; observacao?: string }) =>
  api.post(`/storm/antifraude/${id}/pendenciar`, data).then((r) => r.data);

export const reanalisarContratoStorm = (id: number, data: { observacao: string }) =>
  api.post(`/storm/antifraude/${id}/reanalisar`, data).then((r) => r.data);

export const getStormContratos = (params?: {
  pagina?: number; cpf?: string; ff?: string; id_banco?: number; id_status?: number;
  data_inicio?: string; data_fim?: string;
}) => api.get("/storm/contratos", { params }).then((r) => r.data);

export const getStormHistoricoContrato = (ff: string) =>
  api.get("/storm/contratos/historico", { params: { ff } }).then((r) => r.data);

export const getStormClienteCpf = (cpf: string) =>
  api.get(`/storm/clientes/cpf/${cpf}`).then((r) => r.data);

export const getStormClienteTelefone = (tel: string) =>
  api.get(`/storm/clientes/telefone/${tel}`).then((r) => r.data);

export const getStormColaboradores = (params?: { pagina?: number; usuario?: string; status_usuario?: string }) =>
  api.get("/storm/colaboradores", { params }).then((r) => r.data);

export const getStormColaborador = (id: number) =>
  api.get(`/storm/colaboradores/${id}`).then((r) => r.data);

export const getStormParceiros = (params?: { pagina?: number; nome?: string; cpf_cnpj?: string; status?: string }) =>
  api.get("/storm/parceiros", { params }).then((r) => r.data);

export const getStormParceiro = (id: number) =>
  api.get(`/storm/parceiros/${id}`).then((r) => r.data);

export const simularCLTStorm = (cpf: string, banco_id: number, valor_solicitado?: number, matricula?: string) =>
  api.get("/storm/simulacoes/clt", { params: { cpf, banco_id, valor_solicitado, matricula } }).then((r) => r.data);

export const simularFGTSStorm = (cpf: string, banco_id: number) =>
  api.get("/storm/simulacoes/fgts", { params: { cpf, banco_id } }).then((r) => r.data);

export const getStormBancos = () =>
  api.get("/storm/bancos").then((r) => r.data);

export const getStormOrgaos = () =>
  api.get("/storm/orgaos").then((r) => r.data);

export const getStormStatusContratos = () =>
  api.get("/storm/contratos/status").then((r) => r.data);

export const getStormAcompanhamentoContrato = (ff: string) =>
  api.get(`/storm/contratos/${encodeURIComponent(ff)}/acompanhamento`).then((r) => r.data);

// ── Corretores ────────────────────────────────────────────────────────────────

export const getCorretores = (params?: { nome?: string; cpf?: string; grupo_id?: string; ativo?: boolean }) =>
  api.get("/corretores/", { params }).then((r) => r.data);

export const getCorretoresUnificados = (params?: {
  pagina?: number;
  nome?: string;
  codigo?: string;
  status?: string;
  origem?: string;
}) => api.get("/corretores/unificados", { params }).then((r) => r.data);

export const criarCorretor = (data: unknown) =>
  api.post("/corretores/", data).then((r) => r.data);

export const getCorretorById = (id: string) =>
  api.get(`/corretores/${id}`).then((r) => r.data);

export const atualizarCorretor = (id: string, data: unknown) =>
  api.patch(`/corretores/${id}`, data).then((r) => r.data);

export const desativarCorretor = (id: string) =>
  api.delete(`/corretores/${id}`).then((r) => r.data);

export const getContatosCorretor = (id: string) =>
  api.get(`/corretores/${id}/contatos`).then((r) => r.data);

export const adicionarContatoCorretor = (id: string, data: unknown) =>
  api.post(`/corretores/${id}/contatos`, data).then((r) => r.data);

export const removerContatoCorretor = (corretorId: string, contatoId: string) =>
  api.delete(`/corretores/${corretorId}/contatos/${contatoId}`).then((r) => r.data);

export const importarCorretoresCSV = (file: File) => {
  const fd = new FormData();
  fd.append("arquivo", file);
  return api.post("/corretores/importar", fd).then((r) => r.data);
};

export const getHistoricoImportacoesCorretores = () =>
  api.get("/corretores/importacoes/historico").then((r) => r.data);

// ── Grupos ────────────────────────────────────────────────────────────────────

export const getGrupos = (params?: { ativo?: boolean }) =>
  api.get("/grupos/", { params }).then((r) => r.data);

export const criarGrupo = (data: unknown) =>
  api.post("/grupos/", data).then((r) => r.data);

export const getGrupoById = (id: string) =>
  api.get(`/grupos/${id}`).then((r) => r.data);

export const atualizarGrupo = (id: string, data: unknown) =>
  api.patch(`/grupos/${id}`, data).then((r) => r.data);

export const desativarGrupo = (id: string) =>
  api.delete(`/grupos/${id}`).then((r) => r.data);

export const vincularCorretorGrupo = (grupoId: string, corretorId: string) =>
  api.post(`/grupos/${grupoId}/corretores/${corretorId}`).then((r) => r.data);

export const desvincularCorretorGrupo = (grupoId: string, corretorId: string) =>
  api.delete(`/grupos/${grupoId}/corretores/${corretorId}`).then((r) => r.data);

// ── Esteiras Comerciais (WebDeck) ───────────────────────────────────────────────

export const getEsteiras = (params?: { ativo?: boolean }) =>
  api.get("/grupos/esteiras", { params }).then((r) => r.data);

export const getVinculosEsteira = (grupoId: string) =>
  api.get(`/grupos/${grupoId}/vinculos`).then((r) => r.data);

export const importarEsteirasWebdeck = (file: File) => {
  const fd = new FormData();
  fd.append("arquivo", file);
  return api.post("/grupos/importar-webdeck", fd).then((r) => r.data);
};

// ── Layouts de Importação ─────────────────────────────────────────────────────

export const getLayouts = (tipo?: string) =>
  api.get("/layouts/", { params: tipo ? { tipo } : {} }).then((r) => r.data);

export const criarLayout = (data: unknown) =>
  api.post("/layouts/", data).then((r) => r.data);

export const atualizarLayout = (id: string, data: unknown) =>
  api.patch(`/layouts/${id}`, data).then((r) => r.data);

export const desativarLayout = (id: string) =>
  api.delete(`/layouts/${id}`).then((r) => r.data);

export const getMapeamentosLayout = (layoutId: string) =>
  api.get(`/layouts/${layoutId}/mapeamentos`).then((r) => r.data);

export const criarMapeamento = (layoutId: string, data: unknown) =>
  api.post(`/layouts/${layoutId}/mapeamentos`, data).then((r) => r.data);

export const removerMapeamento = (layoutId: string, mapeamentoId: string) =>
  api.delete(`/layouts/${layoutId}/mapeamentos/${mapeamentoId}`).then((r) => r.data);

// ── Importações ───────────────────────────────────────────────────────────────

export const importarPropostasCSV = (file: File, layoutId?: string) => {
  const fd = new FormData();
  fd.append("arquivo", file);
  if (layoutId) fd.append("layout_id", layoutId);
  return api.post("/importacoes/propostas", fd).then((r) => r.data);
};

export const getImportacoesPropostas = () =>
  api.get("/importacoes/propostas").then((r) => r.data);

export const getDetalheImportacao = (id: string) =>
  api.get(`/importacoes/propostas/${id}`).then((r) => r.data);

// ── Averbações ────────────────────────────────────────────────────────────────

export const getAverbacoes = (params?: { status_av?: string; banco?: string }) =>
  api.get("/averbacoes/", { params }).then((r) => r.data);

export const averbarProposta = (propostaId: string, data: unknown) =>
  api.post(`/averbacoes/propostas/${propostaId}`, data).then((r) => r.data);

export const getAverbacoesProposta = (propostaId: string) =>
  api.get(`/averbacoes/propostas/${propostaId}`).then((r) => r.data);

export const confirmarAverbacao = (id: string, numeroOperacao?: string) =>
  api.post(`/averbacoes/${id}/confirmar`, null, { params: numeroOperacao ? { numero_operacao: numeroOperacao } : {} }).then((r) => r.data);

export const cancelarAverbacao = (id: string) =>
  api.post(`/averbacoes/${id}/cancelar`).then((r) => r.data);

// ── Retornos Banco ────────────────────────────────────────────────────────────

export const getRetornosBanco = (params?: { banco?: string; tipo_retorno?: string; processado?: boolean }) =>
  api.get("/retornos-banco/", { params }).then((r) => r.data);

export const registrarRetornoBanco = (data: unknown) =>
  api.post("/retornos-banco/", data).then((r) => r.data);

export const processarRetornoBanco = (id: string) =>
  api.post(`/retornos-banco/${id}/processar`).then((r) => r.data);

// ── Pendências ────────────────────────────────────────────────────────────────

export const getPendencias = (params?: { tipo?: string; resolvida?: boolean; proposta_id?: string }) =>
  api.get("/pendencias/", { params }).then((r) => r.data);

export const getResumoPendencias = () =>
  api.get("/pendencias/summary").then((r) => r.data);

export const criarPendencia = (data: unknown) =>
  api.post("/pendencias/", data).then((r) => r.data);

export const atualizarPendencia = (id: string, data: unknown) =>
  api.patch(`/pendencias/${id}`, data).then((r) => r.data);

export const resolverPendencia = (id: string, resolucao?: string) =>
  api.post(`/pendencias/${id}/resolver`, null, { params: resolucao ? { resolucao } : {} }).then((r) => r.data);

// ── Logs ──────────────────────────────────────────────────────────────────────

export const getLogsAcesso = (params?: { metodo?: string; endpoint?: string; status_code?: number }) =>
  api.get("/logs/acesso", { params }).then((r) => r.data);

export const getResumoLogs = () =>
  api.get("/logs/acesso/resumo").then((r) => r.data);

export const getLogsAuditoria = (params?: Record<string, unknown>) =>
  api.get("/logs/auditoria", { params }).then((r) => r.data);

export const getResumoAuditoria = () =>
  api.get("/logs/auditoria/resumo").then((r) => r.data);

export const getLogsSuspeitos = () =>
  api.get("/logs/suspeitos").then((r) => r.data);

export const exportarLogsExcel = async (params?: Record<string, unknown>) => {
  const response = await api.get("/logs/auditoria/exportar", {
    params,
    responseType: "blob",
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  const cd = response.headers["content-disposition"] ?? "";
  const match = cd.match(/filename="?([^"]+)"?/);
  link.download = match ? match[1] : "auditoria.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// ── Convênios ─────────────────────────────────────────────────────────────────

export const getConvenios = (params?: { ativo?: boolean; auto_registrado?: boolean }) =>
  api.get("/convenios/", { params }).then((r) => r.data);

export const criarConvenio = (data: unknown) =>
  api.post("/convenios/", data).then((r) => r.data);

export const atualizarConvenio = (id: string, data: unknown) =>
  api.patch(`/convenios/${id}`, data).then((r) => r.data);

// ── Relatórios ────────────────────────────────────────────────────────────────

export const getKPIs = () =>
  api.get("/relatorios/kpis").then((r) => r.data);

export const getRelatorioPropostas = (params?: unknown) =>
  api.get("/relatorios/propostas", { params }).then((r) => r.data);

export const getRelatorioAntifraude = (params?: unknown) =>
  api.get("/relatorios/antifraude", { params }).then((r) => r.data);

export const getRelatorioCorretores = (params?: unknown) =>
  api.get("/relatorios/corretores", { params }).then((r) => r.data);

export const baixarRelatorioCSV = (tipo: "propostas" | "antifraude" | "corretores" | "auditoria", params?: unknown) =>
  api.get(`/relatorios/${tipo}`, { params: { ...params as object, formato: "csv" }, responseType: "blob" }).then((r) => r.data);

// ── Blacklist ─────────────────────────────────────────────────────────────────

export const getBlacklist = (params?: { pagina?: number; limite?: number; tipo?: string; busca?: string }) =>
  api.get("/blacklist/", { params }).then((r) => r.data);

export const checkBlacklist = (tipo: string, valor: string) =>
  api.post("/blacklist/check", { tipo, valor }).then((r) => r.data);

export const criarEntradaBlacklist = (data: { tipo: string; valor: string; motivo: string; fonte?: string }) =>
  api.post("/blacklist/", data).then((r) => r.data);

export const removerEntradaBlacklist = (id: string) =>
  api.delete(`/blacklist/${id}`).then((r) => r.data);

export const importarBlacklist = (file: File) => {
  const fd = new FormData();
  fd.append("arquivo", file);
  return api.post("/blacklist/import", fd).then((r) => r.data);
};

// ── Busca Global ──────────────────────────────────────────────────────────────

export const buscarContrato = (numero: string) =>
  api.get("/buscar/contrato", { params: { numero } }).then((r) => r.data);

export const buscarPropostasLocal = (q: string, limit = 50) =>
  api.get("/buscar/propostas", { params: { q, limit } }).then((r) => r.data);

export const searchPropostas = (q: string, limit = 50) =>
  api.get("/propostas/search", { params: { q, limit } }).then((r) => r.data);

export default api;
