import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getRegras, criarRegra, atualizarRegra, desativarRegra,
  getAuditoriaRegra, simularRegra,
} from "@/lib/api";
import Layout from "@/components/Layout";

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Regra {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: string;
  parametros: Record<string, any>;
  peso_score: number;
  bloqueante: boolean;
  shadow_mode: boolean;
  prioridade: number;
  ativo: boolean;
  versao: number;
  criado_por: string | null;
  atualizado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

interface LogAuditoriaItem {
  id: string;
  username: string | null;
  nome: string | null;
  acao: string;
  antes: Record<string, any> | null;
  depois: Record<string, any> | null;
  risco: string;
  criado_em: string;
}

interface RegraDisparada {
  regra_id: string;
  nome: string;
  tipo: string;
  score_contribuicao: number;
  bloqueante: boolean;
  motivo: string;
  detalhes: Record<string, any>;
  efeito: "REAL" | "SHADOW";
}

interface SimulacaoResultado {
  resultado: string;
  score: number;
  motivo_principal: string;
  flags: string[];
  regras_disparadas: RegraDisparada[];
}

// ── Constantes ───────────────────────────────────────────────────────────────

const TIPOS = [
  { value: "BLACKLIST",      label: "Blacklist de CPF" },
  { value: "VALOR_MAXIMO",   label: "Valor Máximo" },
  { value: "BANCO_CONVENIO", label: "Banco + Convênio Bloqueado" },
  { value: "UF_BLOQUEADA",   label: "UF Bloqueada" },
  { value: "SCORE_RISCO",    label: "Score de Risco" },
  { value: "LIMITE_DIARIO",  label: "Limite Diário por Corretor" },
];

const TIPO_FUTURO = { value: "LIMITE_CORRETOR_SHADOW", label: "Limite por Corretor (em breve)" };

const TIPO_LABEL: Record<string, string> = Object.fromEntries(
  [...TIPOS, TIPO_FUTURO].map((t) => [t.value, t.label])
);

const UFS_BR = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

function defaultParams(tipo: string): Record<string, any> {
  switch (tipo) {
    case "VALOR_MAXIMO":   return { valor_maximo: 50000 };
    case "BANCO_CONVENIO": return { combinacoes: [{ banco: "", convenio: "" }] };
    case "UF_BLOQUEADA":   return { ufs: [] };
    case "SCORE_RISCO":    return { valor_medio_referencia: 10000 };
    case "LIMITE_DIARIO":  return { limite_valor_diario: 100000 };
    default:               return {};
  }
}

function buildParametros(tipo: string, params: Record<string, any>): Record<string, any> {
  switch (tipo) {
    case "VALOR_MAXIMO":   return { valor_maximo: Number(params.valor_maximo) || 0 };
    case "BANCO_CONVENIO": return { combinacoes: params.combinacoes || [] };
    case "UF_BLOQUEADA":   return { ufs: params.ufs || [] };
    case "SCORE_RISCO":    return { valor_medio_referencia: Number(params.valor_medio_referencia) || 10000 };
    case "LIMITE_DIARIO":  return { limite_valor_diario: Number(params.limite_valor_diario) || 0 };
    default:               return {};
  }
}

function resumoParametros(tipo: string, params: any): string {
  if (!params) return "—";
  switch (tipo) {
    case "BLACKLIST":      return "Automático (consulta blacklist)";
    case "VALOR_MAXIMO":   return `Até R$ ${Number(params.valor_maximo || 0).toLocaleString("pt-BR")}`;
    case "BANCO_CONVENIO": return `${(params.combinacoes || []).length} combinação(ões)`;
    case "UF_BLOQUEADA":   return (params.ufs || []).length ? (params.ufs as string[]).join(", ") : "Nenhuma";
    case "SCORE_RISCO":    return `Ref: R$ ${Number(params.valor_medio_referencia || 0).toLocaleString("pt-BR")}`;
    case "LIMITE_DIARIO":  return `R$ ${Number(params.limite_valor_diario || 0).toLocaleString("pt-BR")}/dia`;
    default:               return JSON.stringify(params);
  }
}

function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function fmtDataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return iso; }
}

const inputCls = {
  backgroundColor: "var(--bg-mid)", color: "var(--text-primary)",
  border: "1px solid var(--border)", borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem", fontSize: "0.875rem", width: "100%", outline: "none",
};

const focusRed = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
  (e.target.style.borderColor = "#DC2626");
const blurBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
  (e.target.style.borderColor = "var(--border)");

