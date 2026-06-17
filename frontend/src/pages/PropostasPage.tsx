import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPropostas, aprovarProposta, bloquearProposta, reprocessarProposta } from "@/lib/api";
import Layout from "@/components/Layout";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  ENFILEIRADA:      { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" },
  EM_ANALISE:       { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
  APROVADA:         { bg: "rgba(52,211,153,0.15)",  color: "#34d399" },
  REPROVADA:        { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
  BLOQUEADA:        { bg: "rgba(251,146,60,0.15)",  color: "#fb923c" },
  ANALISE_MANUAL:   { bg: "rgba(251,191,36,0.15)",  color: "#fbbf24" },
  ENVIADA_BANCO:    { bg: "rgba(129,140,248,0.15)", color: "#818cf8" },
  CONFIRMADA_BANCO: { bg: "rgba(16,185,129,0.15)",  color: "#10b981" },
  ERRO:             { bg: "rgba(239,68,68,0.15)",   color: "#ef4444" },
};

const STATUSES = ["", "ENFILEIRADA", "EM_ANALISE", "APROVADA", "BLOQUEADA", "ANALISE_MANUAL", "ERRO"];

const inputStyle = {
  backgroundColor: "var(--bg-mid)", color: "var(--text-primary)",
  border: "1px solid var(--border)", borderRadius: "0.5rem",
  padding: "0.4rem 0.75rem", fontSize: "0.8rem", outline: "none",
};

export default function PropostasPage() {
  const [filtro, setFiltro] = useState("");
  const qc = useQueryClient();

  const { data: propostas = [], isLoading } = useQuery({
    queryKey: ["propostas", filtro],
    queryFn: () => getPropostas(filtro || undefined),
    refetchInterval: 8_000,
  });

  const mutAprovar    = useMutation({ mutationFn: aprovarProposta,    onSuccess: () => qc.invalidateQueries({ queryKey: ["propostas"] }) });
  const mutBloquear   = useMutation({ mutationFn: bloquearProposta,   onSuccess: () => qc.invalidateQueries({ queryKey: ["propostas"] }) });
  const mutReprocessar = useMutation({ mutationFn: reprocessarProposta, onSuccess: () => qc.invalidateQueries({ queryKey: ["propostas"] }) });

  return (
    <Layout>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>Propostas</h1>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{propostas.length} registro{propostas.length !== 1 ? "s" : ""}</p>
          </div>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} style={inputStyle}>
            {STATUSES.map((s) => <option key={s} value={s}>{s || "Todos os status"}</option>)}
          </select>
        </div>

        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 800 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-subtle)" }}>
                  {["ID Externo", "CPF", "Banco", "Valor", "Status", "Score", "Data", ""].map((h, i) => (
                    <th key={i} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide ${i >= 3 ? "text-right" : "text-left"}`}
                      style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={8} className="text-center py-10 text-sm" style={{ color: "var(--text-muted)" }}>Carregando...</td></tr>}
                {!isLoading && propostas.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-sm" style={{ color: "var(--text-muted)" }}>Nenhuma proposta encontrada</td></tr>}
                {propostas.map((p: any, idx: number) => {
                  const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.ENFILEIRADA;
                  return (
                    <tr key={p.id} style={{ backgroundColor: idx % 2 === 0 ? "var(--bg-row-even)" : "var(--bg-row-odd)", borderBottom: "1px solid var(--border-mid)" }}>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{p.proposta_id_externo}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>{p.cpf_cliente}</td>
                      <td className="px-4 py-3 text-xs font-medium" style={{ color: "var(--text-primary)" }}>{p.banco}</td>
                      <td className="px-4 py-3 text-right text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                        {p.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs px-2 py-0.5 rounded font-semibold uppercase tracking-wide"
                          style={{ backgroundColor: badge.bg, color: badge.color }}>{p.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.score_fraude != null ? (
                          <span className="font-bold text-xs" style={{ color: p.score_fraude >= 80 ? "#f87171" : p.score_fraude >= 40 ? "#fbbf24" : "#34d399" }}>
                            {p.score_fraude}
                          </span>
                        ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-xs" style={{ color: "var(--text-muted)" }}>
                        {format(new Date(p.criado_em), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          {p.status === "ANALISE_MANUAL" && (
                            <>
                              <button onClick={() => mutAprovar.mutate(p.id)}
                                className="px-2 py-1 text-xs rounded font-semibold text-white transition-opacity hover:opacity-80"
                                style={{ backgroundColor: "#16a34a" }}>Aprovar</button>
                              <button onClick={() => mutBloquear.mutate(p.id)}
                                className="px-2 py-1 text-xs rounded font-semibold text-white transition-opacity hover:opacity-80"
                                style={{ backgroundColor: "#DC2626" }}>Bloquear</button>
                            </>
                          )}
                          {(p.status === "ERRO" || p.status === "BLOQUEADA") && (
                            <button onClick={() => mutReprocessar.mutate(p.id)}
                              className="px-2 py-1 text-xs rounded font-semibold text-white transition-opacity hover:opacity-80"
                              style={{ backgroundColor: "#2563eb" }}>Reprocessar</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
