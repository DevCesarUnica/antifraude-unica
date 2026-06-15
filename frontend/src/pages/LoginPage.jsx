import { useState } from 'react'
import useStore from '../store/useStore'
import logo from '../logo.png'

export default function LoginPage() {
  const { login } = useStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('Preencha usuário e senha.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await login(username.trim(), password)
    } catch (err) {
      const msg = err?.response?.data?.detail ?? 'Falha ao conectar com o servidor.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        backgroundColor: 'var(--bg-primary)',
        backgroundImage:
          'radial-gradient(ellipse at 20% 50%, rgba(220,38,38,0.07) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(220,38,38,0.05) 0%, transparent 50%)',
      }}
    >
      <div className="w-full max-w-sm">

        {/* Card */}
        <div
          className="rounded-2xl overflow-hidden shadow-2xl"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-mid)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(220,38,38,0.1)',
          }}
        >
          {/* Faixa vermelha topo */}
          <div style={{ height: '4px', backgroundColor: '#DC2626' }} />

          {/* Corpo */}
          <div className="px-8 pt-8 pb-10">

            {/* Logo + título */}
            <div className="flex flex-col items-center mb-8">
              <img
                src={logo}
                alt="Unica Promotora"
                style={{ height: '52px', width: 'auto', marginBottom: '20px' }}
              />
              <h1
                className="text-xl font-black tracking-wide uppercase"
                style={{ color: 'var(--text-primary)' }}
              >
                Acesso ao Sistema
              </h1>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Mesa de Crédito Antifraude
              </p>
            </div>

            {/* Formulário */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">

              {/* Usuário */}
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Usuário
                </label>
                <div className="relative">
                  <span
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: '#DC2626' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="seu.usuario"
                    autoComplete="username"
                    autoFocus
                    className="w-full rounded-lg pl-10 pr-4 py-3 text-sm outline-none transition-all duration-150"
                    style={{
                      backgroundColor: 'var(--bg-mid)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#DC2626')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                  />
                </div>
              </div>

              {/* Senha */}
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Senha
                </label>
                <div className="relative">
                  <span
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: '#DC2626' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full rounded-lg pl-10 pr-10 py-3 text-sm outline-none transition-all duration-150"
                    style={{
                      backgroundColor: 'var(--bg-mid)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#DC2626')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-80"
                    style={{ color: 'var(--text-muted)' }}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Mensagem de erro */}
              {error && (
                <div
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm"
                  style={{ backgroundColor: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', color: '#FCA5A5' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              {/* Botão entrar */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg py-3 font-bold text-sm uppercase tracking-widest text-white transition-all duration-150 active:scale-95 mt-2"
                style={{
                  backgroundColor: loading ? '#991B1B' : '#DC2626',
                  opacity: loading ? 0.8 : 1,
                  boxShadow: '0 4px 20px rgba(220,38,38,0.35)',
                }}
                onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#B91C1C' }}
                onMouseLeave={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#DC2626' }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Entrando...
                  </span>
                ) : (
                  'Entrar'
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Rodapé */}
        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
          Unica Promotora &copy; {new Date().getFullYear()} &mdash; Acesso restrito
        </p>
      </div>
    </div>
  )
}
