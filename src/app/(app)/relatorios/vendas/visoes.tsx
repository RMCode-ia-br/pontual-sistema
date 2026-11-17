import { ComoECalculado } from "@/components/relatorios/como-e-calculado";
import { TabelaDeRelatorio } from "@/components/relatorios/cabecalho-de-relatorio";
import { GraficoDeBarras } from "@/components/relatorios/grafico-de-barras";
import { NumeroDoPainel } from "@/components/relatorios/numero-do-painel";
import { formatarMoeda } from "@/lib/formatadores";
import { type Periodo, rotuloDoPeriodo } from "@/lib/periodo";
import { variacaoEntre } from "@/lib/periodo/variacao";
import { ROTULO_ORIGEM } from "@/modules/clientes/schemas";
import { desempenhoPorParceiro, sazonalidade, ticketPorPorte, ticketPorTipoDeServico, vendasPorOrigem, type PapelDeParceiro } from "@/modules/indicadores/vendas-por-dimensao";
import { vendidoNoPeriodo } from "@/modules/indicadores/vendas";
import { ROTULO_PORTE, ROTULO_TIPO_SERVICO } from "@/modules/projetos/schemas";

/** Visões de "Vendas" além da lista por proposta: cada uma tem no máximo um gráfico, uma tabela e o "como é calculado". */

const reais = (centavos: number) => centavos / 100;
const rotuloDaOrigem = (o: string | null) => (o ? (ROTULO_ORIGEM[o as keyof typeof ROTULO_ORIGEM] ?? o) : "Não informada");
const Vazio = ({ titulo, texto }: { titulo: string; texto: string }) => (
  <div className="rounded-xl border border-dashed p-8 text-center">
    <p className="font-medium">{titulo}</p>
    <p className="text-muted-foreground mt-1 text-sm">{texto}</p>
  </div>
);
const th = "px-3 py-2";
const mesBr = (mes: string) => `${mes.slice(5)}/${mes.slice(0, 4)}`;

/** "+12%", "−5%", "igual" ou "sem base para comparar" (nunca "+∞%" nem "0%" inventado). */
export function textoDaVariacao(atual: number, anterior: number): string {
  const v = variacaoEntre(atual, anterior);
  if (v.tipo === "sem-base") return "sem base para comparar";
  if (v.tipo === "igual") return "igual";
  return `${v.tipo === "subiu" ? "+" : "−"}${v.percentual}%`;
}

export async function VisaoOrigem({ periodo }: { periodo: Periodo }) {
  const linhas = await vendasPorOrigem(periodo);
  const melhor = linhas.find((l) => l.vendidoCentavos > 0);
  return (
    <>
      <section aria-label="Resumo" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumeroDoPainel
          titulo="Origem que mais vendeu"
          valor={melhor ? rotuloDaOrigem(melhor.origem) : "—"}
          definicao="A origem do contato (campo do projeto) com mais R$ aprovado no período. Cada venda vai para a origem do projeto dela."
          detalhe={melhor ? formatarMoeda(melhor.vendidoCentavos) : "Sem venda no período"}
          grande
        />
      </section>
      {linhas.length === 0 ? (
        <Vazio titulo="Nenhum contato, proposta nem venda neste período" texto="Quando houver, eles aparecem aqui, por origem do contato." />
      ) : (
        <>
          {linhas.some((l) => l.vendidoCentavos > 0) ? (
            <div className="mb-6">
              <GraficoDeBarras dados={linhas.filter((l) => l.vendidoCentavos > 0).map((l) => ({ nome: rotuloDaOrigem(l.origem), vendido: reais(l.vendidoCentavos) }))} series={[{ chave: "vendido", rotulo: "Vendido" }]} formato="reais" descricao="R$ vendidos por origem do contato, no período" />
            </div>
          ) : null}
          <TabelaDeRelatorio legenda="Origem dos contatos: leads, propostas, fechamentos e vendido">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th scope="col" className={th}>Origem</th>
                <th scope="col" className={`${th} text-right`}>Projetos novos</th>
                <th scope="col" className={`${th} text-right`}>Com proposta enviada</th>
                <th scope="col" className={`${th} text-right`}>Fechados</th>
                <th scope="col" className={`${th} text-right`}>Vendido</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {linhas.map((l) => (
                <tr key={l.origem ?? "sem"}>
                  <td className="px-3 py-2 font-medium">{rotuloDaOrigem(l.origem)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.leads}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.comProposta}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.fechados}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.vendidoCentavos)}</td>
                </tr>
              ))}
            </tbody>
          </TabelaDeRelatorio>
        </>
      )}
      <ComoECalculado className="mt-3" texto="Projetos novos: criados no período. Com proposta enviada: projetos que tiveram proposta enviada no período. Fechados e Vendido: propostas aprovadas no período (pela data da aprovação), do projeto de cada origem. As colunas são de grupos diferentes (um projeto novo pode fechar em outro mês), por isso não formam um funil." />
    </>
  );
}

