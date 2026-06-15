import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
});

api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
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

// ── Auth ─────────────────────────────────────────────────────────────────────

export const login = (email: string, senha: string) =>
  api.post("/auth/login", { email, senha }).then((r) => r.data);

export const getMe = () =>
  api.get("/auth/me").then((r) => r.data);

export default api;
