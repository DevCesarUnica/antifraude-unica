import { useEffect } from 'react'
import useStore from './store/useStore'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import LoginPage from './pages/LoginPage'
import UsersPage from './pages/UsersPage'

export default function App() {
  const { tema, isAuthenticated, currentPage, user, refreshCurrentUser } = useStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema)
  }, [tema])

  useEffect(() => {
    if (isAuthenticated && !user?.role) {
      refreshCurrentUser()
    }
  }, [isAuthenticated])

  if (!isAuthenticated) {
    return <LoginPage />
  }

  function renderPage() {
    if (currentPage === 'users') {
      const bloqueado = user?.role === 'ANALISTA' || user?.role === 'OPERADOR'
      if (bloqueado) return <Dashboard />
      return <UsersPage />
    }
    return <Dashboard />
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main className="p-6">
        {renderPage()}
      </main>
    </div>
  )
}
