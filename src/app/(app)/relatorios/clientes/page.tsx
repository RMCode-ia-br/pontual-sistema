import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoDeRelatorio, TabelaDeRelatorio } from "@/components/relatorios/cabecalho-de-relatorio";
import { ComoECalculado } from "@/components/relatorios/como-e-calculado";
import { lerVisao, NavegacaoDeVisoes, type Visao } from "@/components/relatorios/navegacao-de-visoes";
import { NumeroDoPainel } from "@/components/relatorios/numero-do-painel";
import { SeletorDePeriodo } from "@/components/relatorios/seletor-de-periodo";
import { exigirModulo } from "@/lib/auth/modulo";
import { dataLocalDoInstante, formatarData, formatarMoeda, formatarTelefone } from "@/lib/formatadores";
import { montarConsulta } from "@/lib/listas/parametros";
import { lerPeriodo, parametrosDoPeriodo, rotuloDoPeriodo } from "@/lib/periodo";
import { clientesParaReativar, clientesPorCidade, LIMITE_DE_CLIENTES_NA_REATIVACAO, MESES_PADRAO_DE_REATIVACAO } from "@/modules/indicadores/clientes-e-produtos";

export const metadata: Metadata = { title: "Clientes" };

const VISOES = [
  { valor: "reativacao", titulo: "Para reativar" },
  { valor: "cidade", titulo: "Por cidade" },
] as const satisfies readonly Visao[];

const th = "px-3 py-2";

/** Meses sem comprar: número inteiro de 1 a 120; qualquer outra coisa volta ao padrão. */
export function lerMesesDeReativacao(bruto: string | string[] | undefined): number {
  const v = Number(Array.isArray(bruto) ? bruto[0] : bruto);
  return Number.isInteger(v) && v >= 1 && v <= 120 ? v : MESES_PADRAO_DE_REATIVACAO;
}

export default async function PaginaDeClientes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirModulo(["RELATORIOS", "CLIENTES"], { exige: ["valores"] });
  const brutos = await searchParams;
  const hoje = dataLocalDoInstante(new Date());
  const visao = lerVisao(brutos.visao, VISOES);
  const meses = lerMesesDeReativacao(brutos.meses);
  const { periodo, tipo, aviso } = lerPeriodo(brutos, hoje);
  const doPeriodo = parametrosDoPeriodo(periodo);
  const extras: Record<string, string> = visao === "reativacao" ? { meses: String(meses) } : {};
  const consulta = montarConsulta({ ...(visao === "cidade" ? doPeriodo : {}), ...extras, visao });

  return (
    <>
      <p className="mb-2 text-sm print:hidden">
        <Link href="/relatorios" className="text-muted-foreground hover:underline">
          ← Relatórios
        </Link>
      </p>
      <CabecalhoDeRelatorio
        titulo="Clientes"
        descricao={visao === "reativacao" ? "Clientes que já fecharam obra com a Pontual e não fecham há um tempo: bons nomes para um contato." : "Onde estão as obras vendidas: clientes, obras e valor por cidade."}
        periodoRotulo={visao === "cidade" ? rotuloDoPeriodo(periodo) : `referência: ${formatarData(hoje)}`}
        hrefCsv={`/api/exportar/relatorios/clientes${consulta}`}
      >
        {visao === "cidade" ? <SeletorDePeriodo periodo={periodo} tipo={tipo} hoje={hoje} /> : null}
      </CabecalhoDeRelatorio>
      <NavegacaoDeVisoes visoes={VISOES} atual={visao} parametros={visao === "cidade" ? doPeriodo : extras} rotulo="Visões do relatório de clientes" />
      {aviso && visao === "cidade" ? (
        <p role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {aviso}
        </p>
      ) : null}
      {visao === "reativacao" ? <VisaoReativacao referencia={hoje} meses={meses} /> : <VisaoCidade periodo={periodo} />}
    </>
  );
}

