import { useQuery } from "@tanstack/react-query";
import { getPropostaSummary } from "@/lib/api";
import Layout from "@/components/Layout";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const CARD_COLORS = {
  analisar:       "#60a5fa",
  aprovadas:      "#34d399",
  nao_mapeadas:   "#94a3b8",
  reprovadas:     "#f87171",
};

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl p-5 flex flex-col gap-1 flex-1 min-w-[140px]"
      style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
      <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{value}</p>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ["summary"],
    queryFn: getPropostaSummary,
    refetchInterval: 10_000,
  });

  const analisar      = (summary?.em_analise ?? 0) + (summary?.analise_manual ?? 0);
  const aprovadas     = (summary?.aprovadas ?? 0) + (summary?.confirmadas_banco ?? 0);
  const naoMapeadas   = (summary?.enfileiradas ?? 0) + (summary?.erro ?? 0);
  const reprovadas    = (summary?.reprovadas ?? 0) + (summary?.bloqueadas ?? 0);

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
              <KpiCard label="Analisar"      value={analisar}    color={CARD_COLORS.analisar} />
              <KpiCard label="Aprovadas"     value={aprovadas}   color={CARD_COLORS.aprovadas} />
              <KpiCard label="Não Mapeadas"  value={naoMapeadas} color={CARD_COLORS.nao_mapeadas} />
              <KpiCard label="Reprovadas"    value={reprovadas}  color={CARD_COLORS.reprovadas} />
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
          </>
        )}
      </div>
    </Layout>
  );
}
