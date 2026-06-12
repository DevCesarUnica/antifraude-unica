import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('[API Error]', error?.response?.status, error?.message)
    return Promise.reject(error)
  }
)

export const getPropostas = (status) => {
  const params = status ? { status } : {}
  return api.get('/propostas', { params })
}

export const importarProposta = (data) => {
  return api.post('/propostas/importar', data)
}

export const atualizarStatus = (id, status, observacao) => {
  const payload = { status }
  if (observacao) payload.observacao = observacao
  return api.put(`/propostas/${id}/status`, payload)
}

export const getSummary = () => {
  return api.get('/propostas/summary')
}

export const getCorretores = () => {
  return api.get('/corretores')
}

export const getGrupos = () => {
  return api.get('/grupos')
}

export const getConvenios = () => {
  return api.get('/convenios')
}

export const getBlacklist = () => {
  return api.get('/blacklist')
}

export default api
