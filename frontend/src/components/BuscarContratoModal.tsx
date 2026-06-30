import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buscarContrato } from "../lib/api";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ContratoHope {
  origem: "hope";
  id: string;
  codigo_operacao: string;
  cliente: string;
  cpf: string;
  valor: number;
  valor_fmt: string;
  produto: string;
  status: string;
  banco: string;
  convenio: string;
  criado_em: string | null;
}

interface ContratoStorm {
  origem: "storm";
  id: string;
  codigo_operacao: string;
  cliente: string;
  cpf: string;
  valor: number;
  valor_fmt: string;
  produto: string;
  status: string;
  banco: string;
  convenio: string;
  criado_em: string | null;
}

interface ContratoLocal {
  origem: "local";
  id: string;
  id_externo: string;
  cliente: string;
  cpf: string;
  valor: number;
  valor_fmt: string;
  produto: string;
  status: string;
  banco: string;
  convenio: string;
  criado_em: string | null;
}

interface BuscarResult {
  numero_buscado: string;
  total_encontrados: number;
  hope: ContratoHope | null;
  storm: ContratoStorm | null;
  local: ContratoLocal[];
  fontes_com_erro: string[];
}

// ── Badges ────────────────────────────────────────────────────────────────────

function BadgeHope() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
      style={{ backgroundColor: "rgba(139,92,246,0.15)", color: "#8B5CF6", border: "1px solid rgba(139,92,246,0.3)" }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" />
      HOPE
    </span>
  );
}

function BadgeStorm() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
      style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.3)" }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
      STORM
    </span>
  );
}

function BadgeLocal() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
      style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.3)" }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
      LOCAL
    </span>
  );
}

function BadgePrioridade() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
      style={{ backgroundColor: "rgba(139,92,246,0.2)", color: "#A78BFA", border: "1px solid rgba(139,92,246,0.4)" }}
    >
      ★ Prioridade
    </span>
  );
}

// ── Card de contrato ──────────────────────────────────────────────────────────

interface CardProps {
  contrato: ContratoHope | ContratoStorm | ContratoLocal;
  prioritario?: boolean;
}

function ContratoCard({ contrato, prioritario }: CardProps) {
  const isHope  = contrato.origem === "hope";
  const isStorm = contrato.origem === "storm";
  const isLocal = contrato.origem === "local";

  const accentColor = isHope ? "#8B5CF6" : isStorm ? "#3B82F6" : "#22C55E";
  const idExterno = isLocal ? (contrato as ContratoLocal).id_externo : contrato.id;

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      style={{
        backgroundColor: "var(--bg-primary)",
        border: `1px solid ${accentColor}33`,
        boxShadow: prioritario ? `0 0 0 1px ${accentColor}44, 0 4px 24px ${accentColor}1A` : "none",
      }}
    >
      {/* Linha de acento superior */}
      <div
        className="h-0.5 w-full"
        style={{
          background: isHope
            ? "linear-gradient(90deg, #8B5CF6, #A78BFA)"
            : isStorm
            ? "linear-gradient(90deg, #3B82F6, #60A5FA)"
            : "linear-gradient(90deg, #22C55E, #4ADE80)",
        }}
      />

      <div className="p-4">
        {/* Cabeçalho do card */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {isHope && <BadgeHope />}
            {isStorm && <BadgeStorm />}
            {isLocal && <BadgeLocal />}
            {prioritario && <BadgePrioridade />}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-base font-black" style={{ color: accentColor }}>
              {contrato.valor_fmt}
            </p>
          </div>
        </div>

        {/* ID do contrato */}
        <div className="flex items-center gap-2 mb-3">
          <code
            className="text-xs font-mono px-2 py-0.5 rounded"
            style={{ backgroundColor: `${accentColor}14`, color: accentColor }}
          >
            #{idExterno}
          </code>
          {(contrato.origem === "hope" || contrato.origem === "storm") && contrato.codigo_operacao && (
            <code
              className="text-xs font-mono px-2 py-0.5 rounded"
              style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-muted)" }}
            >
              op. {contrato.codigo_operacao}
            </code>
          )}
        </div>

        {/* Grid de dados */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <DataRow label="Cliente" value={contrato.cliente} highlight />
          <DataRow label="CPF"     value={contrato.cpf} />
          <DataRow label="Produto" value={contrato.produto} />
          <DataRow label="Status"  value={contrato.status} />
          <DataRow label="Banco"   value={contrato.banco} />
          <DataRow label="Convênio" value={contrato.convenio} />
        </div>

        {/* Data */}
        {contrato.criado_em && (
          <p className="mt-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
            Criado em {new Date(contrato.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </p>
        )}
      </div>
    </div>
  );
}

function DataRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p
        className="text-xs font-semibold truncate mt-0.5"
        style={{ color: highlight ? "var(--text-primary)" : "var(--text-primary)", opacity: highlight ? 1 : 0.85 }}
      >
        {value || "—"}
      </p>
    </div>
  );
}