async function VisaoReativacao({ referencia, meses }: { referencia: string; meses: number }) {
  const r = await clientesParaReativar(referencia, meses);
  return (
    <>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
        <input type="hidden" name="visao" value="reativacao" />
        <label className="text-sm">
          <span className="text-muted-foreground block text-xs">Sem fechar há (meses ou mais)</span>
          <input name="meses" type="number" min={1} max={120} defaultValue={meses} className="bg-background h-9 w-24 rounded-md border px-2 tabular-nums" />
        </label>
        <button type="submit" className="hover:bg-accent min-h-9 rounded-md border px-3 text-sm">
          Aplicar
        </button>
        {meses !== MESES_PADRAO_DE_REATIVACAO ? (
          <Link href="?visao=reativacao" className="text-muted-foreground min-h-9 self-center text-sm hover:underline">
            Voltar ao padrão ({MESES_PADRAO_DE_REATIVACAO})
          </Link>
        ) : null}
      </form>
      <section aria-label="Resumo" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumeroDoPainel titulo="Clientes para reativar" valor={String(r.total)} definicao={`Clientes cuja última obra aprovada foi em ${formatarData(r.limite)} ou antes (${meses} meses antes de ${formatarData(referencia)}).`} detalhe={r.total === 0 ? "Nenhum cliente nessa situação" : `${r.linhas.filter((l) => l.temPropostaEmAberto).length} já têm proposta enviada em aberto`} grande />
      </section>
      {r.total > r.linhas.length ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          A lista mostra só os {LIMITE_DE_CLIENTES_NA_REATIVACAO} clientes mais antigos de {r.total}. Aumente o número de meses para ver menos.
        </p>
      ) : null}
      {r.linhas.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Nenhum cliente parado há {meses} meses ou mais</p>
          <p className="text-muted-foreground mt-1 text-sm">Quando houver cliente que fechou obra e não voltou, ele aparece aqui.</p>
        </div>
      ) : (
        <TabelaDeRelatorio legenda="Clientes sem obra aprovada há tempo">
          <thead className="bg-muted/50 text-left text-xs">
            <tr>
              <th scope="col" className={th}>Cliente</th>
              <th scope="col" className={th}>Telefone</th>
              <th scope="col" className={th}>Última aprovação</th>
              <th scope="col" className={`${th} text-right`}>Obras</th>
              <th scope="col" className={`${th} text-right`}>Total aprovado</th>
              <th scope="col" className={th}>Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {r.linhas.map((l) => (
              <tr key={l.clienteId}>
                <td className="px-3 py-2 font-medium">
                  <Link href={`/clientes/${l.clienteId}`} className="hover:underline">
                    {l.nome}
                  </Link>
                </td>
                <td className="px-3 py-2 tabular-nums">{l.whatsapp || l.telefone ? formatarTelefone(l.whatsapp ?? l.telefone) : "—"}</td>
                <td className="px-3 py-2 tabular-nums">{formatarData(l.ultimaAprovacaoEm)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.obras}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.totalAprovadoCentavos)}</td>
                <td className="px-3 py-2">{l.temPropostaEmAberto ? "Proposta em aberto" : "Sem proposta em aberto"}</td>
              </tr>
            ))}
          </tbody>
        </TabelaDeRelatorio>
      )}
      <ComoECalculado className="mt-3" texto={`Entram os clientes com pelo menos uma proposta aprovada (aprovação desfeita não conta). Vale a ÚLTIMA aprovação de cada cliente, pela data do aceite em horário de São Paulo: se for ${meses} meses ou mais antes de ${formatarData(referencia)}, o cliente entra. Os ${meses} meses são o padrão a confirmar com o Marcelo; mude no campo acima. “Proposta em aberto” = tem proposta enviada ainda sem resposta.`} />
    </>
  );
}

async function VisaoCidade({ periodo }: { periodo: ReturnType<typeof lerPeriodo>["periodo"] }) {
  const linhas = await clientesPorCidade(periodo);
  const total = linhas.reduce((s, l) => s + l.vendidoCentavos, 0);
  return (
    <>
      <section aria-label="Resumo" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumeroDoPainel titulo="Cidades com venda" valor={String(linhas.filter((l) => l.cidade).length)} definicao="Cidades diferentes (do endereço da obra) com proposta aprovada no período." detalhe={formatarMoeda(total)} grande />
      </section>
      {linhas.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Nenhuma venda neste período</p>
          <p className="text-muted-foreground mt-1 text-sm">Quando o cliente aprovar uma proposta, ela entra aqui, na cidade da obra.</p>
        </div>
      ) : (
        <TabelaDeRelatorio legenda="Clientes, obras e vendido por cidade da obra">
          <thead className="bg-muted/50 text-left text-xs">
            <tr>
              <th scope="col" className={th}>Cidade da obra</th>
              <th scope="col" className={`${th} text-right`}>Clientes</th>
              <th scope="col" className={`${th} text-right`}>Obras</th>
              <th scope="col" className={`${th} text-right`}>Vendido</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {linhas.map((l) => (
              <tr key={`${l.cidade}-${l.uf}`}>
                <td className="px-3 py-2 font-medium">{l.cidade ? `${l.cidade}${l.uf ? `/${l.uf}` : ""}` : "Não informada"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.clientes}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.obras}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.vendidoCentavos)}</td>
              </tr>
            ))}
          </tbody>
        </TabelaDeRelatorio>
      )}
      <ComoECalculado className="mt-3" texto="Propostas aprovadas no período (pela data da aprovação), agrupadas pela cidade do endereço da OBRA do projeto. Obra sem endereço ou sem cidade fica em “Não informada”. O total de clientes de todas as linhas pode passar do número real quando o mesmo cliente tem obras em cidades diferentes." />
    </>
  );
}
