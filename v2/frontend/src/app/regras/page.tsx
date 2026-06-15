"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getRegras, criarRegra, desativarRegra } from "@/lib/api";
import Layout from "@/components/Layout";
import { Plus, Trash2 } from "lucide-react";

const TIPOS = ["BLACKLIST", "VALOR_MAXIMO", "BANCO_CONVENIO", "UF_BLOQUEADA", "SCORE_RISCO", "LIMITE_DIARIO"];

export default function RegrasPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    tipo: "VALOR_MAXIMO",
    parametros: '{"valor_maximo": 50000}',
    peso_score: 30,
    bloqueante: false,
    prioridade: 100,
  });

  const { data: regras = [] } = useQuery({
    queryKey: ["regras"],
    queryFn: () => getRegras(),
  });

  const mutCriar = useMutation({
    mutationFn: () =>
      criarRegra({ ...form, parametros: JSON.parse(form.parametros) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["regras"] });
      setShowForm(false);
    },
  });

  const mutDesativar = useMutation({
    mutationFn: desativarRegra,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["regras"] }),
  });

  return (
    <Layout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Regras Antifraude</h1>
            <p className="text-sm text-slate-500">Configuradas no banco — sem deploy para alterar</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            <Plus size={15} /> Nova Regra
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-5 space-y-4">
            <h2 className="font-semibold text-slate-700">Nova regra</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-600">Nome</label>
                <input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Tipo</label>
                <select
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  {TIPOS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-600">Parâmetros (JSON)</label>
                <textarea
                  value={form.parametros}
                  onChange={(e) => setForm({ ...form, parametros: e.target.value })}
                  rows={3}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Peso no score</label>
                <input
                  type="number"
                  value={form.peso_score}
                  onChange={(e) => setForm({ ...form, peso_score: +e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Prioridade</label>
                <input
                  type="number"
                  value={form.prioridade}
                  onChange={(e) => setForm({ ...form, prioridade: +e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="bloqueante"
                  checked={form.bloqueante}
                  onChange={(e) => setForm({ ...form, bloqueante: e.target.checked })}
                />
                <label htmlFor="bloqueante" className="text-sm text-slate-700">Bloqueante (bloqueia imediatamente)</label>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => mutCriar.mutate()}
                className="bg-primary-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary-700"
              >
                Salvar
              </button>
              <button onClick={() => setShowForm(false)} className="px-5 py-2 text-sm text-slate-600 hover:text-slate-800">
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Tipo</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Peso</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Prioridade</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Bloqueante</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Ativo</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {regras.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{r.nome}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">{r.tipo}</span>
                  </td>
                  <td className="px-4 py-3 text-center">{r.peso_score}</td>
                  <td className="px-4 py-3 text-center">{r.prioridade}</td>
                  <td className="px-4 py-3 text-center">
                    {r.bloqueante ? <span className="text-red-600 font-medium text-xs">Sim</span> : <span className="text-slate-400 text-xs">Não</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.ativo ? <span className="text-green-600 text-xs">Ativo</span> : <span className="text-slate-400 text-xs">Inativo</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.ativo && (
                      <button
                        onClick={() => mutDesativar.mutate(r.id)}
                        className="text-slate-400 hover:text-red-600 transition"
                        title="Desativar regra"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {regras.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-slate-400 text-sm">Nenhuma regra cadastrada</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