// ── Modal principal ───────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export default function BuscarContratoModal({ onClose }: Props) {
  const [query, setQuery]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [resultado, setResultado] = useState<BuscarResult | null>(null);
  const [erro, setErro]           = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const buscar = useCallback(async (numero: string) => {
    if (!numero.trim() || numero.trim().length < 2) {
      setResultado(null);
      setErro(null);
      return;
    }
    setLoading(true);
    setErro(null);
    try {
      const res = await buscarContrato(numero.trim());
      setResultado(res);
    } catch {
      setErro("Erro ao realizar a busca. Verifique a conexão com o servidor.");
      setResultado(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const onInput = (v: string) => {
    setQuery(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => buscar(v), 300);
  };

  const totalEncontrados = resultado?.total_encontrados ?? 0;
  const semResultados    = resultado !== null && totalEncontrados === 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-16 px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-mid)" }}
      >
        {/* Barra de busca */}
        <div
          className="flex items-center gap-3 px-4 py-3.5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          {/* Ícone lupa */}
          {loading ? (
            <svg className="w-5 h-5 animate-spin flex-shrink-0" style={{ color: "#8B5CF6" }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
          )}

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onInput(e.target.value)}
            placeholder="Buscar por ADE, CPF ou nome... ex: 76525, 123.456.789-00, João Silva"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
            onKeyDown={(e) => { if (e.key === "Enter") buscar(query); }}
          />

          {query && (
            <button
              onClick={() => { setQuery(""); setResultado(null); setErro(null); inputRef.current?.focus(); }}
              className="flex-shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          <button
            onClick={onClose}
            className="flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded"
            style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-muted)" }}
          >
            ESC
          </button>
        </div>

        {/* Dicas de formato */}
        {!resultado && !loading && !erro && (
          <div className="px-5 py-6">
            <p className="text-xs font-semibold mb-3" style={{ color: "var(--text-muted)" }}>
              Formatos suportados
            </p>
            <div className="space-y-2">
              <FormatDica
                cor="#8B5CF6"
                badge={<BadgeHope />}
                exemplo="76525"
                desc="ID numérico — busca direta no Hope/Titan (prioridade)"
                prioridade
              />
              <FormatDica
                cor="#3B82F6"
                badge={<BadgeStorm />}
                exemplo="FF-29/06/2026-1"
                desc="Código FF — busca no sistema Storm"
              />
              <FormatDica
                cor="#22C55E"
                badge={<BadgeLocal />}
                exemplo="123.456.789-00"
                desc="CPF do cliente — busca no banco local"
              />
              <FormatDica
                cor="#22C55E"
                badge={<BadgeLocal />}
                exemplo="João Silva · titan-76525"
                desc="Nome ou ADE — busca por texto no banco local"
              />
            </div>
          </div>
        )}

        {/* Erro */}
        {erro && (
          <div className="px-5 py-4">
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
              style={{ backgroundColor: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.25)", color: "#F87171" }}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              {erro}
            </div>
          </div>
        )}

        {/* Sem resultados */}
        {semResultados && !erro && (
          <div className="px-5 py-8 text-center">
            <svg className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
              Nenhum contrato encontrado para <span style={{ color: "var(--text-primary)" }}>"{resultado?.numero_buscado}"</span>
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Verifique o número e tente novamente.
            </p>
          </div>
        )}

        {/* Resultados */}
        {resultado && totalEncontrados > 0 && (
          <div className="max-h-[60vh] overflow-y-auto px-4 py-4 space-y-3">
            {/* Header de resultados */}
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                {totalEncontrados} resultado{totalEncontrados !== 1 ? "s" : ""} para{" "}
                <span style={{ color: "var(--text-primary)" }}>"{resultado.numero_buscado}"</span>
              </p>
              {resultado.fontes_com_erro.length > 0 && (
                <p className="text-[10px]" style={{ color: "#F59E0B" }}>
                  ⚠ Falha em: {resultado.fontes_com_erro.join(", ")}
                </p>
              )}
            </div>

            {/* Seção Hope (prioridade máxima) */}
            {resultado.hope && (
              <section>
                <SectionLabel icon="⭐" label="Hope / Titan" sublabel="Prioridade" cor="#8B5CF6" />
                <ContratoCard contrato={resultado.hope} prioritario />
              </section>
            )}

            {/* Seção Storm */}
            {resultado.storm && (
              <section>
                <SectionLabel icon="⚡" label="Storm" sublabel="Complementar" cor="#3B82F6" />
                <ContratoCard contrato={resultado.storm} />
              </section>
            )}

            {/* Seção Local */}
            {resultado.local.length > 0 && (
              <section>
                <SectionLabel icon="🗄" label="Banco de Dados Local" sublabel={`${resultado.local.length} registro${resultado.local.length !== 1 ? "s" : ""}`} cor="#22C55E" />
                <div className="space-y-2">
                  {resultado.local.map((c) => (
                    <ContratoCard key={c.id} contrato={c} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Footer */}
        <div
          className="px-5 py-2.5 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--border)", backgroundColor: "var(--bg-primary)" }}
        >
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            Busca simultânea em Hope · Storm · Banco Local
          </p>
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: "var(--bg-mid)" }}>Enter</kbd>{" "}
            para buscar
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Helpers de UI ─────────────────────────────────────────────────────────────

function SectionLabel({ icon, label, sublabel, cor }: { icon: string; label: string; sublabel: string; cor: string }) {
  return (
    <div className="flex items-center gap-2 mb-2 mt-1">
      <span className="text-sm">{icon}</span>
      <p className="text-xs font-black uppercase tracking-widest" style={{ color: cor }}>
        {label}
      </p>
      <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
        · {sublabel}
      </span>
    </div>
  );
}

function FormatDica({
  cor,
  badge,
  exemplo,
  desc,
  prioridade,
}: {
  cor: string;
  badge: React.ReactNode;
  exemplo: string;
  desc: string;
  prioridade?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
      style={{ backgroundColor: "var(--bg-mid)", border: `1px solid ${cor}22` }}
    >
      {badge}
      <div className="flex-1 min-w-0">
        <code className="text-xs font-mono" style={{ color: cor }}>
          {exemplo}
        </code>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          {desc}
          {prioridade && <span className="ml-1.5 font-semibold" style={{ color: cor }}>• Prioridade</span>}
        </p>
      </div>
    </div>
  );
}
