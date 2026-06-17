import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logo from "../logo.png";

const NAV_BASE = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/propostas", label: "Propostas" },
  { to: "/regras",    label: "Regras" },
  { to: "/bancos",    label: "Bancos" },
];
const NAV_ADMIN = { to: "/usuarios", label: "Usuários" };

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [tema, setTema] = useState<"dark" | "light">(() =>
    (localStorage.getItem("tema") as "dark" | "light") ?? "dark"
  );
  const dropdownRef = useRef<HTMLDivElement>(null);

  const usuario = (() => {
    try { return JSON.parse(localStorage.getItem("usuario") || "null"); } catch { return null; }
  })();

  const podeVerUsuarios = usuario?.perfil === "admin" || usuario?.perfil === "gestor";
  const NAV = podeVerUsuarios ? [...NAV_BASE, NAV_ADMIN] : NAV_BASE;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
    localStorage.setItem("tema", tema);
  }, [tema]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const sair = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    navigate("/login");
  };

  return (
    <header
      style={{
        backgroundColor: "var(--bg-primary)",
        borderBottom: "1px solid #DC2626",
        minHeight: "56px",
      }}
      className="sticky top-0 z-50 flex items-center justify-between w-full px-3 sm:px-6 py-2 sm:h-16"
    >
      <div className="flex items-center gap-4">
        <Link to="/dashboard" className="flex items-center gap-3">
          <img src={logo} alt="Unica Promotora" style={{ height: "36px", width: "auto" }} />
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="font-bold text-sm tracking-wide" style={{ color: "var(--text-primary)" }}>
              Unica Promotora
            </span>
            <span className="text-xs font-medium" style={{ color: "#6B7280" }}>
              Promotora de Crédito
            </span>
          </div>
          <div className="hidden sm:block" style={{ width: "1px", height: "32px", backgroundColor: "var(--border)", margin: "0 4px" }} />
          <div className="flex flex-col leading-tight">
            <span className="font-black text-sm tracking-widest uppercase" style={{ color: "#DC2626" }}>
              Antifraude
            </span>
            <span className="hidden sm:block text-xs font-medium" style={{ color: "#6B7280" }}>
              Mesa de Crédito
            </span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1 ml-2">
          {NAV.map(({ to, label }) => {
            const active = location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all duration-150"
                style={{
                  color: active ? "#DC2626" : "var(--text-muted)",
                  backgroundColor: active ? "rgba(220,38,38,0.1)" : "transparent",
                  borderBottom: active ? "2px solid #DC2626" : "2px solid transparent",
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setTema((t) => (t === "dark" ? "light" : "dark"))}
          title={tema === "dark" ? "Modo Claro" : "Modo Escuro"}
          className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg transition-all duration-150"
          style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "#DC2626")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-mid)")}
        >
          {tema === "dark" ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-6.07-.71.71M6.34 17.66l-.71.71m12.73 0-.71-.71M6.34 6.34l-.71-.71M12 7a5 5 0 100 10A5 5 0 0012 7z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
            </svg>
          )}
          <span className="hidden md:inline">{tema === "dark" ? "Modo Claro" : "Modo Escuro"}</span>
        </button>

        <div style={{ width: "1px", height: "28px", backgroundColor: "var(--border)" }} />

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-150"
            style={{ backgroundColor: dropdownOpen ? "var(--bg-mid)" : "transparent" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-mid)")}
            onMouseLeave={(e) => { if (!dropdownOpen) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
              style={{ backgroundColor: "#DC2626" }}
            >
              {usuario?.nome?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                {usuario?.nome ?? "Usuário"}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#DC2626" }}>
                {usuario?.cargo ?? "—"}
              </span>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 transition-transform" style={{ color: "var(--text-muted)", transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div
              className="absolute right-0 mt-2 w-52 rounded-xl overflow-hidden shadow-2xl"
              style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-mid)", top: "100%", zIndex: 100 }}
            >
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{usuario?.nome}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{usuario?.email ?? ""}</p>
              </div>
              <div className="py-1">
                {NAV.map(({ to, label }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setDropdownOpen(false)}
                    className="md:hidden w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium transition-colors"
                    style={{ color: location.pathname.startsWith(to) ? "#DC2626" : "var(--text-primary)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-mid)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")}
                  >
                    {label}
                  </Link>
                ))}
                <div className="md:hidden" style={{ height: "1px", backgroundColor: "var(--border)", margin: "4px 0" }} />
                <button
                  onClick={() => { sair(); setDropdownOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold transition-colors"
                  style={{ color: "#DC2626", backgroundColor: "transparent" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "rgba(220,38,38,0.1)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")}
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
  );
}
