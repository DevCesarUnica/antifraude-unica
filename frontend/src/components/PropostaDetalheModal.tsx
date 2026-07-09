import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  getDebugProposta,
  aprovarProposta,
  bloquearProposta,
  reprocessarProposta,
  enviarPropostaBanco,
} from "@/lib/api";

// ── Tipos exportados ─────────────────────────────────────────────────────────

export interface PropostaDashboard {
  id: string;
  ade: string;
  banco: string;
  convenio: string | null;
  produto: string | null;
  corretor: string | null;
  corretor_id: string | null;
  valor: number;
  status: string;
  cpf: string;
  nome_cliente: string | null;
  uf_cliente: string | null;
  observacoes: string | null;
  data_importacao: string;
  data_atualizacao: string;
  data_agendamento: string | null;
  possui_arquivos: boolean;
  score_fraude: number | null;
  resultado_motor: string | null;
  origem: string;
  tentativas: number;
  corretor_esteira?: string | null;
  corretor_limite?: number | null;
  limite_corretor_status?: string | null;
}

export interface AuditoriaItem {
  evento: string;
  dados: Record<string, unknown>;
  usuario: string | null;
  timestamp: string;
}

interface RegraDisparada {
  regra_id: string;
  nome: string;
  tipo: string;
  score_contribuicao: number;
  bloqueante: boolean;
  motivo: string;
  detalhes: Record<string, unknown>;
  efeito: "REAL" | "SHADOW";
}

interface DebugProposta {
  decisao: {
    resultado?: string;
    score?: number;
    motivo_principal?: string;
    flags?: string[];
    regras_disparadas?: RegraDisparada[];
  } | null;
  corretor_resolucao: Record<string, unknown> | null;
  limite_corretor_shadow: Record<string, unknown> | null;
  auditoria: AuditoriaItem[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtCPF(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return cpf;
}

function fmtData(s: string | null | undefined): string {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yyyy HH:mm", { locale: ptBR }); }
  catch { return s; }
}

function fmtDataSo(s: string | null | undefined): string {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yyyy", { locale: ptBR }); }
  catch { return s; }
}

function safe(v: unknown): string {
  if (v == null) return "—";
  return String(v) || "—";
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
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

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, bg: "rgba(148,163,184,0.15)", color: "#94a3b8" };
  return (
    <span
      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap"
      style={{ backgroundColor: m.bg, color: m.color }}
    >
      {m.label}
    </span>
  );
}

function ScoreChip({ score }: { score: number | null }) {
  if (score == null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const color = score >= 80 ? "#ef4444" : score >= 40 ? "#eab308" : "#22c55e";
  return <span className="font-bold text-xs" style={{ color }}>{score}</span>;
}

function OrigemChip({ origem }: { origem: string }) {
  const meta: Record<string, { label: string; color: string }> = {
    hope:   { label: "HOPE",   color: "#DC2626" },
    storm:  { label: "STORM",  color: "#3b82f6" },
    manual: { label: "MANUAL", color: "#94a3b8" },
  };
  const m = meta[origem] ?? { label: origem.toUpperCase(), color: "#94a3b8" };
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: `${m.color}15`, color: m.color }}>
      {m.label}
    </span>
  );
}

