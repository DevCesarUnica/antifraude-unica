"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPropostas, aprovarProposta, bloquearProposta, reprocessarProposta } from "@/lib/api";
import Layout from "@/components/Layout";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_BADGE: Record<string, string> = {
  ENFILEIRADA:       "bg-slate-100 text-slate-600",
  EM_ANALISE:        "bg-blue-100 text-blue-700",
  APROVADA:          "bg-green-100 text-green-700",
  REPROVADA:         "bg-red-100 text-red-700",
  BLOQUEADA:         "bg-orange-100 text-orange-700",
  ANALISE_MANUAL:    "bg-yellow-100 text-yellow-700",
  ENVIADA_BANCO:     "bg-indigo-100 text-indigo-700",
  CONFIRMADA_BANCO:  "bg-emerald-100 text-emerald-700",
  ERRO:              "bg-red-100 text-red-800",
};

const STATUSES = ["", "ENFILEIRADA", "EM_ANALISE", "APROVADA", "BLOQUEADA", "ANALISE_MANUAL", "ERRO"];

export default function PropostasPage() {
  const [filtro, setFiltro] = useState("");
  const qc = useQueryClient();

  const { data: propostas = [], isLoading } = useQuery({
    queryKey: ["propostas", filtro],
    queryFn: () => getPropostas(filtro || undefined),
    refetchInterval: 8_000,
  });

  const mutAprovar = useMutation({ mutationFn: aprovarProposta, onSuccess: () => qc.invalidateQueries({ queryKey: ["propostas"] }) });
  const mutBloquear = useMutation({ mutationFn: bloquearProposta, onSuccess: () => qc.invalidateQueries({ queryKey: ["propostas"] }) });
  const mutReprocessar = useMutation({ mutationFn: reprocessarProposta, onSuccess: () => qc.invalidateQueries({ queryKey: ["propostas"] }) });

  return (
    <Layout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Propostas</h1>
            <p className="text-sm text-slate-500">{propostas.length} registros</p>
          </div>

          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s || "Todos os status"}</option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 800 }}>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">ID Externo</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">CPF</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Banco</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Valor</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">Score</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Data</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-400">Carregando...</td></tr>
                )}
                {!isLoading && propostas.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-400">Nenhuma proposta encontrada</td></tr>
                )}
                {propostas.map((p: any) => (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.proposta_id_externo}</td>
                    <td className="px-4 py-3">{p.cpf_cliente}</td>
                    <td className="px-4 py-3">{p.banco}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {p.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[p.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.score_fraude != null ? (
                        <span className={`font-bold ${p.score_fraude >= 80 ? "text-red-600" : p.score_fraude >= 40 ? "text-yellow-600" : "text-green-600"}`}>
                          {p.score_fraude}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {format(new Date(p.criado_em), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        {p.status === "ANALISE_MANUAL" && (
                          <>
                            <button
                              onClick={() => mutAprovar.mutate(p.id)}
                              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                            >Aprovar</button>
                            <button
                              onClick={() => mutBloquear.mutate(p.id)}
                              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                            >Bloquear</button>
                          </>
                        )}
                        {(p.status === "ERRO" || p.status === "BLOQUEADA") && (
                          <button
                            onClick={() => mutReprocessar.mutate(p.id)}
                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                          >Reprocessar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
