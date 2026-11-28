import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoDeRelatorio, TabelaDeRelatorio } from "@/components/relatorios/cabecalho-de-relatorio";
import { ComoECalculado } from "@/components/relatorios/como-e-calculado";
import { GraficoDeBarras } from "@/components/relatorios/grafico-de-barras";
import { lerVisao, NavegacaoDeVisoes, type Visao } from "@/components/relatorios/navegacao-de-visoes";
import { NumeroDoPainel } from "@/components/relatorios/numero-do-painel";
import { SeletorDePeriodo } from "@/components/relatorios/seletor-de-periodo";
import { exigirModulo } from "@/lib/auth/modulo";
import { dataLocalDoInstante, formatarMoeda } from "@/lib/formatadores";
import { montarConsulta } from "@/lib/listas/parametros";
import { lerPeriodo, parametrosDoPeriodo, rotuloDoPeriodo, type Periodo } from "@/lib/periodo";
import { mixPorTipologia, precoMedioPorM2, ROTULO_DA_DIMENSAO, type DimensaoDePreco } from "@/modules/indicadores/clientes-e-produtos";

export const metadata: Metadata = { title: "Produtos e preços" };

const VISOES = [
  { valor: "mix", titulo: "O que mais vende" },
  { valor: "preco", titulo: "Preço por m²" },
] as const satisfies readonly Visao[];

