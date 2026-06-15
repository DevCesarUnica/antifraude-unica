import axios from 'axios'

const TOKEN_KEY = 'antifraude_token'

const api = axios.create({
  baseURL: 'http://localhost:8000',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

// Injeta token em todas as requisições
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Trata 401 globalmente — força logout sem importar o store (evita ciclo)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem('antifraude_user')
      window.location.reload()
    }
    console.error('[API Error]', error?.response?.status, error?.message)
    return Promise.reject(error)
  }
)

// ── Auth ─────────────────────────────────────────────────────────────────────
export const loginApi  = (username, password) => api.post('/auth/login', { username, password })
export const logoutApi = ()                   => api.post('/auth/logout')
export const meApi     = ()                   => api.get('/auth/me')

// ── Propostas ─────────────────────────────────────────────────────────────────
export const getPropostas     = (status)          => api.get('/propostas', { params: status ? { status } : {} })
export const importarProposta = (data)            => api.post('/propostas/importar', data)
export const atualizarStatus  = (id, status, obs) => api.put(`/propostas/${id}/status`, { status, ...(obs && { observacao: obs }) })
export const getSummary       = ()                => api.get('/propostas/summary')

// ── Outros ────────────────────────────────────────────────────────────────────
export const getCorretores = () => api.get('/corretores')
export const getGrupos     = () => api.get('/grupos')
export const getConvenios  = () => api.get('/convenios')
export const getBlacklist  = () => api.get('/blacklist')

// ── Usuários ──────────────────────────────────────────────────────────────────
export const getUsers      = ()         => api.get('/users')
export const createUserApi = (data)     => api.post('/users', data)
export const updateUserApi = (id, data) => api.put(`/users/${id}`, data)
export const toggleUserApi = (id)       => api.patch(`/users/${id}/status`)

export default api
