// Modal de detalhamento técnico das integrações bancárias exibidas na aba Bancos.
// O conteúdo de cada integração fica em DETALHES_INTEGRACAO, indexado pelo slug
// retornado pelo backend (GET /bancos/) — hoje só "hope" tem uma ficha completa.

interface Endpoint {
  metodo: "GET" | "POST";
  caminho: string;
  descricao: string;
}

interface IntegracaoDetalhe {
  resumo: string;
  explicacaoSimples: string[];
  visaoGeral: string[];
  autenticacao: string[];
  endpoints: Endpoint[];
  envioAprovadas: string[];
  resiliencia: string[];
  cache: string[];
  sincronizacao: string[];
  limitacoes: string[];
}

export const DETALHES_INTEGRACAO: Record<string, IntegracaoDetalhe> = {
  hope: {
    resumo:
      "Integração via API REST com a plataforma Titan, operada pela Ceoslab em nome do banco Hope. " +
      "Fornece dados de referência, consulta de operações e o registro formal de propostas já aprovadas internamente.",
    explicacaoSimples: [
      "Pense nesta integração como uma ponte de mão dupla com o banco Hope. De um lado, ela busca informações prontas do Hope — como produtos, profissões e estados civis aceitos — para ajudar a preencher uma proposta corretamente, e permite consultar o andamento de operações já existentes.",
      "Do outro lado, quando uma proposta já foi aprovada aqui dentro do nosso sistema, esta integração é usada para formalizar isso junto ao Hope: com um clique no botão \"Enviar ao Banco\", ela envia os dados financeiros e do cliente para o Hope registrar a operação.",
      "Importante: quem decide se uma proposta é aprovada, bloqueada ou vai para análise manual é sempre o nosso próprio sistema — o motor antifraude e a equipe de análise. A Titan não tem, até o momento, nenhuma função para avaliar e aprovar ou recusar uma proposta por conta própria; ela apenas registra a decisão que já tomamos por aqui.",
      "Esse envio automático hoje funciona de ponta a ponta para propostas que já vieram do próprio Hope. Propostas de outras origens ainda não têm esse suporte completo.",
      "Todos os dias, de forma automática (sem ninguém precisar clicar em nada), o sistema verifica se chegaram novas operações no Hope e já traz elas para dentro da nossa base.",
      "Se o Hope ficar fora do ar por algum motivo, o sistema tem uma espécie de \"memória recente\" das últimas informações e continua funcionando normalmente por um tempo com base nela, até a conexão voltar.",
      "O selo \"Ativo\" mostrado no card significa que essa conexão está configurada e funcionando normalmente agora.",
    ],
    visaoGeral: [
      "A Titan é o motor de cálculo e consulta do banco Hope, acessado via HTTPS em hope.titan.ceoslab.app/api.",
      "O backend atua como cliente HTTP assíncrono (httpx) dessa API, isolado em uma camada de serviço dedicada (TitanService) com cache, retry e circuit breaker próprios.",
      "Cada chamada é registrada em log estruturado (endpoint, status HTTP e latência), permitindo auditoria completa do tráfego com a Titan.",
    ],
    autenticacao: [
      "Autenticação por chave estática enviada no header Titan-Api-Key, configurada via variável de ambiente e nunca exposta ao frontend.",
      "O sistema valida no startup se a chave configurada não é um valor padrão/inseguro (ex: placeholder de exemplo) e alerta caso esteja.",
      "Respostas HTTP 401/403 são tratadas como falha de credencial (TitanAuthError) — não contam como indisponibilidade do serviço para o circuit breaker, evitando abertura indevida do circuito por erro de configuração.",
    ],
    endpoints: [
      { metodo: "GET",  caminho: "/banks",                          descricao: "Lista de bancos parceiros cadastrados na Titan." },
      { metodo: "GET",  caminho: "/sexes · /civil-statueses · /professions", descricao: "Tabelas de domínio usadas no preenchimento de propostas." },
      { metodo: "GET",  caminho: "/{banco_id}/operations/products",  descricao: "Produtos disponíveis por banco (inclui Daycoval)." },
      { metodo: "GET",  caminho: "/operations",                      descricao: "Consulta paginada de operações, com filtro por status e por intervalo de datas." },
      { metodo: "GET",  caminho: "/operations/{id}",                 descricao: "Detalhe de uma operação específica pelo ID Titan." },
      { metodo: "POST", caminho: "/operations/create",                descricao: "Registra no Titan uma operação já aprovada internamente (não avalia nem decide sobre o crédito)." },
    ],
    envioAprovadas: [
      "Depois que uma proposta chega ao status APROVADA dentro do sistema, o botão \"Enviar ao Banco\" fica disponível. Ao clicar, o sistema monta automaticamente o payload completo (dados do cliente, parcelas, juros, IOF, CET) e chama POST /operations/create — já com o status da operação marcado como aprovado, pois essa decisão já foi tomada por aqui.",
      "Para propostas que vieram originalmente do Hope, todos os dados financeiros necessários já estão salvos desde a importação, então o envio é automático de ponta a ponta. Propostas de outras origens (Storm ou cadastro manual) ainda não têm esse suporte completo e o envio retorna erro pedindo os dados financeiros.",
      "Cada envio carrega uma chave de idempotência única (hash dos dados da operação). Se a mesma proposta for enviada de novo — por exemplo após um timeout — o Titan reconhece que já existe e devolve a operação já criada, em vez de duplicá-la.",
      "Uma recusa do Titan nesta etapa (HTTP 400/422) é uma rejeição do registro em si — dado inválido ou regra de negócio da Titan — e não uma reavaliação da decisão de crédito, que já havia sido tomada dentro do nosso sistema antes desse envio.",
      "Falhas de servidor (5xx) ou timeout acionam nova tentativa automática com backoff (2s, 4s, 8s) usando a mesma chave de idempotência.",
    ],
    resiliencia: [
      "Circuit breaker dedicado: após 5 falhas consecutivas o circuito abre e passa a rejeitar chamadas imediatamente por 60s, evitando sobrecarregar uma API já instável; decorrido esse tempo, uma chamada de teste é permitida (half-open) antes de fechar o circuito novamente.",
      "Retry automático com backoff exponencial (1s → 30s, até 3 tentativas) apenas em falhas de rede/timeout em requisições de leitura (GET).",
      "Requisições de escrita (POST /operations/create) nunca são reenviadas automaticamente — reduz o risco de duplicar uma operação já criada do lado da Titan.",
      "Timeout de 30s por requisição (5s no ping de diagnóstico de status).",
    ],
    cache: [
      "Cache em dois níveis: Redis como camada principal (TTL de 1h) e SQLite local como fallback automático quando o Redis está indisponível — sem exigir intervenção manual.",
      "Endpoints de consulta de operações não são cacheados, pois o estado de uma proposta muda com frequência.",
      "Se a API Titan falhar e não houver cache disponível, o sistema recorre a um conjunto de dados de referência mock para não travar o preenchimento de formulários — o uso do mock fica sinalizado nos logs.",
      "Cache pode ser invalidado manualmente por endpoint administrativo, por chave específica ou por completo.",
    ],
    sincronizacao: [
      "A importação de novas operações da Titan para o sistema não é por webhook — é feita por um job de sincronização que roda automaticamente ao subir o backend, a cada 2h enquanto o processo estiver ativo, e também às 00:00 (para ambientes que ficam no ar 24h).",
      "A sincronização é idempotente: operações já importadas (por ID externo da Titan) são identificadas e ignoradas, então rodar o job várias vezes ao dia é seguro.",
    ],
    limitacoes: [
      "A API Titan não avalia nem decide sobre uma proposta — não existe endpoint para pedir a ela que aprove ou recuse um pedido de crédito. A decisão (aprovação, bloqueio ou análise manual) é tomada inteiramente pelo motor antifraude e pela equipe de análise dentro deste sistema; o envio ao Titan só acontece depois, para registrar formalmente uma operação que já foi aprovada por aqui.",
      "O envio automático de propostas aprovadas só funciona de ponta a ponta para propostas que já vieram do próprio Hope (via sincronização) — elas trazem consigo todos os dados financeiros necessários. Propostas de outras origens (Storm ou cadastradas manualmente) ainda não têm esse suporte: o envio retorna erro pedindo esses dados.",
      "A chave de API é única e global para toda a integração — não há segregação de escopo ou permissões por usuário/perfil dentro da própria Titan.",
      "A sincronização de operações é por polling (varredura periódica), não em tempo real — uma operação criada na Titan pode levar até o próximo ciclo do job para aparecer no sistema.",
    ],
  },
};

