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
import ImportacoesPage from "./pages/ImportacoesPage";
import PendenciasPage from "./pages/PendenciasPage";
import LogsPage from "./pages/LogsPage";
import RelatoriosPage from "./pages/RelatoriosPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/propostas" element={<PropostasPage />} />
      <Route path="/regras" element={<RegrasPage />} />
      <Route path="/bancos" element={<BancosPage />} />
      <Route path="/usuarios" element={<UsuariosPage />} />
      <Route path="/storm" element={<StormPage />} />
      <Route path="/corretores" element={<CorretoresPage />} />
      <Route path="/grupos" element={<GruposPage />} />
      <Route path="/importacoes" element={<ImportacoesPage />} />
      <Route path="/pendencias" element={<PendenciasPage />} />
      <Route path="/logs" element={<LogsPage />} />
      <Route path="/relatorios" element={<RelatoriosPage />} />
    </Routes>
  );
}
