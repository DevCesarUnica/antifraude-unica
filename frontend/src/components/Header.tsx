import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logo from "../logo.png";
import BuscarContratoModal from "./BuscarContratoModal";

// ── Estrutura de navegação agrupada ──────────────────────────────────────────

interface NavItem { to: string; label: string; desc: string; }
interface NavGroup { label: string; items: NavItem[]; }

const NAV_GRUPOS: NavGroup[] = [
  {
    label: "Operacional",
    items: [
      { to: "/propostas",   label: "Propostas",   desc: "Análise e gestão de propostas de crédito" },
      { to: "/pendencias",  label: "Pendências",  desc: "Painel de pendências e alertas operacionais" },
      { to: "/retornos-banco", label: "Retornos de Banco", desc: "Respostas dos bancos sobre propostas" },
      { to: "/bancos",      label: "Bancos",       desc: "Integrações e retornos bancários" },
    ],
  },
  {
    label: "Corretores",
    items: [
      { to: "/corretores",  label: "Corretores",  desc: "Cadastro e gestão de corretores" },
      { to: "/grupos",      label: "Grupos",       desc: "Grupos de corretores e limites" },
      { to: "/esteiras",    label: "Esteiras Comerciais", desc: "Faixas de limite importadas do WebDeck" },
      { to: "/importacoes", label: "Importações", desc: "Importação CSV e mapeamento de layout" },
    ],
  },
  {
    label: "Análise",
    items: [
      { to: "/storm",       label: "Storm",        desc: "Mesa de crédito — antifraude e contratos" },
      { to: "/blacklist",   label: "Blacklist",    desc: "CPF, CNPJ, telefone e e-mail bloqueados" },
      { to: "/regras",      label: "Regras",       desc: "Motor antifraude — configuração de regras" },
      { to: "/relatorios",  label: "Relatórios",   desc: "KPIs, exportações CSV e análises" },
    ],
  },
];

const NAV_ADMIN: NavGroup = {
  label: "Admin",
  items: [
    { to: "/usuarios", label: "Usuários", desc: "Gestão de usuários e perfis de acesso" },
    { to: "/logs",     label: "Logs",     desc: "Auditoria e logs de acesso ao sistema" },
  ],
};

// ── Ícones SVG inline ────────────────────────────────────────────────────────

function IcoBriefcase() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
    </svg>
  );
}

function IcoUsers() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87M12 12a4 4 0 100-8 4 4 0 000 8zm6 0a3 3 0 100-6 3 3 0 000 6zM6 12a3 3 0 100-6 3 3 0 000 6z" />
    </svg>
  );
}

