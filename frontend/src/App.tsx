import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import PropostasPage from "./pages/PropostasPage";
import RegrasPage from "./pages/RegrasPage";
import BancosPage from "./pages/BancosPage";
import UsuariosPage from "./pages/UsuariosPage";

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
    </Routes>
  );
}
