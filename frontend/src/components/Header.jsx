import logo from '../logo.png'
import useStore from '../store/useStore'

export default function Header() {
  const { tema, toggleTema } = useStore()
  return (
    <header
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderBottom: '1px solid #DC2626',
        height: '64px',
        paddingLeft: '24px',
        paddingRight: '24px'
      }}
      className="flex items-center justify-between w-full sticky top-0 z-50"
    >
      {/* Lado esquerdo: Logo + Nome */}
      <div className="flex items-center gap-3">
        <img
          src={logo}
          alt="Unica Promotora"
          style={{ height: '40px', width: 'auto' }}
          className="flex-shrink-0"
        />
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-sm tracking-widest uppercase" style={{ color: 'var(--text-primary)' }}>
            UNICA ANTIFRAUDE
          </span>
          <span className="text-xs" style={{ color: '#6B7280' }}>
            Mesa de Crédito
          </span>
        </div>
      </div>

      {/* Lado direito: Badge + Botões */}
      <div className="flex items-center gap-3">
        <span
          style={{ backgroundColor: '#DC2626' }}
          className="text-white text-xs font-semibold px-3 py-1 rounded-full tracking-wide uppercase"
        >
          Administrador
        </span>

        {/* Botão tema */}
        <button
          onClick={toggleTema}
          title={tema === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
          className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-red-600"
          style={{ backgroundColor: 'var(--bg-mid)', color: 'var(--text-primary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#DC2626')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-mid)')}
        >
          {tema === 'dark' ? (
            /* Sol — modo claro */
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-6.07-.71.71M6.34 17.66l-.71.71m12.73 0-.71-.71M6.34 6.34l-.71-.71M12 7a5 5 0 100 10A5 5 0 0012 7z" />
            </svg>
          ) : (
            /* Lua — modo escuro */
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
            </svg>
          )}
          <span className="hidden sm:inline">{tema === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
        </button>

        <button
          style={{ backgroundColor: 'var(--bg-mid)', color: 'var(--text-primary)' }}
          className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-red-600"
          title="Filtros"
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#DC2626')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-mid)')}
        >
          {/* Ícone filtro */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
            />
          </svg>
          <span className="hidden sm:inline">Filtros</span>
        </button>

        <button
          style={{ backgroundColor: 'var(--bg-mid)', color: 'var(--text-primary)' }}
          className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-red-600"
          title="Personalização"
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#DC2626')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-mid)')}
        >
          {/* Ícone personalização */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span className="hidden sm:inline">Personalização</span>
        </button>
      </div>
    </header>
  )
}
