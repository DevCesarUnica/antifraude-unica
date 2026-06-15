import { useEffect, useState } from 'react'
import useStore from '../store/useStore'

const ROLES = [
  { value: 'ADMIN',    label: 'Administrador' },
  { value: 'GESTOR',   label: 'Gestor' },
  { value: 'ANALISTA', label: 'Analista' },
  { value: 'OPERADOR', label: 'Operador' },
]

const ROLE_COLORS = {
  ADMIN:    { bg: 'rgba(220,38,38,0.15)',   color: '#FCA5A5' },
  GESTOR:   { bg: 'rgba(37,99,235,0.15)',   color: '#93C5FD' },
  ANALISTA: { bg: 'rgba(79,70,229,0.15)',   color: '#C4B5FD' },
  OPERADOR: { bg: 'rgba(107,114,128,0.15)', color: '#D1D5DB' },
}

const EMPTY_FORM = { username: '', email: '', password: '', nome: '', role: 'OPERADOR' }

export default function UsersPage() {
  const { users, fetchUsers, createUser, updateUser, toggleUser, user: currentUser } = useStore()
  const [modal, setModal]   = useState({ open: false, editing: null })
  const [form, setForm]     = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const isAdmin = !['GESTOR', 'ANALISTA', 'OPERADOR'].includes(currentUser?.role)

  useEffect(() => { fetchUsers() }, [])

  function openCreate() {
    setForm(EMPTY_FORM)
    setError('')
    setModal({ open: true, editing: null })
  }

  function openEdit(u) {
    setForm({ username: u.username, email: u.email ?? '', password: '', nome: u.nome, role: u.role })
    setError('')
    setModal({ open: true, editing: u })
  }

  function closeModal() {
    setModal({ open: false, editing: null })
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nome.trim() || !form.username.trim()) { setError('Nome e usuário são obrigatórios.'); return }
    if (!modal.editing && !form.password.trim()) { setError('Informe uma senha.'); return }
    setSaving(true)
    setError('')
    try {
      const payload = { ...form }
      if (!payload.email) delete payload.email
      if (!payload.password) delete payload.password
      if (modal.editing) {
        await updateUser(modal.editing.id, payload)
      } else {
        await createUser(payload)
      }
      closeModal()
    } catch (err) {
      setError(err?.response?.data?.detail ?? 'Erro ao salvar usuário.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(u) {
    try { await toggleUser(u.id) } catch (err) {
      alert(err?.response?.data?.detail ?? 'Erro ao alterar status.')
    }
  }

  const inputStyle = {
    backgroundColor: 'var(--bg-mid)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '13px',
    width: '100%',
    outline: 'none',
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho da página */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black uppercase tracking-wide" style={{ color: 'var(--text-primary)' }}>
            Gestão de Usuários
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white transition-all active:scale-95"
            style={{ backgroundColor: '#DC2626', boxShadow: '0 4px 14px rgba(220,38,38,0.3)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#B91C1C')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#DC2626')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Novo Usuário
          </button>
        )}
      </div>

      {/* Tabela */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-mid)' }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-mid)' }}>
              {['Nome', 'Usuário', 'Email', 'Perfil', 'Status', isAdmin ? 'Ações' : ''].filter(Boolean).map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr
                key={u.id}
                style={{
                  borderBottom: i < users.length - 1 ? '1px solid var(--border)' : 'none',
                  opacity: u.ativo ? 1 : 0.5,
                }}
              >
                {/* Nome + avatar */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                      style={{ backgroundColor: u.ativo ? '#DC2626' : '#6B7280' }}
                    >
                      {u.nome?.[0]?.toUpperCase()}
                    </div>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{u.nome}</span>
                  </div>
                </td>

                {/* Username */}
                <td className="px-4 py-3">
                  <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>@{u.username}</span>
                </td>

                {/* Email */}
                <td className="px-4 py-3">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{u.email ?? '—'}</span>
                </td>

                {/* Role badge */}
                <td className="px-4 py-3">
                  <span
                    className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide"
                    style={ROLE_COLORS[u.role] ?? ROLE_COLORS.OPERADOR}
                  >
                    {u.role}
                  </span>
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <span
                    className="px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={
                      u.ativo
                        ? { backgroundColor: 'rgba(22,163,74,0.15)', color: '#86EFAC' }
                        : { backgroundColor: 'rgba(107,114,128,0.15)', color: '#9CA3AF' }
                    }
                  >
                    {u.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>

                {/* Ações (só ADMIN) */}
                {isAdmin && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {/* Editar */}
                      <button
                        onClick={() => openEdit(u)}
                        title="Editar"
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'var(--text-muted)', backgroundColor: 'transparent' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-mid)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>

                      {/* Ativar/Desativar (não pode desativar a si mesmo) */}
                      {u.id !== currentUser?.id && (
                        <button
                          onClick={() => handleToggle(u)}
                          title={u.ativo ? 'Desativar' : 'Ativar'}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: u.ativo ? '#FCA5A5' : '#86EFAC', backgroundColor: 'transparent' }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-mid)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          {u.ativo ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="py-16 text-center" style={{ color: 'var(--text-muted)' }}>
            <p className="text-sm">Nenhum usuário encontrado.</p>
          </div>
        )}
      </div>

      {/* Modal criar/editar */}
      {modal.open && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 px-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div
            className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-mid)' }}
          >
            {/* Faixa topo */}
            <div style={{ height: '4px', backgroundColor: '#DC2626' }} />

            <div className="px-6 pt-6 pb-7">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-base font-black uppercase tracking-wide" style={{ color: 'var(--text-primary)' }}>
                  {modal.editing ? 'Editar Usuário' : 'Novo Usuário'}
                </h2>
                <button
                  onClick={closeModal}
                  className="p-1 rounded-lg transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* Nome */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Nome completo *</label>
                  <input
                    type="text"
                    value={form.nome}
                    onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                    placeholder="Ex: João Silva"
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = '#DC2626')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                  />
                </div>

                {/* Username */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Usuário (login) *</label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="Ex: joao.silva"
                    disabled={!!modal.editing}
                    style={{ ...inputStyle, opacity: modal.editing ? 0.6 : 1 }}
                    onFocus={(e) => (e.target.style.borderColor = '#DC2626')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                  />
                </div>

                {/* Email */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Ex: joao@unicapromotora.com.br"
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = '#DC2626')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                  />
                </div>

                {/* Senha */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    {modal.editing ? 'Nova senha (deixe em branco para manter)' : 'Senha *'}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="••••••••"
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = '#DC2626')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                  />
                </div>

                {/* Perfil */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Perfil *</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                    onFocus={(e) => (e.target.style.borderColor = '#DC2626')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label} ({r.value})</option>
                    ))}
                  </select>
                </div>

                {/* Erro */}
                {error && (
                  <div
                    className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs"
                    style={{ backgroundColor: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', color: '#FCA5A5' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                  </div>
                )}

                {/* Ações */}
                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
                    style={{ backgroundColor: 'var(--bg-mid)', color: 'var(--text-primary)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-all active:scale-95"
                    style={{ backgroundColor: saving ? '#991B1B' : '#DC2626', opacity: saving ? 0.8 : 1 }}
                    onMouseEnter={(e) => { if (!saving) e.currentTarget.style.backgroundColor = '#B91C1C' }}
                    onMouseLeave={(e) => { if (!saving) e.currentTarget.style.backgroundColor = '#DC2626' }}
                  >
                    {saving ? 'Salvando...' : modal.editing ? 'Salvar' : 'Criar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
