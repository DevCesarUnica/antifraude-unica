import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "@/lib/api";
import logo from "../logo.png";

export default function LoginPage() {
  const navigate = useNavigate();
  const [identificador, setIdentificador] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const data = await login(identificador, senha);
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("usuario", JSON.stringify(data.usuario));
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setErro(err?.response?.data?.detail ?? "Credenciais inválidas");
    } finally {
      setCarregando(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.75rem 1rem",
    backgroundColor: "var(--bg-mid)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: "0.625rem",
    fontSize: "0.875rem",
    outline: "none",
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: "var(--bg-primary)" }}>

      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-2">
          <img src={logo} alt="Unica Promotora" style={{ height: "48px", width: "auto" }} />
          <h1 className="text-xl font-black uppercase tracking-widest" style={{ color: "#DC2626" }}>
            Antifraude
          </h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Mesa de Crédito — Unica Promotora</p>
        </div>

        <div className="rounded-2xl p-8" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-base font-bold mb-6" style={{ color: "var(--text-primary)" }}>Entrar no sistema</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "var(--text-muted)" }}>
                E-mail ou usuário
              </label>
              <input
                type="text"
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                autoComplete="username"
                placeholder="admin@unica.com"
                required
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = "#DC2626")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "var(--text-muted)" }}>
                Senha
              </label>
              <div className="relative">
                <input
                  type={mostrarSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  style={{ ...inputStyle, paddingRight: "3rem" }}
                  onFocus={(e) => (e.target.style.borderColor = "#DC2626")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setMostrarSenha((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                  style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  {mostrarSenha ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            {erro && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#f87171", border: "1px solid rgba(220,38,38,0.25)" }}>
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all duration-150 disabled:opacity-60"
              style={{ backgroundColor: "#DC2626", boxShadow: "0 4px 14px rgba(220,38,38,0.35)" }}
              onMouseEnter={(e) => { if (!carregando) (e.currentTarget as HTMLElement).style.opacity = "0.88"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            >
              {carregando ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
