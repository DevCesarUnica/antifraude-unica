import { useQuery } from "@tanstack/react-query";
import { getPropostaSummary } from "@/lib/api";
import Layout from "@/components/Layout";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const STATUS_COLORS: Record<string, string> = {
  enfileiradas:      "#94a3b8",
  em_analise:        "#60a5fa",
  aprovadas:         "#34d399",
  reprovadas:        "#f87171",
  bloqueadas:        "#fb923c",
  analise_manual:    "#fbbf24",
  enviadas_banco:    "#818cf8",
  confirmadas_banco: "#10b981",
  erro:              "#ef4444",
};

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl p-5 flex flex-col gap-1 min-w-[130px]"
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

  const chartData = summary ? [
    { name: "Enfileiradas", valor: summary.enfileiradas,      color: STATUS_COLORS.enfileiradas },
    { name: "Em análise",   valor: summary.em_analise,        color: STATUS_COLORS.em_analise },
    { name: "Aprovadas",    valor: summary.aprovadas,          color: STATUS_COLORS.aprovadas },
    { name: "Bloqueadas",   valor: summary.bloqueadas,         color: STATUS_COLORS.bloqueadas },
    { name: "Manual",       valor: summary.analise_manual,     color: STATUS_COLORS.analise_manual },
    { name: "Confirmadas",  valor: summary.confirmadas_banco,  color: STATUS_COLORS.confirmadas_banco },
    { name: "Erro",         valor: summary.erro,               color: STATUS_COLORS.erro },
  ] : [];

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
              <KpiCard label="Total"       value={summary?.total ?? 0}              color="#3b82f6" />
              <KpiCard label="Aprovadas"   value={summary?.aprovadas ?? 0}          color={STATUS_COLORS.aprovadas} />
              <KpiCard label="Bloqueadas"  value={summary?.bloqueadas ?? 0}         color={STATUS_COLORS.bloqueadas} />
              <KpiCard label="Manual"      value={summary?.analise_manual ?? 0}     color={STATUS_COLORS.analise_manual} />
              <KpiCard label="Confirmadas" value={summary?.confirmadas_banco ?? 0}  color={STATUS_COLORS.confirmadas_banco} />
              <KpiCard label="Erro"        value={summary?.erro ?? 0}               color={STATUS_COLORS.erro} />
            </div>

            <div className="rounded-xl p-6" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: "var(--text-muted)" }}>
                Propostas por status
              </h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} barSize={36}>
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