export async function VisaoParceiros({ periodo, papel }: { periodo: Periodo; papel: PapelDeParceiro }) {
  const linhas = await desempenhoPorParceiro(periodo, papel);
  const nomePapel = papel === "arquiteto" ? "arquiteto" : "construtora";
  const melhor = linhas.find((l) => l.vendidoCentavos > 0);
  return (
    <>
      <section aria-label="Resumo" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumeroDoPainel
          titulo={`Quem mais vendeu (${nomePapel})`}
          valor={melhor ? melhor.nome : "—"}
          definicao={`O ${nomePapel} indicado nos projetos com mais R$ aprovado no período.`}
          detalhe={melhor ? formatarMoeda(melhor.vendidoCentavos) : "Sem venda de projetos com esse parceiro no período"}
          grande
        />
      </section>
      {linhas.length === 0 ? (
        <Vazio titulo={`Nenhum projeto com ${nomePapel} neste período`} texto={`Para aparecer aqui, indique o ${nomePapel} no projeto (campo "${papel === "arquiteto" ? "Arquiteto" : "Construtora"}").`} />
      ) : (
        <>
          {linhas.some((l) => l.vendidoCentavos > 0) ? (
            <div className="mb-6">
              <GraficoDeBarras dados={linhas.filter((l) => l.vendidoCentavos > 0).slice(0, 10).map((l) => ({ nome: l.nome, vendido: reais(l.vendidoCentavos) }))} series={[{ chave: "vendido", rotulo: "Vendido" }]} formato="reais" descricao={`R$ vendidos por ${nomePapel} (até 10), no período`} />
            </div>
          ) : null}
          <TabelaDeRelatorio legenda={`Desempenho por ${nomePapel}`}>
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th scope="col" className={th}>{papel === "arquiteto" ? "Arquiteto" : "Construtora"}</th>
                <th scope="col" className={`${th} text-right`}>Indicados</th>
                <th scope="col" className={`${th} text-right`}>Com proposta enviada</th>
                <th scope="col" className={`${th} text-right`}>Fechados</th>
                <th scope="col" className={`${th} text-right`}>Vendido</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {linhas.map((l) => (
                <tr key={l.parceiroId}>
                  <td className="px-3 py-2 font-medium">{l.nome}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.indicados}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.comProposta}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.fechados}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.vendidoCentavos)}</td>
                </tr>
              ))}
            </tbody>
          </TabelaDeRelatorio>
        </>
      )}
      <ComoECalculado className="mt-3" texto={`Indicados: projetos criados no período com esse ${nomePapel}. Com proposta enviada: projetos dele com proposta enviada no período. Fechados e Vendido: propostas aprovadas no período dos projetos dele. Projeto sem ${nomePapel} indicado não entra.`} />
    </>
  );
}

export async function VisaoTicket({ periodo }: { periodo: Periodo }) {
  const [geral, porTipo, porPorte] = await Promise.all([vendidoNoPeriodo(periodo), ticketPorTipoDeServico(periodo), ticketPorPorte(periodo)]);
  const rotuloTipo = (c: string | null) => (c ? (ROTULO_TIPO_SERVICO[c as keyof typeof ROTULO_TIPO_SERVICO] ?? c) : "Não informado");
  const rotuloPorte = (c: string | null) => (c ? (ROTULO_PORTE[c as keyof typeof ROTULO_PORTE] ?? c) : "Não informado");
  const tabela = (legenda: string, titulo: string, linhas: typeof porTipo, rotulo: (c: string | null) => string) => (
    <TabelaDeRelatorio legenda={legenda} className="mb-6">
      <thead className="bg-muted/50 text-left text-xs">
        <tr>
          <th scope="col" className={th}>{titulo}</th>
          <th scope="col" className={`${th} text-right`}>Obras</th>
          <th scope="col" className={`${th} text-right`}>Vendido</th>
          <th scope="col" className={`${th} text-right`}>Ticket médio</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {linhas.map((l) => (
          <tr key={l.chave ?? "sem"}>
            <td className="px-3 py-2 font-medium">{rotulo(l.chave)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{l.projetos}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.vendidoCentavos)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{l.ticketCentavos === null ? "—" : formatarMoeda(l.ticketCentavos)}</td>
          </tr>
        ))}
      </tbody>
    </TabelaDeRelatorio>
  );
  return (
    <>
      <section aria-label="Resumo" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumeroDoPainel
          titulo="Ticket médio do período"
          valor={geral.ticketMedioCentavos === null ? "—" : formatarMoeda(geral.ticketMedioCentavos)}
          definicao="Vendido dividido pelo número de obras (projetos) com venda no período."
          detalhe={geral.projetos === 0 ? "Sem obra aprovada no período" : `${geral.projetos} obra(s)`}
          grande
        />
      </section>
      {porTipo.length === 0 ? (
        <Vazio titulo="Nenhuma venda neste período" texto="Quando o cliente aprovar uma proposta, ela entra aqui." />
      ) : (
        <>
          <div className="mb-6">
            <GraficoDeBarras dados={porTipo.filter((l) => l.ticketCentavos !== null).map((l) => ({ nome: rotuloTipo(l.chave), ticket: reais(l.ticketCentavos ?? 0) }))} series={[{ chave: "ticket", rotulo: "Ticket médio" }]} formato="reais" descricao="Ticket médio por tipo de serviço, no período" />
          </div>
          {tabela("Ticket médio por tipo de serviço", "Tipo de serviço", porTipo, rotuloTipo)}
          {tabela("Ticket médio por porte da obra", "Porte", porPorte, rotuloPorte)}
        </>
      )}
      <ComoECalculado className="mt-1" texto="Ticket médio = vendido ÷ obras com venda no período, no grupo. Uma obra com vários tipos de serviço aparece em cada tipo (por isso a soma das linhas por tipo passa do total); obra sem tipo ou sem porte informado aparece em “Não informado”." />
    </>
  );
}