// ── Badges ───────────────────────────────────────────────────────────────────

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap"
      style={{ backgroundColor: bg, color }}>
      {label}
    </span>
  );
}

function StatusBadge({ ativo }: { ativo: boolean }) {
  return ativo
    ? <Badge label="Ativa" bg="rgba(34,197,94,0.15)" color="#22c55e" />
    : <Badge label="Inativa" bg="rgba(148,163,184,0.15)" color="#94a3b8" />;
}

function BloqueanteBadge({ bloqueante }: { bloqueante: boolean }) {
  if (!bloqueante) return <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>;
  return <Badge label="Bloqueante" bg="rgba(239,68,68,0.15)" color="#ef4444" />;
}

function ShadowBadge({ shadow }: { shadow: boolean }) {
  if (!shadow) return <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>;
  return <Badge label="Shadow" bg="rgba(168,85,247,0.15)" color="#a855f7" />;
}

function CriticaBadge() {
  return <Badge label="Crítica" bg="rgba(220,38,38,0.15)" color="#DC2626" />;
}

function EfeitoBadge({ efeito }: { efeito: "REAL" | "SHADOW" }) {
  return efeito === "SHADOW"
    ? <Badge label="Shadow" bg="rgba(168,85,247,0.15)" color="#a855f7" />
    : <Badge label="Real" bg="rgba(96,165,250,0.15)" color="#60a5fa" />;
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="rounded-xl p-5 flex flex-col gap-1 flex-1 min-w-[150px]"
      style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
      <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{value}</p>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
      {sub && <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{sub}</p>}
    </div>
  );
}

// ── Campos dinâmicos por tipo ────────────────────────────────────────────────

