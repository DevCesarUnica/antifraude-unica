import { useEffect, useState } from "react";
import Header from "../components/Header";
import { getLogsAcesso, getResumoLogs } from "../lib/api";

interface LogAcesso {
  id: string; usuario_id: string | null; username: string | null;
  nome: string | null; perfil: string | null;
  metodo: string; endpoint: string; ip: string | null;
  status_code: number; duracao_ms: number | null; timestamp: string;
}

const PERFIL_COR: Record<string, string> = {
  admin: "#EF4444", gestor: "#F59E0B", analista: "#3B82F6", operador: "#6B7280",
};
interface Resumo { por_status: Record<string, number>; }

const METODO_COR: Record<string, string> = { GET: "#22C55E", POST: "#3B82F6", PATCH: "#F59E0B", DELETE: "#EF4444" };
const STATUS_COR = (code: number) => code < 300 ? "#22C55E" : code < 400 ? "#F59E0B" : "#EF4444";

export default function LogsPage() {
  const [logs, setLogs] = useState<LogAcesso[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtroMetodo, setFiltroMetodo] = useState("");
  const [filtroEndpoint, setFiltroEndpoint] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  const carregar = async () => {
    setLoading(true);
    try {
      const [l, r] = await Promise.all([
        getLogsAcesso({ metodo: filtroMetodo || undefined, endpoint: filtroEndpoint || undefined, status_code: filtroStatus ? Number(filtroStatus) : undefined }),
        getResumoLogs(),
      ]);
      setLogs(l);
      setResumo(r);
    } finally { setLoading(false); }
  };

  useEffect(() => { carregar(); }, []);

  const totalRequisicoes = resumo ? Object.values(resumo.por_status).reduce((a, b) => a + b, 0) : 0;
  const totalErros = resumo ? Object.entries(resumo.por_status).filter(([k]) => Number(k) >= 400).reduce((a, [, v]) => a + v, 0) : 0;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-primary)" }}>
      <Header />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-xl font-black uppercase tracking-widest mb-6" style={{ color: "var(--text-primary)" }}>
          Logs de Acesso
        </h1>

        {/* KPIs */}
        {resumo && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="rounded-xl p-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <p className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>{totalRequisicoes.toLocaleString()}</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Requisições (24h)</p>
            </div>
            <div className="rounded-xl p-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid rgba(34,197,94,0.3)" }}>
              <p className="text-2xl font-black" style={{ color: "#22C55E" }}>
                {Object.entries(resumo.por_status).filter(([k]) => Number(k) < 400).reduce((a, [, v]) => a + v, 0).toLocaleString()}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Sucessos (2xx/3xx)</p>
            </div>
            <div className="rounded-xl p-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid rgba(239,68,68,0.3)" }}>
              <p className="text-2xl font-black" style={{ color: "#EF4444" }}>{totalErros.toLocaleString()}</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Erros (4xx/5xx)</p>
            </div>
            <div className="rounded-xl p-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <p className="text-2xl font-black" style={{ color: "#F59E0B" }}>
                {totalRequisicoes > 0 ? Math.round((1 - totalErros / totalRequisicoes) * 100) : 0}%
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Taxa de sucesso</p>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 mb-5 p-4 rounded-xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <select value={filtroMetodo} onChange={(e) => setFiltroMetodo(e.target.value)} className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
            <option value="">Todos métodos</option>
            {["GET", "POST", "PATCH", "DELETE", "PUT"].map((m) => (<option key={m} value={m}>{m}</option>))}
          </select>
          <input value={filtroEndpoint} onChange={(e) => setFiltroEndpoint(e.target.value)} placeholder="Endpoint..." className="flex-1 min-w-40 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
          <input value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} placeholder="Status code..." className="w-32 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
          <button onClick={carregar} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#DC2626" }}>Filtrar</button>
        </div>

        {/* Tabela */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {loading ? (
            <div className="text-center py-16 text-xs" style={{ color: "var(--text-muted)" }}>Carregando...</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ backgroundColor: "var(--bg-mid)", borderBottom: "1px solid var(--border)" }}>
                  {["Data/Hora", "Usuário", "Método", "Endpoint", "Status", "Duração", "IP"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-bold uppercase" style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12" style={{ color: "var(--text-muted)" }}>Nenhum log encontrado</td></tr>
                )}
                {logs.map((l) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-2.5 font-mono" style={{ color: "var(--text-muted)" }}>
                      {new Date(l.timestamp).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-2.5">
                      <div style={{ color: "var(--text-primary)" }}>{l.nome ?? l.username ?? "—"}</div>
                      {l.nome && l.username && (
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>@{l.username}</div>
                      )}
                      {l.perfil && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-bold mt-0.5 inline-block" style={{ backgroundColor: `${PERFIL_COR[l.perfil] ?? "#6B7280"}20`, color: PERFIL_COR[l.perfil] ?? "#6B7280" }}>
                          {l.perfil}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="px-1.5 py-0.5 rounded font-mono font-bold text-xs" style={{ backgroundColor: `${METODO_COR[l.metodo] ?? "#6B7280"}20`, color: METODO_COR[l.metodo] ?? "#6B7280" }}>
                        {l.metodo}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono max-w-xs truncate" style={{ color: "var(--text-primary)" }}>{l.endpoint}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-bold" style={{ color: STATUS_COR(l.status_code) }}>{l.status_code}</span>
                    </td>
                    <td className="px-4 py-2.5" style={{ color: l.duracao_ms && l.duracao_ms > 1000 ? "#F59E0B" : "var(--text-muted)" }}>
                      {l.duracao_ms != null ? `${l.duracao_ms}ms` : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{l.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
