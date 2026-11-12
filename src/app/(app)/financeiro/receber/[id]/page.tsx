import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { ROTULO_FORMA, ROTULO_GATILHO, type FormaPagamento, type Gatilho } from "@/lib/dominio/parcelas";
import { dataLocalDoInstante, formatarData, formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { AcoesDeReceber } from "@/modules/financeiro/components/acoes-de-receber";
import { SeloDaSituacao } from "@/modules/financeiro/components/selo-da-situacao";
import { opcoesDeLancamento } from "@/modules/financeiro/queries";
import { lerParametrosFinanceiros, montarCobrancaDaConta, obterContaAReceber } from "@/modules/financeiro/queries-receber";

export const metadata: Metadata = { title: "Conta a receber" };

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function PaginaDaContaAReceber({ params }: { params: Promise<{ id: string }> }) {
  await exigirSessao();
  const { id } = await params;
  const hoje = dataLocalDoInstante(new Date());
  const c = await obterContaAReceber(id, hoje);
  if (!c) notFound();

  const [opcoes, config, empresa, categoriasDeReceita] = await Promise.all([
    opcoesDeLancamento(),
    lerParametrosFinanceiros(),
    prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { nomeFantasia: true } }),
    prisma.categoriaFinanceira.findMany({ where: { tipo: "RECEITA", ativo: true, deletadoEm: null }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
  ]);
  const cobranca = await montarCobrancaDaConta(c, empresa?.nomeFantasia ?? null);
  const resumo = c.resumo;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/financeiro/receber" className="text-muted-foreground hover:underline">
          ← A receber
        </Link>
      </p>
      <CabecalhoPagina
        titulo={c.descricao}
        descricao={`${c.clienteNome}${c.projetoCodigo ? ` · ${c.projetoCodigo} ${c.projetoTitulo}` : ""}`}
        acoes={<SeloDaSituacao resumo={resumo} />}
      />

      <div className="grid gap-6">
        <section aria-labelledby="titulo-valores" className="grid gap-3 sm:grid-cols-3">
          <h2 id="titulo-valores" className="sr-only">
            Valores
          </h2>
          <div className="rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">Valor da parcela</p>
            <p className="text-2xl font-semibold tabular-nums">{formatarMoeda(c.valorCentavos)}</p>
            {c.percentualPb !== null ? <p className="text-muted-foreground text-xs">{(c.percentualPb / 100).toLocaleString("pt-BR")}% do total aprovado</p> : null}
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">Já recebido</p>
            <p className="text-2xl font-semibold tabular-nums">{formatarMoeda(c.valorPagoCentavos)}</p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">Falta receber</p>
            <p className="text-2xl font-semibold tabular-nums">{formatarMoeda(resumo.saldoCentavos)}</p>
          </div>
        </section>

        <AcoesDeReceber
          conta={{
            id: c.id,
            status: c.status,
            descricao: c.descricao,
            valorCentavos: c.valorCentavos,
            valorPagoCentavos: c.valorPagoCentavos,
            saldoCentavos: resumo.saldoCentavos,
            vencimento: c.vencimento,
            forma: c.forma,
            comNotaFiscal: c.comNotaFiscal,
            categoriaFinanceiraId: c.categoriaFinanceiraId ?? config.categoriaReceitaPadraoId,
          }}
          opcoes={{ contas: opcoes.contas, categoriasDeReceita }}
          hoje={hoje}
          cobranca={cobranca}
        />

        <dl className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Item rotulo="Vencimento">{c.vencimento ? formatarDataCalendario(c.vencimento) : c.status === "AGUARDANDO_GATILHO" ? "Ainda sem data (aguarda a etapa)" : "Sem vencimento definido"}</Item>
          <Item rotulo="Gatilho">{c.gatilho ? (ROTULO_GATILHO[c.gatilho as Gatilho] ?? c.gatilho) : "Cobrança avulsa"}</Item>
          <Item rotulo="Forma">{c.forma ? (ROTULO_FORMA[c.forma as FormaPagamento] ?? c.forma) : "—"}</Item>
          <Item rotulo="Cliente">
            <Link href={`/clientes/${c.cliente.id}`} className="hover:underline">
              {c.cliente.nome}
            </Link>
          </Item>
          {c.projetoId ? (
            <Item rotulo="Obra">
              <Link href={`/obras/${c.projetoId}`} className="hover:underline">
                {c.projetoCodigo} · {c.projetoTitulo}
              </Link>
            </Item>
          ) : null}
          {c.etapa ? (
            <Item rotulo="Etapa que libera esta parcela">
              {c.etapa.nome}
              {c.etapa.status === "CONCLUIDA" ? " (concluída)" : c.etapa.fimPrevisto ? ` · previsão ${formatarDataCalendario(c.etapa.fimPrevisto)}` : ""}
            </Item>
          ) : null}
          {c.chamadoId ? (
            <Item rotulo="Origem">
              <Link href={`/obras/assistencia/${c.chamadoId}`} className="hover:underline">
                Visita de assistência
              </Link>
            </Item>
          ) : null}
          <Item rotulo="Nota fiscal">{c.comNotaFiscal ? <Badge variant="outline">Com nota</Badge> : "Sem nota"}</Item>
          {c.observacao ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <Item rotulo="Observação">
                <span className="whitespace-pre-line">{c.observacao}</span>
              </Item>
            </div>
          ) : null}
        </dl>

        <section aria-labelledby="titulo-recebimentos" className="grid gap-3">
          <h2 id="titulo-recebimentos" className="font-medium">
            Recebimentos
          </h2>
          {c.recebimentos.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Nenhum recebimento registrado ainda.</p>
          ) : (
            <ul className="grid gap-2">
              {c.recebimentos.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                  <div className="grid gap-0.5">
                    <Link href={`/financeiro/lancamentos/${r.id}`} className={r.estornadoEm ? "text-muted-foreground line-through" : "font-medium hover:underline"}>
                      {formatarMoeda(r.valorCentavos)} em {formatarDataCalendario(r.data)}
                    </Link>
                    <span className="text-muted-foreground text-xs">
                      {r.contaNome}
                      {r.forma ? ` · ${ROTULO_FORMA[r.forma as FormaPagamento] ?? r.forma}` : ""}
                      {r.comNotaFiscal ? " · com nota" : ""}
                    </span>
                  </div>
                  {r.estornadoEm ? (
                    <Badge variant="destructive">
                      Estornado em {formatarData(r.estornadoEm)}
                      {r.motivoEstorno ? `: ${r.motivoEstorno}` : ""}
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
