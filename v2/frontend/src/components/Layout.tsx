"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FileText, Shield, LogOut, AlertTriangle } from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/propostas", label: "Propostas", icon: FileText },
  { href: "/regras", label: "Regras", icon: Shield },
  { href: "/blacklist", label: "Blacklist", icon: AlertTriangle },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const sair = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    router.push("/login");
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-56 bg-primary-900 text-white flex flex-col">
        <div className="px-5 py-5 border-b border-primary-700">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-300">Antifraude</p>
          <p className="text-sm font-bold mt-0.5">Unica Promotora</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  active
                    ? "bg-primary-600 text-white"
                    : "text-primary-200 hover:bg-primary-800 hover:text-white"
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={sair}
          className="flex items-center gap-3 px-6 py-4 text-sm text-primary-300 hover:text-white border-t border-primary-700 transition"
        >
          <LogOut size={16} />
          Sair
        </button>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
