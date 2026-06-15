import { useEffect } from 'react'
import useStore from './store/useStore'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import LoginPage from './pages/LoginPage'

export default function App() {
  const { tema, isAuthenticated } = useStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema)
  }, [tema])

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main className="p-6">
        <Dashboard />
      </main>
    </div>
  )
}