const th = "px-3 py-2";
const m2Br = (m2: number) => `${m2.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
const mesBr = (mes: string) => `${mes.slice(5)}/${mes.slice(0, 4)}`;
const lerDimensao = (b: string | string[] | undefined): DimensaoDePreco => {
  const v = Array.isArray(b) ? b[0] : b;
  return v === "linha" || v === "acabamento" ? v : "tipologia";
};

export default async function PaginaDeProdutosEPrecos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirModulo(["RELATORIOS", "CADASTROS"], { exige: ["valores"] });
  const brutos = await searchParams;
  const hoje = dataLocalDoInstante(new Date());
  const { periodo, tipo, aviso } = lerPeriodo(brutos, hoje);
  const visao = lerVisao(brutos.visao, VISOES);
  const por = lerDimensao(brutos.por);
  const doPeriodo = parametrosDoPeriodo(periodo);
  const extras: Record<string, string> = visao === "preco" ? { por } : {};
  const consulta = montarConsulta({ ...doPeriodo, ...extras, visao });

  return (
    <>
      <p className="mb-2 text-sm print:hidden">
        <Link href="/relatorios" className="text-muted-foreground hover:underline">
          ← Relatórios
        </Link>
      </p>
      <CabecalhoDeRelatorio
        titulo="Produtos e preços"
        descricao={visao === "mix" ? "Que tipos de esquadria entram nas propostas aprovadas, em m² e em R$." : "Quanto se cobra, em média, por m² nas propostas aprovadas, mês a mês."}
        periodoRotulo={rotuloDoPeriodo(periodo)}
        hrefCsv={`/api/exportar/relatorios/produtos-e-precos${consulta}`}
      >
        <SeletorDePeriodo periodo={periodo} tipo={tipo} hoje={hoje} />
      </CabecalhoDeRelatorio>
      <NavegacaoDeVisoes visoes={VISOES} atual={visao} parametros={{ ...doPeriodo, ...extras }} rotulo="Visões do relatório de produtos e preços" />
      {aviso ? (
        <p role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {aviso}
        </p>
      ) : null}
      {visao === "mix" ? <VisaoMix periodo={periodo} /> : null}
      {visao === "preco" ? (
        <>
          <nav aria-label="Agrupar por" className="mb-4 flex gap-1.5 print:hidden">
            {(["tipologia", "linha", "acabamento"] as const).map((d) => (
              <Link
                key={d}
                href={montarConsulta({ ...doPeriodo, visao: "preco", por: d })}
                aria-current={por === d ? "page" : undefined}
                className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm ${por === d ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
              >
                {ROTULO_DA_DIMENSAO[d]}
              </Link>
            ))}
          </nav>
          <VisaoPreco periodo={periodo} por={por} />
        </>
      ) : null}
    </>
  );
}

async function VisaoMix({ periodo }: { periodo: Periodo }) {
  const mix = await mixPorTipologia(periodo);
  const totalM2 = mix.linhas.reduce((s, l) => s + l.m2, 0);
  return (
    <>
      <section aria-label="Resumo" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <NumeroDoPainel titulo="Vendido" valor={formatarMoeda(mix.vendidoCentavos)} definicao="O mesmo “Vendido” do relatório de vendas: valor aprovado das propostas aprovadas no período." detalhe={`${mix.propostas} proposta(s)`} grande />
        <NumeroDoPainel titulo="Área vendida" valor={m2Br(totalM2)} definicao="Soma de largura × altura × quantidade de todas as medidas dos itens aprovados. Item sem medida não entra." detalhe={mix.itensSemMedida > 0 ? `${mix.itensSemMedida} item(ns) sem medida ficaram fora` : "Todos os itens têm medida"} />
        <NumeroDoPainel titulo="Propostas com ajuste" valor={String(mix.propostasComDiferenca)} definicao="Propostas em que a soma dos itens é diferente do valor aprovado (desconto na opção, acréscimo da nota fiscal ou ajuste da forma de pagamento escolhida: desconto à vista ou acréscimo do cartão). A diferença aparece na linha “Outros e ajustes”." detalhe={`de ${mix.propostas} aprovada(s)`} />
      </section>
      {mix.propostasSoPelaTabela > 0 ? (
        <p role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {mix.propostasSoPelaTabela} proposta(s) não têm o conteúdo congelado da opção aprovada; os itens delas foram lidos direto da tabela de itens.
        </p>
      ) : null}
      {mix.linhas.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Nenhuma proposta aprovada neste período</p>
          <p className="text-muted-foreground mt-1 text-sm">Quando o cliente aprovar uma proposta, os itens dela aparecem aqui.</p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <GraficoDeBarras dados={mix.linhas.filter((l) => l.valorCentavos > 0).slice(0, 10).map((l) => ({ nome: l.nome, vendido: l.valorCentavos / 100 }))} series={[{ chave: "vendido", rotulo: "Vendido" }]} formato="reais" descricao="R$ por tipologia (até 10), no período" />
          </div>
          <TabelaDeRelatorio legenda="Mix por tipologia: itens, m² e R$">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th scope="col" className={th}>Tipologia</th>
                <th scope="col" className={`${th} text-right`}>Itens</th>
                <th scope="col" className={`${th} text-right`}>Área</th>
                <th scope="col" className={`${th} text-right`}>Valor dos itens</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {mix.linhas.map((l) => (
                <tr key={l.chave}>
                  <td className="px-3 py-2 font-medium">{l.nome}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.itens}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m2Br(l.m2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.valorCentavos)}</td>
                </tr>
              ))}
              {mix.outrosCentavos !== 0 ? (
                <tr>
                  <td className="px-3 py-2 font-medium">Outros e ajustes</td>
                  <td className="px-3 py-2 text-right">—</td>
                  <td className="px-3 py-2 text-right">—</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(mix.outrosCentavos)}</td>
                </tr>
              ) : null}
            </tbody>
            <tfoot className="bg-muted/30 text-sm font-medium">
              <tr>
                <td className="px-3 py-2">Total (= Vendido)</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums">{m2Br(totalM2)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(mix.vendidoCentavos)}</td>
              </tr>
            </tfoot>
          </TabelaDeRelatorio>
        </>
      )}
      <ComoECalculado className="mt-3" texto="Para cada proposta aprovada no período (pela data da aprovação), somam-se os itens da OPÇÃO APROVADA, agrupados por tipologia. Depois da aprovação os itens não podem ser editados (para mudar, desfaz-se a aprovação e se faz uma revisão), então a soma dos itens só difere do valor aprovado pelo desconto da opção, pelo acréscimo da nota fiscal e pelo ajuste da forma de pagamento escolhida (desconto à vista ou acréscimo do cartão): essa diferença vai na linha “Outros e ajustes”, para o total fechar com o Vendido." />
    </>
  );
}

async function VisaoPreco({ periodo, por }: { periodo: Periodo; por: DimensaoDePreco }) {
  const r = await precoMedioPorM2(periodo, por);
  const geral = r.porMes.reduce((a, m) => ({ valor: a.valor + m.valorCentavos, m2: a.m2 + m.m2 }), { valor: 0, m2: 0 });
  const medio = geral.m2 > 0 ? Math.round(geral.valor / geral.m2) : null;
  return (
    <>
      <section aria-label="Resumo" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumeroDoPainel titulo="Preço médio por m²" valor={medio === null ? "—" : formatarMoeda(medio)} definicao="Valor dos itens ÷ área dos itens que têm medida, em todo o período. Item sem medida não entra (não vira zero)." detalhe={r.itensSemMedida > 0 ? `${r.itensSemMedida} item(ns) sem medida ficaram fora` : "Todos os itens têm medida"} grande />
      </section>
      {r.itensSemDimensao > 0 ? (
        <p role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {r.itensSemDimensao} item(ns) não têm {ROTULO_DA_DIMENSAO[por].toLowerCase()} informado e aparecem em “Não informado”.
        </p>
      ) : null}
      {r.linhas.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Nenhum item com medida neste período</p>
          <p className="text-muted-foreground mt-1 text-sm">Quando houver proposta aprovada com itens medidos, o preço por m² aparece aqui.</p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <GraficoDeBarras dados={r.porMes.map((m) => ({ nome: mesBr(m.mes), preco: (m.precoPorM2Centavos ?? 0) / 100 }))} series={[{ chave: "preco", rotulo: "Preço médio por m²" }]} orientacao="vertical" formato="reais" descricao="Preço médio por m² em cada mês do período" />
          </div>
          <TabelaDeRelatorio legenda={`Preço médio por m² por mês e por ${ROTULO_DA_DIMENSAO[por].toLowerCase()}`}>
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th scope="col" className={th}>Mês</th>
                <th scope="col" className={th}>{ROTULO_DA_DIMENSAO[por]}</th>
                <th scope="col" className={`${th} text-right`}>Área</th>
                <th scope="col" className={`${th} text-right`}>Valor</th>
                <th scope="col" className={`${th} text-right`}>Preço por m²</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {r.linhas.map((l) => (
                <tr key={`${l.mes}-${l.chave}`}>
                  <td className="px-3 py-2 tabular-nums">{mesBr(l.mes)}</td>
                  <td className="px-3 py-2 font-medium">{l.nome}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m2Br(l.m2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.valorCentavos)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.precoPorM2Centavos === null ? "—" : formatarMoeda(l.precoPorM2Centavos)}</td>
                </tr>
              ))}
            </tbody>
          </TabelaDeRelatorio>
        </>
      )}
      <ComoECalculado className="mt-3" texto="Itens da opção aprovada de cada proposta aprovada no período, no mês da aprovação (horário de São Paulo). Preço por m² = valor dos itens ÷ área (largura × altura × quantidade). O valor dos itens é o preço de venda do item, sem o acréscimo da nota e sem o desconto da opção, por isso a média pode diferir um pouco do valor realmente cobrado." />
    </>
  );
}