function CamposParametros({ tipo, params, onChange }: {
  tipo: string;
  params: Record<string, any>;
  onChange: (p: Record<string, any>) => void;
}) {
  if (tipo === "LIMITE_CORRETOR_SHADOW") {
    return (
      <div className="flex items-start gap-3 p-3 rounded-lg"
        style={{ backgroundColor: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.25)" }}>
        <span className="text-base mt-0.5" style={{ color: "#a855f7" }}>⏳</span>
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Preparado no schema (enum <code>tipo_regra</code>), mas ainda sem avaliador no motor —
          depende do vínculo Corretor × Esteira (Fase 2). Uma regra deste tipo é aceita mas nunca dispara hoje.
        </p>
      </div>
    );
  }

  if (tipo === "BLACKLIST") {
    return (
      <div className="flex items-start gap-3 p-3 rounded-lg"
        style={{ backgroundColor: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.2)" }}>
        <span className="text-base mt-0.5" style={{ color: "#34d399" }}>✓</span>
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Verifica automaticamente se o CPF do cliente está na lista de bloqueados.
          Nenhum parâmetro necessário — basta salvar a regra.
        </p>
      </div>
    );
  }

  if (tipo === "VALOR_MAXIMO") {
    return (
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider mb-1 block"
          style={{ color: "var(--text-muted)" }}>Valor máximo permitido (R$)</label>
        <input type="number" value={params.valor_maximo ?? ""} min={0}
          onChange={(e) => onChange({ valor_maximo: e.target.value })}
          placeholder="Ex: 50000" style={inputCls} onFocus={focusRed} onBlur={blurBorder} />
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          Propostas com valor acima deste limite serão sinalizadas.
        </p>
      </div>
    );
  }

  if (tipo === "LIMITE_DIARIO") {
    return (
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider mb-1 block"
          style={{ color: "var(--text-muted)" }}>Limite diário por corretor (R$)</label>
        <input type="number" value={params.limite_valor_diario ?? ""} min={0}
          onChange={(e) => onChange({ limite_valor_diario: e.target.value })}
          placeholder="Ex: 100000" style={inputCls} onFocus={focusRed} onBlur={blurBorder} />
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          Total aprovado por um corretor em um único dia não pode ultrapassar este valor.
        </p>
      </div>
    );
  }

  if (tipo === "SCORE_RISCO") {
    return (
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider mb-1 block"
          style={{ color: "var(--text-muted)" }}>Valor médio de referência (R$)</label>
        <input type="number" value={params.valor_medio_referencia ?? ""} min={0}
          onChange={(e) => onChange({ valor_medio_referencia: e.target.value })}
          placeholder="Ex: 10000" style={inputCls} onFocus={focusRed} onBlur={blurBorder} />
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          Propostas com valor 3× acima desta referência recebem pontuação de risco adicional.
        </p>
      </div>
    );
  }

  if (tipo === "UF_BLOQUEADA") {
    const ufs: string[] = params.ufs || [];
    const toggle = (uf: string) => {
      const novo = ufs.includes(uf) ? ufs.filter((u) => u !== uf) : [...ufs, uf];
      onChange({ ufs: novo });
    };
    return (
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider mb-2 block"
          style={{ color: "var(--text-muted)" }}>
          Estados bloqueados{ufs.length > 0 ? ` — ${ufs.length} selecionado${ufs.length > 1 ? "s" : ""}` : ""}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {UFS_BR.map((uf) => {
            const sel = ufs.includes(uf);
            return (
              <button key={uf} type="button" onClick={() => toggle(uf)}
                className="px-2.5 py-1 rounded text-xs font-bold transition-all"
                style={{
                  backgroundColor: sel ? "#DC2626" : "var(--bg-subtle)",
                  color: sel ? "white" : "var(--text-secondary)",
                  border: `1px solid ${sel ? "#DC2626" : "var(--border)"}`,
                }}>
                {uf}
              </button>
            );
          })}
        </div>
        {ufs.length === 0 && (
          <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
            Clique nos estados que devem ser bloqueados.
          </p>
        )}
      </div>
    );
  }

  if (tipo === "BANCO_CONVENIO") {
    const combinacoes: { banco: string; convenio: string }[] = params.combinacoes || [];
    const add = () => onChange({ combinacoes: [...combinacoes, { banco: "", convenio: "" }] });
    const remove = (i: number) => onChange({ combinacoes: combinacoes.filter((_, idx) => idx !== i) });
    const update = (i: number, field: "banco" | "convenio", val: string) =>
      onChange({ combinacoes: combinacoes.map((c, idx) => idx === i ? { ...c, [field]: val } : c) });
    return (
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider mb-1 block"
          style={{ color: "var(--text-muted)" }}>Combinações banco + convênio bloqueadas</label>
        {combinacoes.map((combo, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input value={combo.banco}
              onChange={(e) => update(i, "banco", e.target.value)}
              placeholder='Banco (ou * para todos)'
              style={{ ...inputCls, flex: 1, width: "auto" }} onFocus={focusRed} onBlur={blurBorder} />
            <input value={combo.convenio}
              onChange={(e) => update(i, "convenio", e.target.value)}
              placeholder='Convênio (ou * para todos)'
              style={{ ...inputCls, flex: 1, width: "auto" }} onFocus={focusRed} onBlur={blurBorder} />
            {combinacoes.length > 1 && (
              <button type="button" onClick={() => remove(i)}
                className="text-xs px-2 py-1 rounded whitespace-nowrap transition-opacity hover:opacity-80"
                style={{ color: "#f87171", backgroundColor: "rgba(248,113,113,0.1)" }}>
                Remover
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={add}
          className="text-xs px-3 py-1.5 rounded font-medium transition-opacity hover:opacity-80"
          style={{ color: "#DC2626", backgroundColor: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)" }}>
          + Adicionar combinação
        </button>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Use * para bloquear qualquer banco ou qualquer convênio naquela posição.
        </p>
      </div>
    );
  }

  return null;
}

// ── Drawer: Nova / Editar regra ──────────────────────────────────────────────

const FORM_VAZIO = {
  nome: "", descricao: "", tipo: "VALOR_MAXIMO",
  params: defaultParams("VALOR_MAXIMO"),
  peso_score: 30, bloqueante: false, shadow_mode: false, prioridade: 100,
};

function RegraDrawer({ regraEditando, onClose, onSaved }: {
  regraEditando: Regra | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editando = !!regraEditando;
  const [form, setForm] = useState(() =>
    regraEditando
      ? {
          nome: regraEditando.nome, descricao: regraEditando.descricao ?? "",
          tipo: regraEditando.tipo, params: regraEditando.parametros ?? {},
          peso_score: regraEditando.peso_score, bloqueante: regraEditando.bloqueante,
          shadow_mode: regraEditando.shadow_mode, prioridade: regraEditando.prioridade,
        }
      : FORM_VAZIO
  );
  const [modoJson, setModoJson] = useState(false);
  const [jsonTexto, setJsonTexto] = useState(() => JSON.stringify(form.params, null, 2));
  const [jsonErro, setJsonErro] = useState("");
  const [erro, setErro] = useState("");
  const qc = useQueryClient();

  const mutSalvar = useMutation({
    mutationFn: () => {
      const parametros = modoJson ? JSON.parse(jsonTexto) : buildParametros(form.tipo, form.params);
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        tipo: form.tipo,
        parametros,
        peso_score: form.peso_score,
        bloqueante: form.bloqueante,
        shadow_mode: form.shadow_mode,
        prioridade: form.prioridade,
      };
      return editando ? atualizarRegra(regraEditando!.id, payload) : criarRegra(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["regras"] });
      onSaved();
    },
    onError: (e: any) => setErro(e?.response?.data?.detail?.[0]?.msg ?? e?.response?.data?.detail ?? e.message ?? "Erro ao salvar"),
  });

  const handleTipoChange = (novoTipo: string) => {
    const novo = { ...form, tipo: novoTipo, params: defaultParams(novoTipo) };
    setForm(novo);
    setJsonTexto(JSON.stringify(novo.params, null, 2));
  };

  const toggleJsonMode = () => {
    if (!modoJson) {
      setJsonTexto(JSON.stringify(buildParametros(form.tipo, form.params), null, 2));
      setJsonErro("");
    } else {
      try {
        const parsed = JSON.parse(jsonTexto);
        setForm({ ...form, params: parsed });
        setJsonErro("");
      } catch {
        setJsonErro("JSON inválido — corrija antes de voltar ao modo visual");
        return;
      }
    }
    setModoJson(!modoJson);
  };

  const validar = (): string | null => {
    if (!form.nome.trim()) return "Nome é obrigatório";
    if (form.peso_score < 0) return "Peso não pode ser negativo";
    if (form.prioridade < 1) return "Prioridade deve ser >= 1";
    if (modoJson) {
      try { JSON.parse(jsonTexto); } catch { return "JSON de parâmetros inválido"; }
    }
    return null;
  };

  const salvar = () => {
    const msg = validar();
    if (msg) { setErro(msg); return; }
    setErro("");
    mutSalvar.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-lg h-full flex flex-col" style={{ backgroundColor: "var(--bg-card)", borderLeft: "1px solid var(--border-mid)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="font-black text-sm uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>
            {editando ? "Editar regra" : "Nova regra"}
          </h2>
          <button onClick={onClose} className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>✕ Fechar</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Nome</label>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Limite máximo INSS" style={inputCls} onFocus={focusRed} onBlur={blurBorder} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Descrição</label>
              <input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Opcional — contexto para outros analistas" style={inputCls} onFocus={focusRed} onBlur={blurBorder} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Tipo de regra</label>
              <select value={form.tipo} onChange={(e) => handleTipoChange(e.target.value)} style={inputCls} onFocus={focusRed} onBlur={blurBorder}>
                {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                <option value={TIPO_FUTURO.value}>{TIPO_FUTURO.label}</option>
              </select>
            </div>
          </div>

          <div className="p-4 rounded-lg" style={{ backgroundColor: "var(--bg-subtle)", border: "1px solid var(--border-mid)" }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Parâmetros</p>
              <button type="button" onClick={toggleJsonMode}
                className="text-[10px] font-semibold px-2 py-1 rounded"
                style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-secondary)" }}>
                {modoJson ? "← Modo visual" : "Modo avançado (JSON)"}
              </button>
            </div>
            {modoJson ? (
              <div>
                <textarea value={jsonTexto} onChange={(e) => setJsonTexto(e.target.value)}
                  rows={8} spellCheck={false}
                  style={{ ...inputCls, fontFamily: "monospace", fontSize: "0.75rem" }}
                  onFocus={focusRed} onBlur={blurBorder} />
                {jsonErro && <p className="text-xs mt-1" style={{ color: "#f87171" }}>{jsonErro}</p>}
              </div>
            ) : (
              <CamposParametros tipo={form.tipo} params={form.params} onChange={(p) => setForm({ ...form, params: p })} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Peso no score de risco</label>
              <input type="number" value={form.peso_score} min={0} max={100}
                onChange={(e) => setForm({ ...form, peso_score: +e.target.value })}
                style={inputCls} onFocus={focusRed} onBlur={blurBorder} />
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Pontos somados ao score quando disparar (0–100).</p>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Prioridade</label>
              <input type="number" value={form.prioridade} min={1}
                onChange={(e) => setForm({ ...form, prioridade: +e.target.value })}
                style={inputCls} onFocus={focusRed} onBlur={blurBorder} />
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Menor número = avaliada primeiro.</p>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
            <div className="relative">
              <input type="checkbox" className="sr-only peer" checked={form.bloqueante}
                onChange={(e) => setForm({ ...form, bloqueante: e.target.checked })} />
              <div className="w-10 h-5 rounded-full transition-colors" style={{ backgroundColor: form.bloqueante ? "#DC2626" : "var(--border)" }} />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm"
                style={{ transform: form.bloqueante ? "translateX(20px)" : "translateX(0)" }} />
            </div>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Bloqueante</span> — bloqueia a proposta imediatamente ao disparar
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
            <div className="relative">
              <input type="checkbox" className="sr-only peer" checked={form.shadow_mode}
                onChange={(e) => setForm({ ...form, shadow_mode: e.target.checked })} />
              <div className="w-10 h-5 rounded-full transition-colors" style={{ backgroundColor: form.shadow_mode ? "#a855f7" : "var(--border)" }} />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm"
                style={{ transform: form.shadow_mode ? "translateX(20px)" : "translateX(0)" }} />
            </div>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Shadow Mode</span> — avalia e registra, mas nunca soma score nem bloqueia
            </span>
          </label>

          {form.bloqueante && form.shadow_mode && (
            <p className="text-xs p-2 rounded" style={{ backgroundColor: "rgba(234,179,8,0.1)", color: "#eab308" }}>
              Shadow Mode sempre vence: mesmo marcada como bloqueante, esta regra não vai bloquear nada enquanto Shadow Mode estiver ativo.
            </p>
          )}

          {erro && <p className="text-xs" style={{ color: "#f87171" }}>{erro}</p>}
        </div>

        <div className="p-5 flex gap-2" style={{ borderTop: "1px solid var(--border)" }}>
          <button onClick={salvar} disabled={mutSalvar.isPending}
            className="px-5 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ backgroundColor: "#DC2626" }}>
            {mutSalvar.isPending ? "Salvando..." : "Salvar regra"}
          </button>
          <button onClick={onClose} className="px-5 py-2 text-sm font-medium transition-opacity hover:opacity-70" style={{ color: "var(--text-muted)" }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Painel: Histórico da regra ───────────────────────────────────────────────

function HistoricoDrawer({ regra, onClose }: { regra: Regra; onClose: () => void }) {
  const { data: historico = [], isLoading } = useQuery<LogAuditoriaItem[]>({
    queryKey: ["regra-auditoria", regra.id],
    queryFn: () => getAuditoriaRegra(regra.id),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-lg h-full flex flex-col" style={{ backgroundColor: "var(--bg-card)", borderLeft: "1px solid var(--border-mid)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="p-5" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-black" style={{ color: "var(--text-primary)" }}>Histórico da regra</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{regra.nome}</p>
            </div>
            <button onClick={onClose} className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>✕ Fechar</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading && <p className="text-xs text-center py-8" style={{ color: "var(--text-muted)" }}>Carregando...</p>}
          {!isLoading && historico.length === 0 && (
            <p className="text-xs text-center py-8" style={{ color: "var(--text-muted)" }}>Nenhum evento de auditoria registrado ainda.</p>
          )}
          {historico.map((h) => (
            <div key={h.id} className="rounded-lg p-3" style={{ backgroundColor: "var(--bg-mid)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{h.acao}</p>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{fmtData(h.criado_em)}</span>
              </div>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                por {h.nome || h.username || "sistema"}
              </p>
              {h.antes && h.depois && (
                <details className="mt-2">
                  <summary className="text-[10px] cursor-pointer" style={{ color: "#60a5fa" }}>Ver alterações</summary>
                  <pre className="text-[9px] mt-1 overflow-x-auto p-2 rounded" style={{ backgroundColor: "var(--bg-subtle)", color: "var(--text-muted)" }}>
                    {JSON.stringify({ antes: h.antes, depois: h.depois }, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Aba: Simulador ────────────────────────────────────────────────────────────

const SIM_VAZIO = { cpf_cliente: "", banco: "SIMULACAO", convenio: "", uf_cliente: "", produto: "", valor: "" };

function SimuladorTab() {
  const [form, setForm] = useState(SIM_VAZIO);
  const [erro, setErro] = useState("");

  const mutSimular = useMutation({
    mutationFn: () => simularRegra({
      cpf_cliente: form.cpf_cliente,
      banco: form.banco || "SIMULACAO",
      convenio: form.convenio || null,
      uf_cliente: form.uf_cliente || null,
      produto: form.produto || null,
      valor: Number(form.valor),
    }),
    onError: (e: any) => setErro(e?.response?.data?.detail?.[0]?.msg ?? e?.response?.data?.detail ?? e.message ?? "Erro ao simular"),
  });

  const executar = () => {
    setErro("");
    if (!form.cpf_cliente.trim()) { setErro("Informe um CPF (só para teste — nada é persistido)"); return; }
    if (!form.valor || Number(form.valor) <= 0) { setErro("Informe um valor positivo"); return; }
    mutSimular.mutate();
  };

  const resultado: SimulacaoResultado | undefined = mutSimular.data;

  const resultadoMeta: Record<string, { label: string; bg: string; color: string }> = {
    BLOQUEADO: { label: "Bloqueado", bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
    MANUAL:    { label: "Análise Manual", bg: "rgba(234,179,8,0.15)", color: "#eab308" },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <p className="text-xs font-black uppercase tracking-widest" style={{ color: "#DC2626" }}>Dados da simulação</p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Executa o mesmo motor antifraude de produção contra uma proposta fictícia. Nada é salvo no banco.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>CPF (fictício)</label>
            <input value={form.cpf_cliente} onChange={(e) => setForm({ ...form, cpf_cliente: e.target.value })}
              placeholder="00000000000" style={inputCls} onFocus={focusRed} onBlur={blurBorder} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Banco</label>
            <input value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} style={inputCls} onFocus={focusRed} onBlur={blurBorder} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Convênio</label>
            <input value={form.convenio} onChange={(e) => setForm({ ...form, convenio: e.target.value })} placeholder="Ex: INSS" style={inputCls} onFocus={focusRed} onBlur={blurBorder} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>UF</label>
            <select value={form.uf_cliente} onChange={(e) => setForm({ ...form, uf_cliente: e.target.value })} style={inputCls} onFocus={focusRed} onBlur={blurBorder}>
              <option value="">—</option>
              {UFS_BR.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Produto</label>
            <input value={form.produto} onChange={(e) => setForm({ ...form, produto: e.target.value })} style={inputCls} onFocus={focusRed} onBlur={blurBorder} />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wider mb-1 block" style={{ color: "var(--text-muted)" }}>Valor (R$)</label>
            <input type="number" min={0} value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })}
              placeholder="Ex: 25000" style={inputCls} onFocus={focusRed} onBlur={blurBorder} />
          </div>
        </div>
        {erro && <p className="text-xs" style={{ color: "#f87171" }}>{erro}</p>}
        <button onClick={executar} disabled={mutSimular.isPending}
          className="px-5 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ backgroundColor: "#DC2626" }}>
          {mutSimular.isPending ? "Executando..." : "▶ Executar simulação"}
        </button>
      </div>

      <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <p className="text-xs font-black uppercase tracking-widest" style={{ color: "#DC2626" }}>Resultado</p>
        {!resultado && !mutSimular.isPending && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Preencha os dados ao lado e execute a simulação.</p>
        )}
        {resultado && (
          <>
            <div className="flex items-center gap-3">
              {(() => { const m = resultadoMeta[resultado.resultado] ?? { label: resultado.resultado, bg: "var(--bg-mid)", color: "var(--text-muted)" };
                return <Badge label={m.label} bg={m.bg} color={m.color} />; })()}
              <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Score: {resultado.score}/100</span>
            </div>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{resultado.motivo_principal}</p>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
                Regras disparadas ({resultado.regras_disparadas.length})
              </p>
              {resultado.regras_disparadas.length === 0 && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Nenhuma regra disparou para estes dados.</p>
              )}
              <div className="space-y-2">
                {resultado.regras_disparadas.map((r) => (
                  <div key={r.regra_id} className="rounded-lg p-3" style={{ backgroundColor: "var(--bg-mid)" }}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{r.nome}</span>
                      <div className="flex items-center gap-1.5">
                        <EfeitoBadge efeito={r.efeito} />
                        <BloqueanteBadge bloqueante={r.bloqueante} />
                      </div>
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                      {TIPO_LABEL[r.tipo] ?? r.tipo} · impacto no score: +{r.score_contribuicao}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{r.motivo}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function RegrasPage() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<"regras" | "simulador">("regras");
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [regraEditando, setRegraEditando] = useState<Regra | null>(null);
  const [regraHistorico, setRegraHistorico] = useState<Regra | null>(null);

  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"" | "ativa" | "inativa">("");
  const [filtroBloqueante, setFiltroBloqueante] = useState<"" | "sim" | "nao">("");
  const [filtroShadow, setFiltroShadow] = useState<"" | "sim" | "nao">("");
  const [filtroCriador, setFiltroCriador] = useState("");

  const { data: regras = [], isLoading } = useQuery<Regra[]>({
    queryKey: ["regras"],
    queryFn: () => getRegras(),
  });

  const mutDesativar = useMutation({
    mutationFn: desativarRegra,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["regras"] }),
  });
  const mutAtivar = useMutation({
    mutationFn: (id: string) => atualizarRegra(id, { ativo: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["regras"] }),
  });

  // ── KPIs ──
  const kpis = useMemo(() => {
    const total = regras.length;
    const ativas = regras.filter((r) => r.ativo).length;
    const bloqueantes = regras.filter((r) => r.bloqueante && !r.shadow_mode).length;
    const shadow = regras.filter((r) => r.shadow_mode).length;
    const ultimaAlteracao = regras.reduce<string | null>((max, r) => {
      if (!r.atualizado_em) return max;
      return !max || r.atualizado_em > max ? r.atualizado_em : max;
    }, null);
    return { total, ativas, bloqueantes, shadow, ultimaAlteracao };
  }, [regras]);

  // ── Filtros ──
  const regrasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return regras.filter((r) => {
      if (q && !r.nome.toLowerCase().includes(q) && !(r.descricao ?? "").toLowerCase().includes(q)) return false;
      if (filtroTipo && r.tipo !== filtroTipo) return false;
      if (filtroStatus === "ativa" && !r.ativo) return false;
      if (filtroStatus === "inativa" && r.ativo) return false;
      if (filtroBloqueante === "sim" && !r.bloqueante) return false;
      if (filtroBloqueante === "nao" && r.bloqueante) return false;
      if (filtroShadow === "sim" && !r.shadow_mode) return false;
      if (filtroShadow === "nao" && r.shadow_mode) return false;
      if (filtroCriador.trim() && !(r.criado_por ?? "").toLowerCase().includes(filtroCriador.trim().toLowerCase())) return false;
      return true;
    });
  }, [regras, busca, filtroTipo, filtroStatus, filtroBloqueante, filtroShadow, filtroCriador]);

  const abrirNova = () => { setRegraEditando(null); setDrawerAberto(true); };
  const abrirEdicao = (r: Regra) => { setRegraEditando(r); setDrawerAberto(true); };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto flex flex-col gap-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>
              Regras Antifraude
            </h1>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Configuração do Motor Antifraude e Monitoramento de Risco
            </p>
          </div>
          {aba === "regras" && (
            <button onClick={abrirNova}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white uppercase transition-opacity hover:opacity-80"
              style={{ backgroundColor: "#DC2626", boxShadow: "0 4px 14px rgba(220,38,38,0.3)" }}>
              + Nova Regra
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
          {[{ id: "regras", label: "Regras" }, { id: "simulador", label: "Simulador" }].map((t) => (
            <button key={t.id} onClick={() => setAba(t.id as any)}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wide"
              style={{
                color: aba === t.id ? "#DC2626" : "var(--text-muted)",
                borderBottom: aba === t.id ? "2px solid #DC2626" : "2px solid transparent",
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {aba === "simulador" ? (
          <SimuladorTab />
        ) : (
          <>
            {/* KPIs */}
            <div className="flex flex-wrap gap-4">
              <StatCard label="Total de Regras" value={kpis.total} color="#8B5CF6" />
              <StatCard label="Regras Ativas" value={kpis.ativas} color="#22C55E" />
              <StatCard label="Regras Bloqueantes" value={kpis.bloqueantes} color="#EF4444" sub="bloqueante e fora do shadow" />
              <StatCard label="Em Shadow Mode" value={kpis.shadow} color="#A855F7" />
              <StatCard label="Última Alteração" value={fmtDataCurta(kpis.ultimaAlteracao)} color="#60A5FA" />
            </div>

            {/* Filtros */}
            <div className="rounded-xl p-4 flex flex-wrap gap-3" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou descrição..."
                className="flex-1 min-w-[200px]" style={inputCls} onFocus={focusRed} onBlur={blurBorder} />
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={{ ...inputCls, width: "auto" }} onFocus={focusRed} onBlur={blurBorder}>
                <option value="">Todos os tipos</option>
                {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                <option value={TIPO_FUTURO.value}>{TIPO_FUTURO.label}</option>
              </select>
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as any)} style={{ ...inputCls, width: "auto" }} onFocus={focusRed} onBlur={blurBorder}>
                <option value="">Ativa/Inativa</option>
                <option value="ativa">Somente ativas</option>
                <option value="inativa">Somente inativas</option>
              </select>
              <select value={filtroBloqueante} onChange={(e) => setFiltroBloqueante(e.target.value as any)} style={{ ...inputCls, width: "auto" }} onFocus={focusRed} onBlur={blurBorder}>
                <option value="">Bloqueante</option>
                <option value="sim">Somente bloqueantes</option>
                <option value="nao">Não bloqueantes</option>
              </select>
              <select value={filtroShadow} onChange={(e) => setFiltroShadow(e.target.value as any)} style={{ ...inputCls, width: "auto" }} onFocus={focusRed} onBlur={blurBorder}>
                <option value="">Shadow Mode</option>
                <option value="sim">Somente shadow</option>
                <option value="nao">Fora de shadow</option>
              </select>
              <input value={filtroCriador} onChange={(e) => setFiltroCriador(e.target.value)} placeholder="Criador (usuário)..."
                style={{ ...inputCls, width: "auto" }} onFocus={focusRed} onBlur={blurBorder} />
            </div>

            {/* Tabela */}
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-subtle)" }}>
                      {["Nome", "Tipo", "Descrição", "Peso", "Bloqueante", "Status", "Shadow", "Criada em", "Última alteração", ""].map((h, i) => (
                        <th key={i} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-left whitespace-nowrap"
                          style={{ color: "var(--text-muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading && (
                      <tr><td colSpan={10} className="text-center py-10 text-sm" style={{ color: "var(--text-muted)" }}>Carregando...</td></tr>
                    )}
                    {!isLoading && regrasFiltradas.length === 0 && (
                      <tr><td colSpan={10} className="text-center py-10 text-sm" style={{ color: "var(--text-muted)" }}>Nenhuma regra encontrada.</td></tr>
                    )}
                    {regrasFiltradas.map((r, idx) => {
                      const critica = r.bloqueante && !r.shadow_mode && r.peso_score >= 80;
                      return (
                        <tr key={r.id} style={{
                          backgroundColor: idx % 2 === 0 ? "var(--bg-row-even)" : "var(--bg-row-odd)",
                          borderBottom: "1px solid var(--border-mid)",
                        }}>
                          <td className="px-4 py-3 font-medium text-xs" style={{ color: "var(--text-primary)" }}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {r.nome}
                              {critica && <CriticaBadge />}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded whitespace-nowrap"
                              style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626" }}>
                              {TIPO_LABEL[r.tipo] ?? r.tipo}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs max-w-[220px] truncate" style={{ color: "var(--text-secondary)" }} title={r.descricao ?? resumoParametros(r.tipo, r.parametros)}>
                            {r.descricao || resumoParametros(r.tipo, r.parametros)}
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>{r.peso_score}</td>
                          <td className="px-4 py-3"><BloqueanteBadge bloqueante={r.bloqueante} /></td>
                          <td className="px-4 py-3"><StatusBadge ativo={r.ativo} /></td>
                          <td className="px-4 py-3"><ShadowBadge shadow={r.shadow_mode} /></td>
                          <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{fmtDataCurta(r.criado_em)}</td>
                          <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{fmtDataCurta(r.atualizado_em)}</td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button onClick={() => setRegraHistorico(r)}
                                className="text-[10px] px-2 py-1 rounded transition-opacity hover:opacity-80"
                                style={{ color: "#60a5fa", backgroundColor: "rgba(96,165,250,0.1)" }}>
                                Histórico
                              </button>
                              <button onClick={() => abrirEdicao(r)}
                                className="text-[10px] px-2 py-1 rounded transition-opacity hover:opacity-80"
                                style={{ color: "var(--text-primary)", backgroundColor: "var(--bg-mid)" }}>
                                Editar
                              </button>
                              {r.ativo ? (
                                <button onClick={() => mutDesativar.mutate(r.id)}
                                  className="text-[10px] px-2 py-1 rounded transition-opacity hover:opacity-80"
                                  style={{ color: "#f87171", backgroundColor: "rgba(248,113,113,0.1)" }}>
                                  Desativar
                                </button>
                              ) : (
                                <button onClick={() => mutAtivar.mutate(r.id)}
                                  className="text-[10px] px-2 py-1 rounded transition-opacity hover:opacity-80"
                                  style={{ color: "#22c55e", backgroundColor: "rgba(34,197,94,0.1)" }}>
                                  Ativar
                                </button>
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
          </>
        )}
      </div>

      {drawerAberto && (
        <RegraDrawer
          regraEditando={regraEditando}
          onClose={() => setDrawerAberto(false)}
          onSaved={() => setDrawerAberto(false)}
        />
      )}
      {regraHistorico && (
        <HistoricoDrawer regra={regraHistorico} onClose={() => setRegraHistorico(null)} />
      )}
    </Layout>
  );
}
