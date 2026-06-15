"use client";

import { useQuery } from "@tanstack/react-query";
import { getPropostaSummary } from "@/lib/api";
import Layout from "@/components/Layout";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  enfileiradas:    "#94a3b8",
  em_analise:      "#60a5fa",
  aprovadas:       "#34d399",
  reprovadas:      "#f87171",
  bloqueadas:      "#fb923c",
  analise_manual:  "#fbbf24",
  enviadas_banco:  "#818cf8",
  confirmadas_banco: "#10b981",
  erro:            "#ef4444",
};

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-1 min-w-[140px]">
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ["summary"],
    queryFn: getPropostaSummary,
    refetchInterval: 10_000,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="p-8 text-slate-400 text-sm">Carregando...</div>
      </Layout>
    );
  }

  const chartData = summary
    ? [
        { name: "Enfileiradas", valor: summary.enfileiradas, color: STATUS_COLORS.enfileiradas },
        { name: "Em análise",   valor: summary.em_analise,   color: STATUS_COLORS.em_analise },
        { name: "Aprovadas",    valor: summary.aprovadas,    color: STATUS_COLORS.aprovadas },
        { name: "Bloqueadas",   valor: summary.bloqueadas,   color: STATUS_COLORS.bloqueadas },
        { name: "Manual",       valor: summary.analise_manual, color: STATUS_COLORS.analise_manual },
        { name: "Confirmadas",  valor: summary.confirmadas_banco, color: STATUS_COLORS.confirmadas_banco },
        { name: "Erro",         valor: summary.erro,         color: STATUS_COLORS.erro },
      ]
    : [];

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">Visão geral das propostas em tempo real</p>
        </div>

        {/* KPIs */}
        <div className="flex gap-3 overflow-x-auto pb-2">
          <Pill label="Total" value={summary?.total ?? 0} color="#3b82f6" />
          <Pill label="Aprovadas" value={summary?.aprovadas ?? 0} color={STATUS_COLORS.aprovadas} />
          <Pill label="Bloqueadas" value={summary?.bloqueadas ?? 0} color={STATUS_COLORS.bloqueadas} />
          <Pill label="Manual" value={summary?.analise_manual ?? 0} color={STATUS_COLORS.analise_manual} />
          <Pill label="Confirmadas" value={summary?.confirmadas_banco ?? 0} color={STATUS_COLORS.confirmadas_banco} />
          <Pill label="Erro" value={summary?.erro ?? 0} color={STATUS_COLORS.erro} />
        </div>

        {/* Chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Propostas por status</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
              <Tooltip />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Layout>
  );
}