interface Props {
  slug: string;
  nome: string;
  ativo: boolean;
  tipo?: string;
  onClose: () => void;
}

function ExplicacaoSimples({ paragrafos }: { paragrafos: string[] }) {
  return (
    <section
      className="rounded-xl p-4"
      style={{ backgroundColor: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)" }}
    >
      <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "#DC2626" }}>
        Em Termos Simples
      </p>
      <div className="space-y-2">
        {paragrafos.map((p, i) => (
          <p key={i} className="text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}

function Secao({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <section>
      <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "#DC2626" }}>
        {titulo}
      </p>
      <ul className="space-y-1.5">
        {itens.map((item, i) => (
          <li key={i} className="text-xs leading-relaxed flex gap-2" style={{ color: "var(--text-primary)" }}>
            <span style={{ color: "var(--text-muted)" }}>—</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function IntegracaoDetalheModal({ slug, nome, ativo, tipo, onClose }: Props) {
  const detalhe = DETALHES_INTEGRACAO[slug];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex flex-col rounded-2xl overflow-hidden w-full max-w-2xl max-h-[88vh]"
        style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {/* Cabeçalho */}
        <div
          className="flex items-start justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-mid)" }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-black" style={{ color: "var(--text-primary)" }}>{nome}</h2>
              <span
                className="text-xs px-2 py-0.5 rounded font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: ativo ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)",
                  color: ativo ? "#34d399" : "#f87171",
                }}
              >
                {ativo ? "Ativo" : "Inativo"}
              </span>
              {tipo && (
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626" }}
                >
                  {tipo}
                </span>
              )}
            </div>
            {detalhe && (
              <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {detalhe.resumo}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0"
            style={{ backgroundColor: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >
            ✕ Fechar
          </button>
        </div>

        {/* Corpo com scroll */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {!detalhe ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Nenhuma documentação técnica detalhada cadastrada para esta integração ainda.
            </p>
          ) : (
            <>
              <ExplicacaoSimples paragrafos={detalhe.explicacaoSimples} />
              <Secao titulo="Visão Geral" itens={detalhe.visaoGeral} />
              <Secao titulo="Autenticação & Segurança" itens={detalhe.autenticacao} />

              <section>
                <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "#DC2626" }}>
                  Endpoints Disponíveis
                </p>
                <div className="space-y-1.5">
                  {detalhe.endpoints.map((ep, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span
                        className="font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{
                          backgroundColor: ep.metodo === "POST" ? "rgba(220,38,38,0.12)" : "rgba(59,130,246,0.12)",
                          color: ep.metodo === "POST" ? "#DC2626" : "#3b82f6",
                        }}
                      >
                        {ep.metodo}
                      </span>
                      <div className="min-w-0">
                        <span className="font-mono" style={{ color: "var(--text-primary)" }}>{ep.caminho}</span>
                        <p style={{ color: "var(--text-muted)" }}>{ep.descricao}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <Secao titulo="Envio de Propostas Aprovadas" itens={detalhe.envioAprovadas} />
              <Secao titulo="Resiliência & Performance" itens={detalhe.resiliencia} />
              <Secao titulo="Cache" itens={detalhe.cache} />
              <Secao titulo="Sincronização Automática" itens={detalhe.sincronizacao} />
              <Secao titulo="Limitações Conhecidas" itens={detalhe.limitacoes} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
