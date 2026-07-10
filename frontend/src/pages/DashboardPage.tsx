import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPropostaSummary, exportarPropostasExcel } from "@/lib/api";
import Layout from "@/components/Layout";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import DashboardPropostasTable from "@/components/DashboardPropostasTable";

const CARD_COLORS = {
  analisar:       "#60a5fa",
  aprovadas:      "#34d399",
  nao_mapeadas:   "#94a3b8",
  reprovadas:     "#f87171",
};

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function KpiCard({ label, value, valor, color }: { label: string; value: number; valor?: number; color: string }) {
  return (
    <div className="rounded-xl p-5 flex flex-col gap-1 flex-1 min-w-[140px]"
      style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
      <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{value}</p>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
      {valor != null && (
        <p className="text-xs font-semibold" style={{ color }}>{fmtBRL(valor)}</p>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ["summary"],
    queryFn: getPropostaSummary,
    refetchInterval: 10_000,
  });

  const [exportando, setExportando] = useState(false);
  const [erroExport, setErroExport] = useState("");

  const exportarExcel = async () => {
    setExportando(true); setErroExport("");
    try {
      const blob = await exportarPropostasExcel();
      const pad = (n: number) => String(n).padStart(2, "0");
      const agora = new Date();
      const nomeArquivo = `propostas_${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}_${pad(agora.getHours())}-${pad(agora.getMinutes())}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nomeArquivo; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErroExport("Erro ao exportar propostas.");
    } finally {
      setExportando(false);
    }
  };

  const analisar      = (summary?.em_analise ?? 0) + (summary?.analise_manual ?? 0);
  const aprovadas     = (summary?.aprovadas ?? 0) + (summary?.confirmadas_banco ?? 0);
  const naoMapeadas   = (summary?.enfileiradas ?? 0) + (summary?.erro ?? 0);
  const reprovadas    = (summary?.reprovadas ?? 0) + (summary?.bloqueadas ?? 0);

  const valores = summary?.valores_por_status ?? {};
  const somaValores = (...chaves: string[]) => chaves.reduce((acc, k) => acc + (valores[k] ?? 0), 0);
  const valorAnalisar      = somaValores("EM_ANALISE", "ANALISE_MANUAL");
  const valorAprovadas     = somaValores("APROVADA", "CONFIRMADA_BANCO");
  const valorNaoMapeadas   = somaValores("ENFILEIRADA", "ERRO");
  const valorReprovadas    = somaValores("REPROVADA", "BLOQUEADA");

  const chartData = [
    { name: "Analisar",       valor: analisar,    color: CARD_COLORS.analisar },
    { name: "Aprovadas",      valor: aprovadas,   color: CARD_COLORS.aprovadas },
    { name: "Não Mapeadas",   valor: naoMapeadas, color: CARD_COLORS.nao_mapeadas },
    { name: "Reprovadas",     valor: reprovadas,  color: CARD_COLORS.reprovadas },
  ];

  return (
    <Layout>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-lg font-black uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>
            Dashboard
          </h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Visão geral das propostas em tempo real
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Carregando...</p>
        ) : (
          <>
            <div className="flex gap-3 overflow-x-auto pb-2">
              <KpiCard label="Analisar"      value={analisar}    valor={valorAnalisar}    color={CARD_COLORS.analisar} />
              <KpiCard label="Aprovadas"     value={aprovadas}   valor={valorAprovadas}   color={CARD_COLORS.aprovadas} />
              <KpiCard label="Não Mapeadas"  value={naoMapeadas} valor={valorNaoMapeadas} color={CARD_COLORS.nao_mapeadas} />
              <KpiCard label="Reprovadas"    value={reprovadas}  valor={valorReprovadas}  color={CARD_COLORS.reprovadas} />
            </div>

            <div className="rounded-xl p-6" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: "var(--text-muted)" }}>
                Propostas por status
              </h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} barSize={48}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8 }}
                    labelStyle={{ color: "var(--text-primary)" }}
                  />
                  <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: "var(--text-primary)" }}>
                Mesa de Crédito
              </h2>
              <DashboardPropostasTable />
            </div>

            <div className="flex flex-col items-end gap-2">
              {erroExport && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
                  {erroExport}
                </p>
              )}
              <button
                onClick={exportarExcel}
                disabled={exportando}
                className="px-4 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: "#16a34a" }}
              >
                {exportando ? "Exportando..." : "⬇ Baixar Excel de todas as propostas"}
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
