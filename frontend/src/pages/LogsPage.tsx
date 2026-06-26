import React, { useCallback, useEffect, useState } from "react";
import Header from "../components/Header";
import { getLogsAuditoria, getResumoAuditoria, getLogsSuspeitos, exportarLogsExcel } from "../lib/api";

interface LogAuditoria {
  id: string;
  usuario_id: string | null;
  username: string | null;
  nome: string | null;
  perfil: string | null;
  acao: string;
  tipo_entidade: string | null;
  entidade_id: string | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  risco: "BAIXO" | "MEDIO" | "ALTO";
  ip: string | null;
  user_agent: string | null;
  origem: string;
  sucesso: boolean;
  erro: string | null;
  criado_em: string;
}

interface ResumoAuditoria {
  total_acoes: number;
  alto_risco: number;
  usuarios_ativos: number;
  taxa_sucesso: number;
}

const RISCO_COR: Record<string, string> = {
  BAIXO: "#22C55E",
  MEDIO: "#F59E0B",
  ALTO:  "#EF4444",
};

const PERFIL_COR: Record<string, string> = {
  admin:    "#EF4444",
  gestor:   "#F59E0B",
  analista: "#3B82F6",
  operador: "#6B7280",
};

const ENTIDADE_LABEL: Record<string, string> = {
  proposta:  "Proposta",
  usuario:   "Usuário",
  contrato:  "Contrato",
  blacklist: "Blacklist",
  regra:     "Regra",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

function DiffViewer({
  antes,
  depois,
}: {
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
}) {
  const allKeys = [
    ...new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})]),
  ];
  if (allKeys.length === 0) return null;
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--border)" }}
    >
      <table className="w-full text-xs">
        <thead>
          <tr style={{ backgroundColor: "var(--bg-mid)" }}>
            <th
              className="px-3 py-2 text-left font-bold uppercase"
              style={{ color: "var(--text-muted)", width: "30%" }}
            >
              Campo
            </th>
            <th
              className="px-3 py-2 text-left font-bold uppercase"
              style={{ color: "#EF4444", width: "35%" }}
            >
              Antes
            </th>
            <th
              className="px-3 py-2 text-left font-bold uppercase"
              style={{ color: "#22C55E", width: "35%" }}
            >
              Depois
            </th>
          </tr>
        </thead>
        <tbody>
          {allKeys.map((key) => {
            const va = antes?.[key];
            const vd = depois?.[key];
            const mudou = JSON.stringify(va) !== JSON.stringify(vd);
            return (
              <tr
                key={key}
                style={{
                  borderTop: "1px solid var(--border)",
                  backgroundColor: mudou
                    ? "rgba(245,158,11,0.05)"
                    : undefined,
                }}
              >
                <td
                  className="px-3 py-1.5 font-mono"
                  style={{ color: "var(--text-muted)" }}
                >
                  {key}
                </td>
                <td
                  className="px-3 py-1.5 font-mono"
                  style={{ color: mudou ? "#EF4444" : "var(--text-muted)" }}
                >
                  {va !== undefined ? String(va) : "—"}
                </td>
                <td
                  className="px-3 py-1.5 font-mono"
                  style={{ color: mudou ? "#22C55E" : "var(--text-muted)" }}
                >
                  {vd !== undefined ? String(vd) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function JsonBox({
  data,
  label,
}: {
  data: Record<string, unknown> | null;
  label: string;
}) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div>
      <p
        className="text-xs font-bold uppercase mb-1"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <pre
        className="text-xs rounded-lg p-3 overflow-auto"
        style={{
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          maxHeight: 120,
        }}
      >
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

const LIMIT = 50;

export default function LogsPage() {
  const [logs, setLogs]         = useState<LogAuditoria[]>([]);
  const [resumo, setResumo]     = useState<ResumoAuditoria | null>(null);
  const [suspeitos, setSuspeitos] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [skip, setSkip]         = useState(0);
  const [exportando, setExportando] = useState(false);

  const [filtroUsuario, setFiltroUsuario]   = useState("");
  const [filtroAcao, setFiltroAcao]         = useState("");
  const [filtroRisco, setFiltroRisco]       = useState("");
  const [filtroSucesso, setFiltroSucesso]   = useState("");
  const [filtroInicio, setFiltroInicio]     = useState("");
  const [filtroFim, setFiltroFim]           = useState("");

  const carregar = useCallback(
    async (novoSkip = 0) => {
      setLoading(true);
      try {
        const params: Record<string, unknown> = { skip: novoSkip, limit: LIMIT };
        if (filtroUsuario) params.usuario = filtroUsuario;
        if (filtroAcao)    params.acao    = filtroAcao;
        if (filtroRisco)   params.risco   = filtroRisco;
        if (filtroSucesso !== "") params.sucesso = filtroSucesso === "true";
        if (filtroInicio)  params.data_inicio = filtroInicio;
        if (filtroFim)     params.data_fim    = filtroFim;

        const [l, r, s] = await Promise.all([
          getLogsAuditoria(params),
          getResumoAuditoria(),
          getLogsSuspeitos(),
        ]);

        setLogs(novoSkip === 0 ? l : (prev) => [...prev, ...l]);
        setResumo(r);
        setSuspeitos(s?.total ?? 0);
        setSkip(novoSkip);
      } catch {
        // silencioso
      } finally {
        setLoading(false);
      }
    },
    [filtroUsuario, filtroAcao, filtroRisco, filtroSucesso, filtroInicio, filtroFim]
  );

  useEffect(() => {
    carregar();
  }, []);

  const filtrar      = () => carregar(0);
  const carregarMais = () => carregar(skip + LIMIT);

  const exportar = async () => {
    setExportando(true);
    try {
      const params: Record<string, unknown> = {};
      if (filtroUsuario) params.usuario = filtroUsuario;
      if (filtroAcao)    params.acao    = filtroAcao;
      if (filtroRisco)   params.risco   = filtroRisco;
      if (filtroSucesso !== "") params.sucesso = filtroSucesso === "true";
      if (filtroInicio)  params.data_inicio = filtroInicio;
      if (filtroFim)     params.data_fim    = filtroFim;
      await exportarLogsExcel(params);
    } finally {
      setExportando(false);
    }
  };

  const toggleExpand = (id: string) =>
    setExpandedId((cur) => (cur === id ? null : id));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-primary)" }}>
      <Header />
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Título */}
        <h1
          className="text-xl font-black uppercase tracking-widest mb-6"
          style={{ color: "var(--text-primary)" }}
        >
          Auditoria de Ações
        </h1>

        {/* KPI Cards */}
        {resumo && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border)",
              }}
            >
              <p
                className="text-2xl font-black"
                style={{ color: "var(--text-primary)" }}
              >
                {resumo.total_acoes.toLocaleString("pt-BR")}
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Ações (24h)
              </p>
            </div>

            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid rgba(239,68,68,0.3)",
              }}
            >
              <p className="text-2xl font-black" style={{ color: "#EF4444" }}>
                {resumo.alto_risco.toLocaleString("pt-BR")}
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Alto risco (24h)
              </p>
            </div>

            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid rgba(59,130,246,0.3)",
              }}
            >
              <p className="text-2xl font-black" style={{ color: "#3B82F6" }}>
                {resumo.usuarios_ativos.toLocaleString("pt-BR")}
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Usuários ativos (24h)
              </p>
            </div>

            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid rgba(34,197,94,0.3)",
              }}
            >
              <p className="text-2xl font-black" style={{ color: "#22C55E" }}>
                {resumo.taxa_sucesso}%
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Taxa de sucesso
              </p>
            </div>
          </div>
        )}

        {/* Alerta de atividades suspeitas */}
        {suspeitos > 0 && (
          <div
            className="rounded-xl p-4 mb-5 flex items-center gap-3"
            style={{
              backgroundColor: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.4)",
            }}
          >
            <span style={{ fontSize: 20 }}>⚠</span>
            <div>
              <p className="text-sm font-bold" style={{ color: "#F59E0B" }}>
                {suspeitos} atividade{suspeitos !== 1 ? "s" : ""} suspeita
                {suspeitos !== 1 ? "s" : ""} detectada
                {suspeitos !== 1 ? "s" : ""} nas últimas 24h
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Concentração de ações de risco, logins falhados ou acesso fora
                do horário comercial.
              </p>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div
          className="flex flex-wrap gap-3 mb-5 p-4 rounded-xl"
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <input
            value={filtroUsuario}
            onChange={(e) => setFiltroUsuario(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && filtrar()}
            placeholder="Buscar usuário..."
            className="flex-1 min-w-36 px-3 py-2 rounded-lg text-xs"
            style={{
              backgroundColor: "var(--bg-mid)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
          <input
            value={filtroAcao}
            onChange={(e) => setFiltroAcao(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && filtrar()}
            placeholder="Buscar ação..."
            className="flex-1 min-w-36 px-3 py-2 rounded-lg text-xs"
            style={{
              backgroundColor: "var(--bg-mid)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
          <select
            value={filtroRisco}
            onChange={(e) => setFiltroRisco(e.target.value)}
            className="px-3 py-2 rounded-lg text-xs"
            style={{
              backgroundColor: "var(--bg-mid)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          >
            <option value="">Todos os riscos</option>
            <option value="BAIXO">Baixo</option>
            <option value="MEDIO">Médio</option>
            <option value="ALTO">Alto</option>
          </select>
          <select
            value={filtroSucesso}
            onChange={(e) => setFiltroSucesso(e.target.value)}
            className="px-3 py-2 rounded-lg text-xs"
            style={{
              backgroundColor: "var(--bg-mid)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          >
            <option value="">Sucesso e erro</option>
            <option value="true">Somente sucesso</option>
            <option value="false">Somente erro</option>
          </select>
          <input
            type="datetime-local"
            value={filtroInicio}
            onChange={(e) => setFiltroInicio(e.target.value)}
            className="px-3 py-2 rounded-lg text-xs"
            style={{
              backgroundColor: "var(--bg-mid)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
          <input
            type="datetime-local"
            value={filtroFim}
            onChange={(e) => setFiltroFim(e.target.value)}
            className="px-3 py-2 rounded-lg text-xs"
            style={{
              backgroundColor: "var(--bg-mid)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
          <button
            onClick={filtrar}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white"
            style={{ backgroundColor: "#DC2626" }}
          >
            Filtrar
          </button>
          <button
            onClick={exportar}
            disabled={exportando}
            className="px-4 py-2 rounded-lg text-xs font-bold"
            style={{
              backgroundColor: "#16A34A",
              color: "#fff",
              opacity: exportando ? 0.7 : 1,
              cursor: exportando ? "wait" : "pointer",
            }}
            title="Exportar logs filtrados para Excel"
          >
            {exportando ? "Exportando..." : "Exportar Excel"}
          </button>
        </div>

        {/* Tabela */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          {loading && logs.length === 0 ? (
            <div
              className="text-center py-16 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Carregando...
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ minWidth: 900 }}>
                  <thead>
                    <tr
                      style={{
                        backgroundColor: "var(--bg-mid)",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {[
                        "Data / Hora",
                        "Usuário",
                        "Ação",
                        "Entidade",
                        "Risco",
                        "IP",
                        "Status",
                        "",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left font-bold uppercase"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          className="text-center py-12"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Nenhum registro encontrado
                        </td>
                      </tr>
                    )}

                    {logs.map((l) => (
                      <React.Fragment key={l.id}>
                        {/* Linha principal */}
                        <tr
                          onClick={() => toggleExpand(l.id)}
                          style={{
                            borderBottom:
                              expandedId === l.id
                                ? "none"
                                : "1px solid var(--border)",
                            cursor: "pointer",
                          }}
                          className="hover:bg-white/5 transition-colors"
                        >
                          {/* Data/Hora */}
                          <td
                            className="px-4 py-2.5 font-mono whitespace-nowrap"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {fmt(l.criado_em)}
                          </td>

                          {/* Usuário */}
                          <td className="px-4 py-2.5">
                            {l.nome || l.username ? (
                              <div>
                                <div style={{ color: "var(--text-primary)" }}>
                                  {l.nome ?? l.username}
                                </div>
                                {l.nome && l.username && (
                                  <div
                                    className="text-xs"
                                    style={{ color: "var(--text-muted)" }}
                                  >
                                    @{l.username}
                                  </div>
                                )}
                                {l.perfil && (
                                  <span
                                    className="text-xs px-1.5 py-0.5 rounded font-bold mt-0.5 inline-block"
                                    style={{
                                      backgroundColor: `${PERFIL_COR[l.perfil] ?? "#6B7280"}20`,
                                      color: PERFIL_COR[l.perfil] ?? "#6B7280",
                                    }}
                                  >
                                    {l.perfil}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: "var(--text-muted)" }}>
                                Sistema
                              </span>
                            )}
                          </td>

                          {/* Ação */}
                          <td
                            className="px-4 py-2.5 max-w-xs"
                            style={{ color: "var(--text-primary)" }}
                          >
                            <span className="font-medium">{l.acao}</span>
                          </td>

                          {/* Entidade */}
                          <td className="px-4 py-2.5">
                            {l.tipo_entidade ? (
                              <div>
                                <span style={{ color: "var(--text-primary)" }}>
                                  {ENTIDADE_LABEL[l.tipo_entidade] ??
                                    l.tipo_entidade}
                                </span>
                                {l.entidade_id && (
                                  <div
                                    className="font-mono text-xs"
                                    style={{ color: "var(--text-muted)" }}
                                  >
                                    #{l.entidade_id.slice(0, 8)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: "var(--text-muted)" }}>
                                —
                              </span>
                            )}
                          </td>

                          {/* Risco */}
                          <td className="px-4 py-2.5">
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-bold uppercase"
                              style={{
                                backgroundColor: `${RISCO_COR[l.risco] ?? "#6B7280"}20`,
                                color: RISCO_COR[l.risco] ?? "#6B7280",
                              }}
                            >
                              {l.risco}
                            </span>
                          </td>

                          {/* IP */}
                          <td
                            className="px-4 py-2.5 font-mono"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {l.ip ?? "—"}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-2.5 text-center">
                            {l.sucesso ? (
                              <span
                                className="font-bold text-base"
                                style={{ color: "#22C55E" }}
                                title="Sucesso"
                              >
                                ✓
                              </span>
                            ) : (
                              <span
                                className="font-bold text-base"
                                style={{ color: "#EF4444" }}
                                title={l.erro ?? "Erro"}
                              >
                                ✗
                              </span>
                            )}
                          </td>

                          {/* Expand toggle */}
                          <td
                            className="px-4 py-2.5 text-center"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {expandedId === l.id ? "▲" : "▼"}
                          </td>
                        </tr>

                        {/* Linha expandida */}
                        {expandedId === l.id && (
                          <tr
                            style={{
                              borderBottom: "1px solid var(--border)",
                            }}
                          >
                            <td
                              colSpan={8}
                              className="px-6 pb-5 pt-3"
                              style={{ backgroundColor: "var(--bg-mid)" }}
                            >
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Diff antes/depois */}
                                {(l.antes || l.depois) && (
                                  <div className="md:col-span-2">
                                    <p
                                      className="text-xs font-bold uppercase mb-2"
                                      style={{ color: "var(--text-muted)" }}
                                    >
                                      Alterações
                                    </p>
                                    {l.antes && l.depois ? (
                                      <DiffViewer
                                        antes={l.antes}
                                        depois={l.depois}
                                      />
                                    ) : (
                                      <div className="flex flex-wrap gap-4">
                                        <JsonBox
                                          data={l.antes}
                                          label="Antes"
                                        />
                                        <JsonBox
                                          data={l.depois}
                                          label="Depois"
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Detalhes técnicos */}
                                <div>
                                  <p
                                    className="text-xs font-bold uppercase mb-2"
                                    style={{ color: "var(--text-muted)" }}
                                  >
                                    Detalhes técnicos
                                  </p>
                                  <div className="space-y-1.5">
                                    {l.ip && (
                                      <p className="text-xs">
                                        <span
                                          style={{
                                            color: "var(--text-muted)",
                                          }}
                                        >
                                          IP:{" "}
                                        </span>
                                        <span
                                          className="font-mono"
                                          style={{
                                            color: "var(--text-primary)",
                                          }}
                                        >
                                          {l.ip}
                                        </span>
                                      </p>
                                    )}
                                    {l.user_agent && (
                                      <p className="text-xs">
                                        <span
                                          style={{
                                            color: "var(--text-muted)",
                                          }}
                                        >
                                          Navegador:{" "}
                                        </span>
                                        <span
                                          style={{
                                            color: "var(--text-primary)",
                                          }}
                                        >
                                          {l.user_agent.slice(0, 80)}
                                          {l.user_agent.length > 80
                                            ? "…"
                                            : ""}
                                        </span>
                                      </p>
                                    )}
                                    <p className="text-xs">
                                      <span
                                        style={{ color: "var(--text-muted)" }}
                                      >
                                        Origem:{" "}
                                      </span>
                                      <span
                                        style={{
                                          color: "var(--text-primary)",
                                        }}
                                      >
                                        {l.origem}
                                      </span>
                                    </p>
                                    <p className="text-xs">
                                      <span
                                        style={{ color: "var(--text-muted)" }}
                                      >
                                        ID do log:{" "}
                                      </span>
                                      <span
                                        className="font-mono"
                                        style={{
                                          color: "var(--text-primary)",
                                        }}
                                      >
                                        {l.id}
                                      </span>
                                    </p>
                                  </div>
                                </div>

                                {/* Mensagem de erro */}
                                {!l.sucesso && l.erro && (
                                  <div>
                                    <p
                                      className="text-xs font-bold uppercase mb-2"
                                      style={{ color: "#EF4444" }}
                                    >
                                      Erro
                                    </p>
                                    <p
                                      className="text-xs p-3 rounded-lg"
                                      style={{
                                        backgroundColor:
                                          "rgba(239,68,68,0.08)",
                                        color: "#EF4444",
                                        border:
                                          "1px solid rgba(239,68,68,0.3)",
                                      }}
                                    >
                                      {l.erro}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Carregar mais */}
              {logs.length > 0 && logs.length % LIMIT === 0 && (
                <div className="text-center p-4">
                  <button
                    onClick={carregarMais}
                    disabled={loading}
                    className="px-6 py-2 rounded-lg text-xs font-bold"
                    style={{
                      backgroundColor: "var(--bg-mid)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                      opacity: loading ? 0.6 : 1,
                    }}
                  >
                    {loading ? "Carregando..." : "Carregar mais"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
