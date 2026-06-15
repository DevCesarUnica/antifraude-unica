import { useEffect, useRef, useState } from 'react'
import logo from '../logo.png'
import useStore from '../store/useStore'

export default function Header() {
  const { tema, toggleTema, user, logout, navigateTo, currentPage } = useStore()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const canSeeUsers = user?.role === 'ADMIN' || user?.role === 'GESTOR'

  return (
    <header
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderBottom: '1px solid #DC2626',
        height: '64px',
        paddingLeft: '24px',
        paddingRight: '24px',
      }}
      className="flex items-center justify-between w-full sticky top-0 z-50"
    >
      {/* Lado esquerdo: Logo + Nome */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigateTo('dashboard')}
          className="flex items-center gap-3 focus:outline-none"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <img src={logo} alt="Unica Promotora" style={{ height: '40px', width: 'auto' }} className="flex-shrink-0" />
          <div className="flex flex-col leading-tight text-left">
            <span className="font-bold text-sm tracking-widest uppercase" style={{ color: 'var(--text-primary)' }}>
              UNICA ANTIFRAUDE
            </span>
            <span className="text-xs" style={{ color: '#6B7280' }}>
              Mesa de Crédito
            </span>
          </div>
        </button>

        {/* Breadcrumb de página */}
        {currentPage === 'users' && (
          <div className="flex items-center gap-2 ml-2">
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#DC2626' }}>
              Usuários
            </span>
          </div>
        )}
      </div>

      {/* Lado direito */}
      <div className="flex items-center gap-3">
        {/* Botão tema */}
        <button
          onClick={toggleTema}
          title={tema === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
          className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg transition-all duration-150 focus:outline-none"
          style={{ backgroundColor: 'var(--bg-mid)', color: 'var(--text-primary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#DC2626')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-mid)')}
        >
          {tema === 'dark' ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-6.07-.71.71M6.34 17.66l-.71.71m12.73 0-.71-.71M6.34 6.34l-.71-.71M12 7a5 5 0 100 10A5 5 0 0012 7z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
            </svg>
          )}
          <span className="hidden sm:inline">{tema === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
        </button>

        {/* Divider */}
        <div style={{ width: '1px', height: '28px', backgroundColor: 'var(--border)' }} />

        {/* Dropdown do usuário */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-150 focus:outline-none"
            style={{ backgroundColor: dropdownOpen ? 'var(--bg-mid)' : 'transparent' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-mid)')}
            onMouseLeave={(e) => { if (!dropdownOpen) e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            {/* Avatar */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
              style={{ backgroundColor: '#DC2626' }}
            >
              {user?.nome?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                {user?.nome ?? 'Usuário'}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#DC2626' }}>
                {user?.cargo ?? '—'}
              </span>
            </div>
            {/* Chevron */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3 h-3 transition-transform"
              style={{ color: 'var(--text-muted)', transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Menu dropdown */}
          {dropdownOpen && (
            <div
              className="absolute right-0 mt-2 w-52 rounded-xl overflow-hidden shadow-2xl"
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-mid)',
                top: '100%',
                zIndex: 100,
              }}
            >
              {/* Header do dropdown */}
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{user?.nome}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>@{user?.username}</p>
              </div>

              <div className="py-1">
                {/* Dashboard */}
                <button
                  onClick={() => { navigateTo('dashboard'); setDropdownOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium transition-colors"
                  style={{ color: currentPage === 'dashboard' ? '#DC2626' : 'var(--text-primary)', backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-mid)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  Dashboard
                </button>

                {/* Gestão de Usuários (ADMIN/GESTOR) */}
                {canSeeUsers && (
                  <button
                    onClick={() => { navigateTo('users'); setDropdownOpen(false) }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium transition-colors"
                    style={{ color: currentPage === 'users' ? '#DC2626' : 'var(--text-primary)', backgroundColor: 'transparent' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-mid)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Gestão de Usuários
                  </button>
                )}

                {/* Divider */}
                <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }} />

                {/* Sair */}
                <button
                  onClick={() => { logout(); setDropdownOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold transition-colors"
                  style={{ color: '#DC2626', backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(220,38,38,0.1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sair
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
