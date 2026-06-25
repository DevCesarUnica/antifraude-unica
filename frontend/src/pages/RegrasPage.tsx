import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getRegras, criarRegra, desativarRegra } from "@/lib/api";
import Layout from "@/components/Layout";

const TIPOS = [
  { value: "BLACKLIST",      label: "Blacklist de CPF" },
  { value: "VALOR_MAXIMO",   label: "Valor Máximo" },
  { value: "BANCO_CONVENIO", label: "Banco + Convênio Bloqueado" },
  { value: "UF_BLOQUEADA",   label: "UF Bloqueada" },
  { value: "SCORE_RISCO",    label: "Score de Risco" },
  { value: "LIMITE_DIARIO",  label: "Limite Diário" },
];

const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map(t => [t.value, t.label]));

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
    case "BLACKLIST":      return "Automático";
    case "VALOR_MAXIMO":   return `Até R$ ${Number(params.valor_maximo || 0).toLocaleString("pt-BR")}`;
    case "BANCO_CONVENIO": return `${(params.combinacoes || []).length} combinação(ões)`;
    case "UF_BLOQUEADA":   return (params.ufs || []).length ? (params.ufs as string[]).join(", ") : "Nenhuma";
    case "SCORE_RISCO":    return `Ref: R$ ${Number(params.valor_medio_referencia || 0).toLocaleString("pt-BR")}`;
    case "LIMITE_DIARIO":  return `R$ ${Number(params.limite_valor_diario || 0).toLocaleString("pt-BR")}/dia`;
    default:               return JSON.stringify(params);
  }
}

const inputCls = {
  backgroundColor: "var(--bg-mid)", color: "var(--text-primary)",
  border: "1px solid var(--border)", borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem", fontSize: "0.875rem", width: "100%", outline: "none",
};

const focusRed = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) =>
  (e.target.style.borderColor = "#DC2626");
const blurBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) =>
  (e.target.style.borderColor = "var(--border)");

// ── Campos dinâmicos por tipo ────────────────────────────────────────────────

