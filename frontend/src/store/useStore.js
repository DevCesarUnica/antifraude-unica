import { create } from 'zustand'
import {
  getPropostas,
  getSummary,
  atualizarStatus as apiAtualizarStatus
} from '../services/api'

const useStore = create((set, get) => ({
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
        loading: false
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
  }
}))

export default useStore