function LimiteCorretorBadge({ status }: { status: string }) {
  const dentro = status === "DENTRO_DA_FAIXA";
  return (
    <span
      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap"
      style={{
        backgroundColor: dentro ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
        color: dentro ? "#22c55e" : "#ef4444",
      }}
    >
      {dentro ? "Dentro da faixa" : "Acima da faixa"}
    </span>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{children}</p>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface Props {
  proposta: PropostaDashboard;
  onClose: () => void;
  onAprovar?: () => Promise<void>;
  onBloquear?: () => Promise<void>;
  onReprocessar?: () => Promise<void>;
  onEnviarBanco?: () => Promise<void>;
}

export default function PropostaDetalheModal({
  proposta,
  onClose,
  onAprovar,
  onBloquear,
  onReprocessar,
  onEnviarBanco,
}: Props) {
  const [debug, setDebug] = useState<DebugProposta | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [verAvaliacaoCompleta, setVerAvaliacaoCompleta] = useState(false);
  const [acao, setAcao] = useState<"aprovar" | "bloquear" | "reprocessar" | "enviar_banco" | null>(null);
  const [loadingAcao, setLoadingAcao] = useState(false);
  const [msgAcao, setMsgAcao] = useState("");

  const auditoria = debug?.auditoria ?? [];
  const regrasDisparadas = debug?.decisao?.regras_disparadas ?? [];

  const defaultAprovar     = (): Promise<void> => aprovarProposta(proposta.id).then(() => {});
  const defaultBloquear    = (): Promise<void> => bloquearProposta(proposta.id).then(() => {});
  const defaultReprocessar = (): Promise<void> => reprocessarProposta(proposta.id).then(() => {});
  const defaultEnviarBanco = (): Promise<void> => enviarPropostaBanco(proposta.id).then(() => {});

  useEffect(() => {
    setLoadingAudit(true);
    getDebugProposta(proposta.id)
      .then((d: DebugProposta) => setDebug(d))
      .catch(() => setDebug(null))
      .finally(() => setLoadingAudit(false));
  }, [proposta.id]);

  const executar = async () => {
    if (!acao) return;
    setLoadingAcao(true); setMsgAcao("");
    try {
      if (acao === "aprovar")           await (onAprovar ?? defaultAprovar)();
      else if (acao === "bloquear")    await (onBloquear ?? defaultBloquear)();
      else if (acao === "enviar_banco") await (onEnviarBanco ?? defaultEnviarBanco)();
      else                             await (onReprocessar ?? defaultReprocessar)();
      onClose();
    } catch {
      setMsgAcao("Erro ao executar ação. Verifique o console.");
      setLoadingAcao(false);
    }
  };

  const podeAprovar      = proposta.status === "ANALISE_MANUAL";
  const podeBloquear     = ["ANALISE_MANUAL", "APROVADA", "EM_ANALISE"].includes(proposta.status);
  const podeReprocessar  = ["ERRO", "BLOQUEADA"].includes(proposta.status);
  const podeEnviarBanco  = proposta.status === "APROVADA";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex flex-col rounded-2xl overflow-hidden w-full max-w-3xl max-h-[92vh]"
        style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-mid)" }}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-black font-mono" style={{ color: "#DC2626" }}>{proposta.ade}</span>
              <StatusBadge status={proposta.status} />
              <OrigemChip origem={proposta.origem} />
              {proposta.score_fraude != null && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: "var(--bg-card)", color: "var(--text-muted)" }}>
                  Score: <ScoreChip score={proposta.score_fraude} />
                </span>
              )}
            </div>
            <p className="text-base font-bold mt-1" style={{ color: "var(--text-primary)" }}>{proposta.nome_cliente ?? "—"}</p>
            <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{fmtCPF(proposta.cpf)}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0"
            style={{ backgroundColor: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >
            ✕ Fechar
          </button>
        </div>

        {/* Corpo com scroll */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {/* Dados da proposta */}
          <section>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: "#DC2626" }}>Dados da Proposta</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
              <Campo label="Banco">{proposta.banco}</Campo>
              <Campo label="Convênio">{safe(proposta.convenio)}</Campo>
              <Campo label="Produto">{safe(proposta.produto)}</Campo>
              <Campo label="Valor"><span className="font-bold">{fmtBRL(proposta.valor)}</span></Campo>
              <Campo label="Corretor">{safe(proposta.corretor)}</Campo>
              <Campo label="UF">{safe(proposta.uf_cliente)}</Campo>
              <Campo label="Resultado Motor">{safe(proposta.resultado_motor)}</Campo>
              <Campo label="Tentativas">{String(proposta.tentativas)}</Campo>
              <Campo label="Arquivos">{proposta.possui_arquivos ? "✓ Sim" : "Não"}</Campo>
            </div>
          </section>

          {/* Análise da Esteira (modo observação — informativo, não bloqueia) */}
          {proposta.corretor_esteira && (
            <section>
              <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: "#DC2626" }}>
                Análise da Esteira{" "}
                <span
                  style={{ color: "var(--text-muted)", fontWeight: 600 }}
                  title="Esta validação é apenas informativa. Ela não bloqueia, reprova ou altera a decisão da proposta."
                >
                  (Em modo observação — não bloqueia propostas)
                </span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-3">
                <Campo label="Corretor">{safe(proposta.corretor)}</Campo>
                <Campo label="Esteira">{safe(proposta.corretor_esteira)}</Campo>
                <Campo label="Limite">{proposta.corretor_limite != null ? fmtBRL(proposta.corretor_limite) : "—"}</Campo>
                <Campo label="Valor da Proposta"><span className="font-bold">{fmtBRL(proposta.valor)}</span></Campo>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: "var(--text-muted)" }}>Resultado</p>
                  {proposta.limite_corretor_status ? <LimiteCorretorBadge status={proposta.limite_corretor_status} /> : "—"}
                </div>
              </div>
            </section>
          )}

          {/* Regras disparadas — integração motor antifraude ↔ propostas */}
          {regrasDisparadas.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#DC2626" }}>
                  Regras Disparadas ({regrasDisparadas.length})
                </p>
                <button
                  onClick={() => setVerAvaliacaoCompleta((v) => !v)}
                  className="text-[10px] font-bold px-2 py-1 rounded"
                  style={{ backgroundColor: "rgba(96,165,250,0.1)", color: "#60a5fa" }}
                >
                  {verAvaliacaoCompleta ? "Ocultar detalhes" : "Ver Avaliação Completa"}
                </button>
              </div>
              <div className="space-y-2">
                {regrasDisparadas.map((r) => (
                  <div key={r.regra_id} className="rounded-lg p-3" style={{ backgroundColor: "var(--bg-mid)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{r.nome}</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                          style={{
                            backgroundColor: r.efeito === "SHADOW" ? "rgba(168,85,247,0.15)" : "rgba(96,165,250,0.15)",
                            color: r.efeito === "SHADOW" ? "#a855f7" : "#60a5fa",
                          }}
                          title={r.efeito === "SHADOW" ? "Esta validação é apenas informativa. Ela não bloqueia, reprova ou altera a decisão da proposta." : undefined}
                        >
                          {r.efeito === "SHADOW" ? "Observação" : "Real"}
                        </span>
                        {r.bloqueante && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                            Bloqueante
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                      {r.tipo} · impacto no score: +{r.score_contribuicao}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{r.motivo}</p>
                    {verAvaliacaoCompleta && (
                      <pre className="text-[9px] mt-2 overflow-x-auto p-2 rounded" style={{ backgroundColor: "var(--bg-subtle)", color: "var(--text-muted)" }}>
                        {JSON.stringify(r.detalhes, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Datas */}
          <section>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: "#DC2626" }}>Datas</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
              <Campo label="Importação">{fmtData(proposta.data_importacao)}</Campo>
              <Campo label="Atualização">{fmtData(proposta.data_atualizacao)}</Campo>
              <Campo label="Agendamento">{fmtDataSo(proposta.data_agendamento)}</Campo>
            </div>
          </section>

          {/* Observações */}
          {proposta.observacoes && (
            <section>
              <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "#DC2626" }}>Observações / Motivo</p>
              <p className="text-xs p-3 rounded-lg" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                {proposta.observacoes}
              </p>
            </section>
          )}

          {/* Histórico de auditoria */}
          <section>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: "#DC2626" }}>Histórico</p>
            {loadingAudit ? (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Carregando histórico...</p>
            ) : auditoria.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Nenhum evento registrado.</p>
            ) : (
              <div className="space-y-1.5">
                {[...auditoria].reverse().map((ev, i) => (
                  <div key={i} className="flex gap-3 py-2 px-3 rounded-lg" style={{ backgroundColor: "var(--bg-mid)", border: "1px solid var(--border)" }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase" style={{ color: "#60a5fa" }}>{ev.evento}</span>
                        {ev.usuario && <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>por {ev.usuario}</span>}
                      </div>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{fmtData(ev.timestamp)}</p>
                      {ev.dados && Object.keys(ev.dados).length > 0 && (
                        <pre className="text-[9px] mt-1 overflow-x-auto" style={{ color: "var(--text-muted)" }}>
                          {JSON.stringify(ev.dados, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Rodapé com ações */}
        <div className="px-6 py-4 flex items-center gap-3 flex-wrap" style={{ borderTop: "1px solid var(--border)", backgroundColor: "var(--bg-mid)" }}>
          <span className="text-[10px] font-bold uppercase tracking-wide mr-2" style={{ color: "var(--text-muted)" }}>Ações:</span>
          {podeAprovar && (
            <button onClick={() => setAcao("aprovar")} disabled={loadingAcao}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: "#16a34a", opacity: loadingAcao ? 0.65 : 1 }}>
              ✓ Aprovar
            </button>
          )}
          {podeBloquear && (
            <button onClick={() => setAcao("bloquear")} disabled={loadingAcao}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: "#DC2626", opacity: loadingAcao ? 0.65 : 1 }}>
              ✕ Bloquear
            </button>
          )}
          {podeReprocessar && (
            <button onClick={() => setAcao("reprocessar")} disabled={loadingAcao}
              className="px-4 py-1.5 rounded-lg text-xs font-bold"
              style={{ backgroundColor: "rgba(96,165,250,0.15)", color: "#60a5fa" }}>
              ↺ Reprocessar
            </button>
          )}
          {podeEnviarBanco && (
            <button onClick={() => setAcao("enviar_banco")} disabled={loadingAcao}
              className="px-4 py-1.5 rounded-lg text-xs font-bold"
              style={{ backgroundColor: "rgba(168,85,247,0.15)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.3)" }}>
              ↗ Enviar ao Banco
            </button>
          )}
          {!podeAprovar && !podeBloquear && !podeReprocessar && !podeEnviarBanco && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Nenhuma ação disponível para este status.</span>
          )}
          {acao && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Confirmar{" "}
                <strong>
                  {acao === "enviar_banco" ? "envio ao banco (Titan)" : acao}
                </strong>?
              </span>
              <button onClick={executar} disabled={loadingAcao}
                className="px-3 py-1 rounded text-xs font-bold text-white"
                style={{ backgroundColor: "#DC2626" }}>
                {loadingAcao ? "..." : "Sim"}
              </button>
              <button onClick={() => setAcao(null)}
                className="px-3 py-1 rounded text-xs font-semibold"
                style={{ backgroundColor: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                Não
              </button>
            </div>
          )}
          {msgAcao && <p className="text-xs w-full mt-1" style={{ color: "#f87171" }}>{msgAcao}</p>}
        </div>
      </div>
    </div>
  );
}
