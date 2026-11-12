import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { exigirSessao } from "@/lib/auth/sessao";
import { ROTULO_FORMA, type FormaPagamento } from "@/lib/dominio/parcelas";
import { dataLocalDoInstante, formatarData, formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { AcoesDePagar } from "@/modules/financeiro/components/acoes-de-pagar";
import { SeloDaSituacao } from "@/modules/financeiro/components/selo-da-situacao";
import { obterContaAPagar, opcoesDeContaAPagar } from "@/modules/financeiro/queries-pagar";
import { ROTULO_PERIODICIDADE } from "@/modules/financeiro/schemas";

export const metadata: Metadata = { title: "Conta a pagar" };

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function PaginaDaContaAPagar({ params }: { params: Promise<{ id: string }> }) {
  await exigirSessao();
  const { id } = await params;
  const hoje = dataLocalDoInstante(new Date());
  const c = await obterContaAPagar(id, hoje);
  if (!c) notFound();
  const opcoes = await opcoesDeContaAPagar();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/financeiro/pagar" className="text-muted-foreground hover:underline">
          ← A pagar
        </Link>
      </p>
      <CabecalhoPagina titulo={c.descricao} descricao={[c.favorecido, c.categoria].filter(Boolean).join(" · ") || undefined} acoes={<SeloDaSituacao resumo={c.resumo} />} />

      <div className="grid gap-6">
        <section aria-labelledby="titulo-valores" className="grid gap-3 sm:grid-cols-3">
          <h2 id="titulo-valores" className="sr-only">
            Valores
          </h2>
          <div className="rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">Valor da conta</p>
            <p className="text-2xl font-semibold tabular-nums">{formatarMoeda(c.valorCentavos)}</p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">Já pago</p>
            <p className="text-2xl font-semibold tabular-nums">{formatarMoeda(c.valorPagoCentavos)}</p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">Falta pagar</p>
            <p className="text-2xl font-semibold tabular-nums">{formatarMoeda(c.resumo.saldoCentavos)}</p>
          </div>
        </section>

        <AcoesDePagar
          conta={{ id: c.id, status: c.status as "ABERTA" | "PARCIAL" | "PAGA" | "CANCELADA", descricao: c.descricao, valorCentavos: c.valorCentavos, valorPagoCentavos: c.valorPagoCentavos, saldoCentavos: c.resumo.saldoCentavos, forma: c.forma }}
          contas={opcoes.contas}
          hoje={hoje}
        />

        <dl className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Item rotulo="Vencimento">{formatarDataCalendario(c.vencimento)}</Item>
          <Item rotulo="Competência">{`${c.competencia.slice(5, 7)}/${c.competencia.slice(0, 4)}`}</Item>
          <Item rotulo="Forma">{c.forma ? (ROTULO_FORMA[c.forma as FormaPagamento] ?? c.forma) : "—"}</Item>
          <Item rotulo="Categoria">{c.categoria ?? "Sem categoria"}</Item>
          <Item rotulo="Favorecido">{c.favorecido ?? "—"}</Item>
          {c.obra && c.projetoId ? (
            <Item rotulo="Obra (custo direto)">
              <Link href={`/obras/${c.projetoId}`} className="hover:underline">
                {c.obra}
              </Link>
            </Item>
          ) : null}
          {c.parcela ? (
            <Item rotulo="Parcela">
              {c.parcela.numero} de {c.parcela.total}
            </Item>
          ) : null}
          {c.recorrencia ? (
            <Item rotulo="Recorrência">
              <Link href="/financeiro/pagar/recorrencias" className="hover:underline">
                {ROTULO_PERIODICIDADE[c.recorrencia.periodicidade as keyof typeof ROTULO_PERIODICIDADE]}, dia {c.recorrencia.diaVencimento}
              </Link>
              {!c.recorrencia.ativo ? " (encerrada)" : ""}
            </Item>
          ) : null}
          {c.observacao ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <Item rotulo="Observação">
                <span className="whitespace-pre-line">{c.observacao}</span>
              </Item>
            </div>
          ) : null}
        </dl>

        <section aria-labelledby="titulo-pagamentos" className="grid gap-3">
          <h2 id="titulo-pagamentos" className="font-medium">
            Pagamentos
          </h2>
          {c.pagamentos.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Nenhum pagamento registrado ainda.</p>
          ) : (
            <ul className="grid gap-2">
              {c.pagamentos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                  <div className="grid gap-0.5">
                    <Link href={`/financeiro/lancamentos/${p.id}`} className={p.estornadoEm ? "text-muted-foreground line-through" : "font-medium hover:underline"}>
                      {formatarMoeda(p.valorCentavos)} em {formatarDataCalendario(p.data)}
                    </Link>
                    <span className="text-muted-foreground text-xs">
                      {p.contaNome}
                      {p.forma ? ` · ${ROTULO_FORMA[p.forma as FormaPagamento] ?? p.forma}` : ""}
                      {p.comNotaFiscal ? " · com nota" : ""} · abra o lançamento para anexar o comprovante
                    </span>
                  </div>
                  {p.estornadoEm ? (
                    <Badge variant="destructive">
                      Estornado em {formatarData(p.estornadoEm)}
                      {p.motivoEstorno ? `: ${p.motivoEstorno}` : ""}
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
