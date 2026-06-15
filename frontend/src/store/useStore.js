import { create } from 'zustand'
import {
  getPropostas,
  getSummary,
  atualizarStatus as apiAtualizarStatus,
  loginApi,
  logoutApi,
} from '../services/api'

const TOKEN_KEY = 'antifraude_token'
const USER_KEY  = 'antifraude_user'

function loadAuth() {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const user  = JSON.parse(localStorage.getItem(USER_KEY) || 'null')
    return { token, user, isAuthenticated: !!token }
  } catch {
    return { token: null, user: null, isAuthenticated: false }
  }
}

const useStore = create((set, get) => ({
  // ── Auth ──────────────────────────────────────────────────────────────────
  ...loadAuth(),

  login: async (username, password) => {
    const response = await loginApi(username, password)
    const { access_token, username: uname, nome, cargo } = response.data
    const user = { username: uname, nome, cargo }
    localStorage.setItem(TOKEN_KEY, access_token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    set({ token: access_token, user, isAuthenticated: true })
  },

  logout: async () => {
    try { await logoutApi() } catch {}
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    set({ token: null, user: null, isAuthenticated: false, propostas: [], summary: [] })
  },

  // ── Propostas ─────────────────────────────────────────────────────────────
  propostas: [],
  summary: [],
  filtroStatus: null,
  loading: false,
  error: null,
  tema: 'dark',

  toggleTema: () => set((s) => ({ tema: s.tema === 'dark' ? 'light' : 'dark' })),

  fetchPropostas: async (status) => {
    set({ loading: true, error: null })
    try {
      const response = await getPropostas(status)
      const data = response.data
      set({
        propostas: Array.isArray(data) ? data : (data?.items ?? data?.propostas ?? []),
        loading: false,
      })
    } catch (err) {
      console.error('[Store] fetchPropostas error:', err)
      set({ loading: false, error: 'Erro ao carregar propostas' })
    }
  },

  fetchSummary: async () => {
    try {
      const response = await getSummary()
      const data = response.data
      set({ summary: Array.isArray(data) ? data : (data?.summary ?? []) })
    } catch (err) {
      console.error('[Store] fetchSummary error:', err)
    }
  },

  setFiltroStatus: (status) => {
    const current = get().filtroStatus
    const next = current === status ? null : status
    set({ filtroStatus: next })
    get().fetchPropostas(next)
  },

  atualizarStatus: async (id, status, obs) => {
    try {
      await apiAtualizarStatus(id, status, obs)
      const filtro = get().filtroStatus
      await get().fetchPropostas(filtro)
      await get().fetchSummary()
    } catch (err) {
      console.error('[Store] atualizarStatus error:', err)
    }
  },
}))

export default useStore
