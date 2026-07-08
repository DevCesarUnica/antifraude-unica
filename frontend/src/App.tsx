import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import PropostasPage from "./pages/PropostasPage";
import RegrasPage from "./pages/RegrasPage";
import BancosPage from "./pages/BancosPage";
import UsuariosPage from "./pages/UsuariosPage";
import StormPage from "./pages/StormPage";
import CorretoresPage from "./pages/CorretoresPage";
import GruposPage from "./pages/GruposPage";
import EsteirasPage from "./pages/EsteirasPage";
import ImportacoesPage from "./pages/ImportacoesPage";
import PendenciasPage from "./pages/PendenciasPage";
import LogsPage from "./pages/LogsPage";
import RelatoriosPage from "./pages/RelatoriosPage";
import BlacklistPage from "./pages/BlacklistPage";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("token");
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard"   element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
      <Route path="/propostas"   element={<PrivateRoute><PropostasPage /></PrivateRoute>} />
      <Route path="/regras"      element={<PrivateRoute><RegrasPage /></PrivateRoute>} />
      <Route path="/bancos"      element={<PrivateRoute><BancosPage /></PrivateRoute>} />
      <Route path="/usuarios"    element={<PrivateRoute><UsuariosPage /></PrivateRoute>} />
      <Route path="/storm"       element={<PrivateRoute><StormPage /></PrivateRoute>} />
      <Route path="/corretores"  element={<PrivateRoute><CorretoresPage /></PrivateRoute>} />
      <Route path="/grupos"      element={<PrivateRoute><GruposPage /></PrivateRoute>} />
      <Route path="/esteiras"    element={<PrivateRoute><EsteirasPage /></PrivateRoute>} />
      <Route path="/importacoes" element={<PrivateRoute><ImportacoesPage /></PrivateRoute>} />
      <Route path="/pendencias"  element={<PrivateRoute><PendenciasPage /></PrivateRoute>} />
      <Route path="/logs"        element={<PrivateRoute><LogsPage /></PrivateRoute>} />
      <Route path="/relatorios"  element={<PrivateRoute><RelatoriosPage /></PrivateRoute>} />
      <Route path="/blacklist"   element={<PrivateRoute><BlacklistPage /></PrivateRoute>} />
    </Routes>
  );
}