function IcoChart() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function IcoShield() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function IcoChevron({ open }: { open: boolean }) {
  return (
    <svg
      className="w-3 h-3 transition-transform duration-200"
      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

const GROUP_ICONS: Record<string, React.ReactNode> = {
  Operacional: <IcoBriefcase />,
  Corretores:  <IcoUsers />,
  Análise:     <IcoChart />,
  Admin:       <IcoShield />,
};

// ── Componente de dropdown de grupo ─────────────────────────────────────────

function NavDropdown({ grupo, location }: { grupo: NavGroup; location: { pathname: string } }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = grupo.items.some((i) => location.pathname.startsWith(i.to));

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all duration-150 select-none"
        style={{
          color: isActive ? "#DC2626" : "var(--text-muted)",
          backgroundColor: isActive ? "rgba(220,38,38,0.08)" : "transparent",
          borderBottom: `2px solid ${isActive ? "#DC2626" : "transparent"}`,
        }}
        onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
        onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
      >
        <span className="opacity-70">{GROUP_ICONS[grupo.label]}</span>
        {grupo.label}
        <IcoChevron open={open} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 w-64 rounded-xl overflow-hidden shadow-2xl z-50"
          style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-mid)" }}
        >
          <div className="px-3 pt-2.5 pb-1">
            <p className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: "#DC2626" }}>
              {grupo.label}
            </p>
          </div>
          <div className="pb-2">
            {grupo.items.map(({ to, label, desc }) => {
              const active = location.pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 px-3 py-2.5 mx-1 rounded-lg transition-all duration-100"
                  style={{
                    backgroundColor: active ? "rgba(220,38,38,0.1)" : "transparent",
                    borderLeft: active ? "2px solid #DC2626" : "2px solid transparent",
                  }}
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-mid)"; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold" style={{ color: active ? "#DC2626" : "var(--text-primary)" }}>
                      {label}
                    </p>
                    <p className="text-xs mt-0.5 leading-tight" style={{ color: "var(--text-muted)" }}>
                      {desc}
                    </p>
                  </div>
                  {active && (
                    <div className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#DC2626" }} />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Header principal ──────────────────────────────────────────────────────────

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [buscaAberta, setBuscaAberta]   = useState(false);
  const [tema, setTema] = useState<"dark" | "light">(() =>
    (localStorage.getItem("tema") as "dark" | "light") ?? "dark"
  );
  const userMenuRef = useRef<HTMLDivElement>(null);

  const usuario = (() => {
    try { return JSON.parse(localStorage.getItem("usuario") || "null"); } catch { return null; }
  })();

  const podeVerAdmin = usuario?.perfil === "admin" || usuario?.perfil === "gestor";
  const grupos = podeVerAdmin ? [...NAV_GRUPOS, NAV_ADMIN] : NAV_GRUPOS;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
    localStorage.setItem("tema", tema);
  }, [tema]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  // Fecha menu mobile ao navegar
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  // Ctrl+K abre busca global
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setBuscaAberta(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const sair = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    navigate("/login");
  };

  const isDashboard = location.pathname === "/dashboard";

  return (
    <>
      <header
        className="sticky top-0 z-40 w-full"
        style={{
          backgroundColor: "var(--bg-primary)",
          borderBottom: "1px solid rgba(220,38,38,0.35)",
          boxShadow: "0 1px 24px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex items-center justify-between px-3 sm:px-6 h-14 sm:h-16 max-w-screen-2xl mx-auto">

          {/* Marca */}
          <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
            <Link to="/dashboard" className="flex items-center gap-2.5">
              <img src={logo} alt="Unica Promotora" className="h-8 sm:h-9 w-auto" />
              <div className="hidden sm:flex flex-col leading-none">
                <span className="text-xs font-bold tracking-wide" style={{ color: "var(--text-primary)" }}>
                  Unica Promotora
                </span>
                <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Promotora de Crédito
                </span>
              </div>
            </Link>
            <div className="hidden sm:block w-px h-8 mx-1" style={{ backgroundColor: "var(--border)" }} />
            <Link to="/dashboard" className="flex flex-col leading-none">
              <span className="text-xs font-black tracking-widest uppercase" style={{ color: "#DC2626" }}>
                Antifraude
              </span>
              <span className="hidden sm:block text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
                Mesa de Crédito
              </span>
            </Link>
          </div>

          {/* Nav desktop — dropdowns agrupados */}
          <nav className="hidden lg:flex items-center gap-0.5 mx-4 flex-1 justify-center">
            {/* Dashboard como link direto */}
            <Link
              to="/dashboard"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all duration-150"
              style={{
                color: isDashboard ? "#DC2626" : "var(--text-muted)",
                backgroundColor: isDashboard ? "rgba(220,38,38,0.08)" : "transparent",
                borderBottom: `2px solid ${isDashboard ? "#DC2626" : "transparent"}`,
              }}
              onMouseEnter={(e) => { if (!isDashboard) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { if (!isDashboard) (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
            >
              <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Dashboard
            </Link>

            {grupos.map((g) => (
              <NavDropdown key={g.label} grupo={g} location={location} />
            ))}
          </nav>

          {/* Ações direita */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Busca global */}
            <button
              onClick={() => setBuscaAberta(true)}
              title="Buscar contrato (Ctrl+K)"
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all duration-150"
              style={{
                backgroundColor: "var(--bg-mid)",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                minWidth: 160,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#8B5CF6"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
              </svg>
              <span className="flex-1 text-left">Buscar contrato...</span>
              <kbd className="hidden lg:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--bg-card)" }}>
                Ctrl+K
              </kbd>
            </button>

            {/* Botão compacto mobile */}
            <button
              onClick={() => setBuscaAberta(true)}
              title="Buscar contrato"
              className="sm:hidden flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150"
              style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-muted)" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
              </svg>
            </button>

            {/* Tema */}
            <button
              onClick={() => setTema((t) => (t === "dark" ? "light" : "dark"))}
              title={tema === "dark" ? "Modo Claro" : "Modo Escuro"}
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150"
              style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-muted)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
            >
              {tema === "dark" ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-6.07-.71.71M6.34 17.66l-.71.71m12.73 0-.71-.71M6.34 6.34l-.71-.71M12 7a5 5 0 100 10A5 5 0 0012 7z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
                </svg>
              )}
            </button>

            <div className="w-px h-6" style={{ backgroundColor: "var(--border)" }} />

            {/* Menu usuário */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-150"
                style={{ backgroundColor: userMenuOpen ? "var(--bg-mid)" : "transparent" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-mid)"; }}
                onMouseLeave={(e) => { if (!userMenuOpen) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                  style={{ backgroundColor: "#DC2626" }}
                >
                  {usuario?.nome?.[0]?.toUpperCase() ?? "U"}
                </div>
                <div className="hidden sm:flex flex-col items-start leading-none gap-0.5">
                  <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                    {usuario?.nome?.split(" ")[0] ?? "Usuário"}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#DC2626" }}>
                    {usuario?.perfil ?? "—"}
                  </span>
                </div>
                <svg
                  className="w-3 h-3 hidden sm:block"
                  style={{ color: "var(--text-muted)", transform: userMenuOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {userMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-60 rounded-xl overflow-hidden shadow-2xl z-50"
                  style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-mid)" }}
                >
                  {/* Info usuário */}
                  <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0" style={{ backgroundColor: "#DC2626" }}>
                      {usuario?.nome?.[0]?.toUpperCase() ?? "U"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate" style={{ color: "var(--text-primary)" }}>{usuario?.nome}</p>
                      <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>{usuario?.email}</p>
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded mt-0.5 inline-block" style={{ backgroundColor: "rgba(220,38,38,0.12)", color: "#DC2626" }}>
                        {usuario?.perfil}
                      </span>
                    </div>
                  </div>

                  {/* Links mobile (lg:hidden) */}
                  <div className="lg:hidden py-1" style={{ borderBottom: "1px solid var(--border)" }}>
                    <Link
                      to="/dashboard"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center px-4 py-2 text-xs font-medium transition-colors"
                      style={{ color: "var(--text-primary)" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-mid)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")}
                    >
                      Dashboard
                    </Link>
                    {grupos.flatMap((g) => g.items).map(({ to, label }) => (
                      <Link
                        key={to}
                        to={to}
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center px-4 py-2 text-xs font-medium transition-colors"
                        style={{ color: location.pathname.startsWith(to) ? "#DC2626" : "var(--text-primary)" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-mid)")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")}
                      >
                        {label}
                      </Link>
                    ))}
                  </div>

                  {/* Sair */}
                  <div className="py-1">
                    <button
                      onClick={() => { sair(); setUserMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold transition-colors"
                      style={{ color: "#DC2626" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "rgba(220,38,38,0.08)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sair do sistema
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {buscaAberta && <BuscarContratoModal onClose={() => setBuscaAberta(false)} />}
    </>
  );
}
