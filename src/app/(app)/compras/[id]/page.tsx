import { FileText, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { ROTULO_STATUS_DA_COMPRA } from "@/lib/dominio/compras";
import { formatarQuantidade } from "@/lib/dominio/estoque";
import { dataLocalDoInstante, formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { AcoesDaCompra, BotaoEstornarRecebimento } from "@/modules/compras/components/acoes-da-compra";
import { mensagemDoPedido } from "@/modules/compras/pedido";
import { obterCompra, opcoesDeCompra } from "@/modules/compras/queries";

export const metadata: Metadata = { title: "Compra" };

const ROTULO_CONTA = { ABERTA: "Em aberto", PARCIAL: "Paga em parte", PAGA: "Paga", CANCELADA: "Cancelada" } as const;

export default async function PaginaDaCompra({ params }: { params: Promise<{ id: string }> }) {
  await exigirSessao();
  const { id } = await params;
  const hoje = dataLocalDoInstante(new Date());
  const compra = await obterCompra(id, hoje);
  if (!compra) notFound();
  const [{ categoriasDeDespesa }, mensagem] = await Promise.all([opcoesDeCompra(), mensagemDoPedido(compra)]);
  const sigla = (u: string) => u.toLowerCase();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/compras" className="text-muted-foreground hover:underline">
          ← Compras
        </Link>
      </p>
      <CabecalhoPagina
        titulo={`Compra ${compra.numero}`}
        descricao={`${compra.fornecedor} · ${compra.tipo === "VIDRO" ? "vidro sob medida" : "material"} · ${compra.destino === "OBRA" ? "custo direto da obra" : "para o estoque"}`}
        acoes={
          <>
            <Badge variant={compra.status === "RECEBIDO" ? "secondary" : compra.status === "CANCELADO" ? "outline" : "default"}>{ROTULO_STATUS_DA_COMPRA[compra.status]}</Badge>
            {compra.atrasada ? <Badge variant="destructive">Entrega atrasada</Badge> : null}
          </>
        }
      />

      <div className="grid gap-6">
        <AcoesDaCompra compra={compra} categoriasDeDespesa={categoriasDeDespesa} hoje={hoje} />

        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/compras/${compra.id}/pdf`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
            <FileText aria-hidden /> PDF do pedido
          </a>
          {mensagem.link ? (
            <a href={mensagem.link} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
              <MessageCircle aria-hidden /> Enviar por WhatsApp
            </a>
          ) : (
            <span className="text-muted-foreground text-sm" title="Cadastre o telefone do fornecedor para gerar o link do WhatsApp.">
              WhatsApp indisponível: o fornecedor não tem telefone cadastrado.
            </span>
          )}
        </div>
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer">Ver a mensagem do pedido</summary>
          <p className="mt-2 rounded-lg border p-3 whitespace-pre-line">{mensagem.texto}</p>
        </details>

        <dl className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">Fornecedor</dt>
            <dd className="text-sm">
              <Link href={`/fornecedores/${compra.fornecedorId}`} className="hover:underline">
                {compra.fornecedor}
              </Link>
            </dd>
          </div>
          {compra.obra ? (
            <div className="grid gap-0.5">
              <dt className="text-muted-foreground text-xs">Obra</dt>
              <dd className="text-sm">
                <Link href={`/obras/${compra.projetoId}`} className="hover:underline">
                  {compra.obra}
                </Link>
              </dd>
            </div>
          ) : null}
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">Pedido em</dt>
            <dd className="text-sm">{compra.dataPedido ? formatarDataCalendario(compra.dataPedido) : "Ainda é rascunho"}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">Previsão de entrega</dt>
            <dd className="text-sm">{compra.previsaoEntrega ? formatarDataCalendario(compra.previsaoEntrega) : "Não informada"}</dd>
          </div>
          {compra.condicoes ? (
            <div className="grid gap-0.5 sm:col-span-2">
              <dt className="text-muted-foreground text-xs">Condições</dt>
              <dd className="text-sm">{compra.condicoes}</dd>
            </div>
          ) : null}
          {compra.observacao ? (
            <div className="grid gap-0.5 sm:col-span-2 lg:col-span-4">
              <dt className="text-muted-foreground text-xs">Observação</dt>
              <dd className="text-sm whitespace-pre-line">{compra.observacao}</dd>
            </div>
          ) : null}
        </dl>

        <section aria-labelledby="titulo-itens" className="grid gap-3">
          <h2 id="titulo-itens" className="font-medium">
            Itens
          </h2>
          <ul className="grid gap-2">
            {compra.itens.map((i) => (
              <li key={i.id} className="grid gap-1 rounded-xl border p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
                <div className="grid gap-0.5">
                  <p className="font-medium">
                    {i.ordem}. {i.produtoId ? (
                      <Link href={`/produtos/${i.produtoId}`} className="hover:underline">
                        {i.codigoProduto} · {i.produto}
                      </Link>
                    ) : (
                      i.descricao
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {i.larguraMm && i.alturaMm ? `${i.larguraMm} × ${i.alturaMm} mm` : ""}
                    {i.espessuraMm ? ` · ${i.espessuraMm} mm` : ""}
                    {i.tipoVidro ? ` · ${i.tipoVidro}` : ""}
                    {i.beneficiamentos ? ` · ${i.beneficiamentos}` : ""}
                    {i.produtoId && i.descricao ? ` · ${i.descricao}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular-nums">
                    {formatarQuantidade(i.recebidaMilesimos)} de {formatarQuantidade(i.quantidadeMilesimos)} {sigla(i.unidadeCompra)} recebidos
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {i.precoUnitarioCentavos !== null ? `${formatarMoeda(i.precoUnitarioCentavos)} por ${sigla(i.unidadeCompra)}` : <Badge variant="outline">Sem preço</Badge>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-right text-sm" role="status">
            Total do pedido: <strong className="tabular-nums">{formatarMoeda(compra.totalCentavos)}</strong>
            {compra.itensSemPreco > 0 ? <span className="text-muted-foreground"> ({compra.itensSemPreco} item(ns) sem preço)</span> : null}
          </p>
        </section>

        <section aria-labelledby="titulo-recebimentos" className="grid gap-3">
          <h2 id="titulo-recebimentos" className="font-medium">
            Recebimentos
          </h2>
          {compra.recebimentos.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Nada foi recebido ainda.</p>
          ) : (
            <ul className="grid gap-2">
              {compra.recebimentos.map((r) => (
                <li key={r.id} className="grid gap-1 rounded-xl border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {formatarDataCalendario(r.data)} · <span className="tabular-nums">{formatarMoeda(r.valorCentavos)}</span>
                    </p>
                    <BotaoEstornarRecebimento recebimentoId={r.id} rotulo={`Recebimento de ${formatarDataCalendario(r.data)} da compra ${compra.numero}`} />
                  </div>
                  <ul className="text-muted-foreground text-xs">
                    {r.itens.map((x, n) => (
                      <li key={n}>
                        {x.descricao}: {formatarQuantidade(x.quantidadeCompraMilesimos)}
                        {x.quantidadeCompraMilesimos !== x.quantidadeEstoqueMilesimos ? ` (entraram ${formatarQuantidade(x.quantidadeEstoqueMilesimos)} no estoque)` : ""}
                        {x.valorCentavos !== null ? ` · ${formatarMoeda(x.valorCentavos)}` : " · sem preço"}
                      </li>
                    ))}
                  </ul>
                  {r.observacao ? <p className="text-muted-foreground text-xs">{r.observacao}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {compra.contasPagar.length > 0 ? (
          <section aria-labelledby="titulo-contas" className="grid gap-3">
            <h2 id="titulo-contas" className="font-medium">
              Contas a pagar desta compra
            </h2>
            <ul className="grid gap-2">
              {compra.contasPagar.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
                  <Link href={`/financeiro/pagar/${c.id}`} className="hover:underline">
                    {c.descricao}
                  </Link>
                  <span className="tabular-nums">
                    {formatarMoeda(c.valorCentavos)} · vence {formatarDataCalendario(c.vencimento)} · {ROTULO_CONTA[c.status as keyof typeof ROTULO_CONTA] ?? c.status}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">A conta é só o pagamento: o custo da obra é lido do recebimento, então nada é contado duas vezes.</p>
          </section>
        ) : null}

        <div>
          <Link href="/compras" className={buttonVariants({ variant: "outline" })}>
            Voltar para as compras
          </Link>
        </div>
      </div>
    </>
  );
}