export async function VisaoAnoContraAno({ referencia }: { referencia: string }) {
  const { meses, periodoAtual, periodoAnterior } = await sazonalidade(referencia);
  const soma = (f: (m: (typeof meses)[number]) => number) => meses.reduce((s, m) => s + f(m), 0);
  const vendidoAtual = soma((m) => m.atual.vendidoCentavos);
  const vendidoAnterior = soma((m) => m.anoAnterior.vendidoCentavos);
  const temAlgo = meses.some((m) => m.atual.vendidoCentavos + m.atual.propostasEnviadas + m.atual.novosContatos + m.anoAnterior.vendidoCentavos + m.anoAnterior.propostasEnviadas + m.anoAnterior.novosContatos > 0);
  return (
    <>
      <section aria-label="Resumo" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumeroDoPainel
          titulo="Vendido nos últimos 12 meses"
          valor={formatarMoeda(vendidoAtual)}
          definicao={`Soma do vendido (propostas aprovadas, pela data da aprovação) de ${rotuloDoPeriodo(periodoAtual)}, comparada aos 12 meses de um ano antes (${rotuloDoPeriodo(periodoAnterior)}).`}
          detalhe={`Um ano antes: ${formatarMoeda(vendidoAnterior)} · ${textoDaVariacao(vendidoAtual, vendidoAnterior)}`}
          grande
        />
      </section>
      {!temAlgo ? (
        <Vazio titulo="Sem movimento nesses 24 meses" texto="Quando houver vendas, propostas ou contatos, eles aparecem mês a mês." />
      ) : (
        <>
          <div className="mb-6">
            <GraficoDeBarras
              dados={meses.map((m) => ({ nome: mesBr(m.mes), atual: reais(m.atual.vendidoCentavos), anterior: reais(m.anoAnterior.vendidoCentavos) }))}
              series={[{ chave: "atual", rotulo: "Este ano" }, { chave: "anterior", rotulo: "Um ano antes" }]}
              orientacao="vertical"
              formato="reais"
              descricao="Vendido por mês nos últimos 12 meses, contra os mesmos meses de um ano antes"
            />
          </div>
          <TabelaDeRelatorio legenda="Vendido, propostas enviadas e novos contatos por mês, este ano contra um ano antes">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th scope="col" className={th}>Mês</th>
                <th scope="col" className={`${th} text-right`}>Vendido</th>
                <th scope="col" className={`${th} text-right`}>Um ano antes</th>
                <th scope="col" className={`${th} text-right`}>Variação</th>
                <th scope="col" className={`${th} text-right`}>Propostas enviadas</th>
                <th scope="col" className={`${th} text-right`}>Novos contatos</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {meses.map((m) => (
                <tr key={m.mes}>
                  <td className="px-3 py-2 font-medium">{mesBr(m.mes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(m.atual.vendidoCentavos)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(m.anoAnterior.vendidoCentavos)}</td>
                  <td className="px-3 py-2 text-right text-xs">{textoDaVariacao(m.atual.vendidoCentavos, m.anoAnterior.vendidoCentavos)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.atual.propostasEnviadas} <span className="text-muted-foreground text-xs">({m.anoAnterior.propostasEnviadas})</span></td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.atual.novosContatos} <span className="text-muted-foreground text-xs">({m.anoAnterior.novosContatos})</span></td>
                </tr>
              ))}
            </tbody>
          </TabelaDeRelatorio>
        </>
      )}
      <ComoECalculado className="mt-3" texto="Vendido: propostas aprovadas no mês (pela data da aprovação). Propostas enviadas: propostas com data de envio no mês. Novos contatos: projetos criados no mês. Entre parênteses, o mesmo mês um ano antes. Mês sem nada um ano antes diz “sem base para comparar” na variação." />
    </>
  );
}