function CamposParametros({ tipo, params, onChange }: {
  tipo: string;
  params: Record<string, any>;
  onChange: (p: Record<string, any>) => void;
}) {
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

// ── Componente principal ─────────────────────────────────────────────────────

const FORM_VAZIO = {
  nome: "", tipo: "VALOR_MAXIMO",
  params: defaultParams("VALOR_MAXIMO"),
  peso_score: 30, bloqueante: false, prioridade: 100,
};

export default function RegrasPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [erro, setErro] = useState("");

  const { data: regras = [], isLoading } = useQuery({
    queryKey: ["regras"],
    queryFn: () => getRegras(),
  });

  const mutCriar = useMutation({
    mutationFn: () =>
      criarRegra({ ...form, parametros: buildParametros(form.tipo, form.params) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["regras"] });
      setShowForm(false);
      setForm(FORM_VAZIO);
      setErro("");
    },
    onError: (e: any) => setErro(e?.response?.data?.detail ?? e.message ?? "Erro ao salvar"),
  });

  const mutDesativar = useMutation({
    mutationFn: desativarRegra,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["regras"] }),
  });

  const handleTipoChange = (novoTipo: string) => {
    setForm({ ...form, tipo: novoTipo, params: defaultParams(novoTipo) });
  };

  return (
    <Layout>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black uppercase tracking-wide"
              style={{ color: "var(--text-primary)" }}>Regras Antifraude</h1>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Configuradas no banco — sem deploy para alterar
            </p>
          </div>
          {!showForm && (
            <button onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-80"
              style={{ backgroundColor: "#DC2626", boxShadow: "0 4px 14px rgba(220,38,38,0.3)" }}>
              + Nova Regra
            </button>
          )}
        </div>

        {showForm && (
          <div className="rounded-xl p-6 space-y-5"
            style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="font-bold text-sm uppercase tracking-wide"
              style={{ color: "var(--text-primary)" }}>Nova regra</h2>

            {/* Nome + Tipo */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block"
                  style={{ color: "var(--text-muted)" }}>Nome</label>
                <input value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: Limite máximo INSS"
                  style={inputCls} onFocus={focusRed} onBlur={blurBorder} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block"
                  style={{ color: "var(--text-muted)" }}>Tipo de regra</label>
                <select value={form.tipo} onChange={(e) => handleTipoChange(e.target.value)}
                  style={inputCls} onFocus={focusRed} onBlur={blurBorder}>
                  {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            {/* Parâmetros dinâmicos */}
            <div className="p-4 rounded-lg" style={{ backgroundColor: "var(--bg-subtle)", border: "1px solid var(--border-mid)" }}>
              <CamposParametros
                tipo={form.tipo}
                params={form.params}
                onChange={(p) => setForm({ ...form, params: p })}
              />
            </div>

            {/* Peso + Prioridade + Bloqueante */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block"
                  style={{ color: "var(--text-muted)" }}>Peso no score de risco</label>
                <input type="number" value={form.peso_score} min={0} max={100}
                  onChange={(e) => setForm({ ...form, peso_score: +e.target.value })}
                  style={inputCls} onFocus={focusRed} onBlur={blurBorder} />
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Pontos somados ao score quando esta regra disparar (0–100).
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider mb-1 block"
                  style={{ color: "var(--text-muted)" }}>Prioridade</label>
                <input type="number" value={form.prioridade} min={1}
                  onChange={(e) => setForm({ ...form, prioridade: +e.target.value })}
                  style={inputCls} onFocus={focusRed} onBlur={blurBorder} />
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Menor número = avaliada primeiro.
                </p>
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
              <div className="relative">
                <input type="checkbox" className="sr-only peer" id="bloqueante"
                  checked={form.bloqueante}
                  onChange={(e) => setForm({ ...form, bloqueante: e.target.checked })} />
                <div className="w-10 h-5 rounded-full transition-colors peer-checked:bg-red-600"
                  style={{ backgroundColor: form.bloqueante ? "#DC2626" : "var(--border)" }} />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm"
                  style={{ transform: form.bloqueante ? "translateX(20px)" : "translateX(0)" }} />
              </div>
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Bloqueante</span>
                {" "}— bloqueia a proposta imediatamente ao disparar
              </span>
            </label>

            {erro && <p className="text-xs" style={{ color: "#f87171" }}>{erro}</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={() => mutCriar.mutate()} disabled={mutCriar.isPending || !form.nome.trim()}
                className="px-5 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ backgroundColor: "#DC2626" }}>
                {mutCriar.isPending ? "Salvando..." : "Salvar regra"}
              </button>
              <button onClick={() => { setShowForm(false); setErro(""); setForm(FORM_VAZIO); }}
                className="px-5 py-2 text-sm font-medium transition-opacity hover:opacity-70"
                style={{ color: "var(--text-muted)" }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Tabela */}
        <div className="rounded-xl overflow-hidden"
          style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-subtle)" }}>
                {["Nome", "Tipo", "Parâmetros", "Peso", "Prioridade", "Bloqueante", "Ativo", ""].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-left"
                    style={{ color: "var(--text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="text-center py-10 text-sm"
                  style={{ color: "var(--text-muted)" }}>Carregando...</td></tr>
              )}
              {!isLoading && regras.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-sm"
                  style={{ color: "var(--text-muted)" }}>Nenhuma regra cadastrada</td></tr>
              )}
              {(regras as any[]).map((r, idx) => (
                <tr key={r.id}
                  style={{
                    backgroundColor: idx % 2 === 0 ? "var(--bg-row-even)" : "var(--bg-row-odd)",
                    borderBottom: "1px solid var(--border-mid)",
                  }}>
                  <td className="px-4 py-3 font-medium text-xs"
                    style={{ color: "var(--text-primary)" }}>{r.nome}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded"
                      style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626" }}>
                      {TIPO_LABEL[r.tipo] ?? r.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {resumoParametros(r.tipo, r.parametros)}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>{r.peso_score}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>{r.prioridade}</td>
                  <td className="px-4 py-3">
                    {r.bloqueante
                      ? <span className="text-xs font-bold" style={{ color: "#f87171" }}>Sim</span>
                      : <span className="text-xs" style={{ color: "var(--text-muted)" }}>Não</span>}
                  </td>
                  <td className="px-4 py-3">
                    {r.ativo
                      ? <span className="text-xs font-bold" style={{ color: "#34d399" }}>Ativo</span>
                      : <span className="text-xs" style={{ color: "var(--text-muted)" }}>Inativo</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.ativo && (
                      <button onClick={() => mutDesativar.mutate(r.id)}
                        className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-80"
                        style={{ color: "#f87171", backgroundColor: "rgba(248,113,113,0.1)" }}>
                        Desativar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
