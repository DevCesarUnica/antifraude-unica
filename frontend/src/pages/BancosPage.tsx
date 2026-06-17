import { useQuery } from "@tanstack/react-query";
import { getBancosIntegracoes } from "@/lib/api";
import Layout from "@/components/Layout";

export default function BancosPage() {
  const { data: bancos = [], isLoading } = useQuery({
    queryKey: ["bancos"],
    queryFn: getBancosIntegracoes,
    refetchInterval: 30_000,
  });

  return (
    <Layout>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-lg font-black uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>
            Bancos
          </h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Integrações configuradas — {bancos.length} banco{bancos.length !== 1 ? "s" : ""}
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Carregando...</p>
        ) : bancos.length === 0 ? (
          <div className="rounded-xl p-10 text-center" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhum banco configurado</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {bancos.map((banco: any) => (
              <div key={banco.slug ?? banco.id}
                className="rounded-xl p-5 flex flex-col gap-3"
                style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
                      {banco.nome ?? banco.slug}
                    </h2>
                    {banco.slug && (
                      <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                        {banco.slug}
                      </p>
                    )}
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded font-semibold uppercase tracking-wide"
                    style={{
                      backgroundColor: banco.ativo ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)",
                      color: banco.ativo ? "#34d399" : "#f87171",
                    }}>
                    {banco.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>

                {banco.tipo && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Tipo:</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded"
                      style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626" }}>
                      {banco.tipo}
                    </span>
                  </div>
                )}

                {banco.url && (
                  <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{banco.url}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
