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
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ── Propostas ─────────────────────────────────────────────────────────────────

export const getPropostas = (status?: string) =>
  api.get("/propostas/", { params: status ? { status } : {} }).then((r) => r.data);

export const getPropostaSummary = () =>
  api.get("/propostas/summary").then((r) => r.data);

export const getPropostaById = (id: string) =>
  api.get(`/propostas/${id}`).then((r) => r.data);

export const getAuditoriaProposta = (id: string) =>
  api.get(`/propostas/${id}/auditoria`).then((r) => r.data);

export const criarProposta = (data: unknown) =>
  api.post("/propostas/", data).then((r) => r.data);

export const aprovarProposta = (id: string) =>
  api.post(`/propostas/${id}/aprovar`).then((r) => r.data);

export const bloquearProposta = (id: string) =>
  api.post(`/propostas/${id}/bloquear`).then((r) => r.data);

export const reprocessarProposta = (id: string) =>
  api.post(`/propostas/${id}/reprocessar`).then((r) => r.data);

// ── Regras ────────────────────────────────────────────────────────────────────

export const getRegras = (ativo?: boolean) =>
  api.get("/regras/", { params: ativo !== undefined ? { ativo } : {} }).then((r) => r.data);

export const criarRegra = (data: unknown) =>
  api.post("/regras/", data).then((r) => r.data);

export const atualizarRegra = (id: string, data: unknown) =>
  api.patch(`/regras/${id}`, data).then((r) => r.data);

export const desativarRegra = (id: string) =>
  api.delete(`/regras/${id}`).then((r) => r.data);

// ── Titan ─────────────────────────────────────────────────────────────────────

export const getTitanStatus = () =>
  api.get("/titan/status").then((r) => r.data);

export const getTitanBancos = () =>
  api.get("/titan/bancos").then((r) => r.data);

export const invalidarCacheTitan = () =>
  api.delete("/titan/cache").then((r) => r.data);

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

export default api;
