import { useEffect } from 'react'
import useStore from './store/useStore'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'

export default function App() {
  const tema = useStore((s) => s.tema)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema)
  }, [tema])

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main className="p-6">
        <Dashboard />
      </main>
    </div>
  )
}
