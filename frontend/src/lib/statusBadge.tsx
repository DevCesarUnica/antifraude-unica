// Paleta única de cores/labels por status de proposta.
//
// Antes, PropostasPage.tsx, DashboardPropostasTable.tsx e
// PropostaDetalheModal.tsx tinham cada uma sua própria cópia — divergindo
// entre si (BLOQUEADA/ERRO apareciam com cores trocadas dependendo da tela
// que o analista estava olhando). Ver AUDITORIA_PRODUCAO.md, achado A8.

export const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  APROVADA:         { label: "Aprovada",    bg: "rgba(34,197,94,0.15)",   color: "#22c55e" },
  CONFIRMADA_BANCO: { label: "Confirmada",  bg: "rgba(16,185,129,0.15)",  color: "#10b981" },
  ANALISE_MANUAL:   { label: "Analisar",    bg: "rgba(234,179,8,0.15)",   color: "#eab308" },
  EM_ANALISE:       { label: "Em Análise",  bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
  ENFILEIRADA:      { label: "Enfileirada", bg: "rgba(148,163,184,0.15)", color: "#94a3b8" },
  BLOQUEADA:        { label: "Bloqueada",   bg: "rgba(239,68,68,0.15)",   color: "#ef4444" },
  REPROVADA:        { label: "Reprovada",   bg: "rgba(239,68,68,0.15)",   color: "#ef4444" },
  ENVIADA_BANCO:    { label: "Enviada",     bg: "rgba(168,85,247,0.15)",  color: "#a855f7" },
  ERRO:             { label: "Erro",        bg: "rgba(251,146,60,0.15)",  color: "#fb923c" },
};

export function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, bg: "rgba(148,163,184,0.15)", color: "#94a3b8" };
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ backgroundColor: m.bg, color: m.color }}>
      {m.label}
    </span>
  );
}
