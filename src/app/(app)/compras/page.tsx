import { Download, Plus, ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltrosDaLista } from "@/components/lista/filtros-da-lista";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { ROTULO_STATUS_DA_COMPRA } from "@/lib/dominio/compras";
import { dataLocalDoInstante, formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { ABAS_DE_COMPRAS, lerFiltroDeCompras, listarCompras } from "@/modules/compras/queries";

export const metadata: Metadata = { title: "Compras" };

export default async function PaginaCompras({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const filtro = lerFiltroDeCompras(await searchParams);
  const hoje = dataLocalDoInstante(new Date());
  const { linhas, temMais, contagens } = await listarCompras(filtro, hoje);
  const consulta = (aba: string) => `/compras?aba=${aba}${filtro.busca ? `&busca=${encodeURIComponent(filtro.busca)}` : ""}`;

  return (
    <>
      <CabecalhoPagina
        titulo="Compras"
        descricao="Pedidos de material e de vidro. O recebimento dá entrada no estoque (ou vira custo direto da obra) e pode gerar a conta a pagar."
        acoes={
          <>
            <a href={`/api/exportar/compras?aba=${filtro.aba}${filtro.busca ? `&busca=${encodeURIComponent(filtro.busca)}` : ""}`} className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden /> Exportar CSV
            </a>
            <Link href="/compras/nova" className={buttonVariants()}>
              <Plus aria-hidden /> Nova compra
            </Link>
          </>
        }
      />

      <nav aria-label="Situação das compras" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {ABAS_DE_COMPRAS.map((a) => (
          <Link
            key={a.id}
            href={consulta(a.id)}
            aria-current={filtro.aba === a.id ? "page" : undefined}
            className={cn("inline-flex min-h-10 shrink-0 items-center gap-1 border-b-2 px-3 text-sm", filtro.aba === a.id ? "border-primary text-primary font-medium" : "text-muted-foreground hover:text-foreground border-transparent")}
          >
            {a.rotulo} <span className="text-muted-foreground text-xs">({contagens[a.id]})</span>
          </Link>
        ))}
      </nav>

      <div className="mb-4">
        <FiltrosDaLista base="/compras" busca={filtro.busca ?? ""} placeholderBusca="Número, fornecedor ou obra" mantidos={{ aba: filtro.aba === "abertas" ? undefined : filtro.aba }} filtrado={!!filtro.busca} />
      </div>

      {linhas.length === 0 ? (
        <EstadoVazio
          icone={ShoppingCart}
          titulo={filtro.busca ? "Nenhuma compra nessa busca" : "Nenhuma compra aqui"}
          descricao={filtro.busca ? "Confira a busca ou olhe a aba “Todas”." : "Lance o pedido de perfis, ferragens ou vidros ao fornecedor. Produto e fornecedor que ainda não existem se cadastram na hora, dentro do pedido."}
          acao={
            <Link href="/compras/nova" className={buttonVariants()}>
              <Plus aria-hidden /> Nova compra
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-2">
          {linhas.map((c) => (
            <li key={c.id} className="grid gap-1 rounded-xl border p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
              <div className="grid gap-0.5">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <Link href={`/compras/${c.id}`} className="hover:underline">
                    {c.numero} · {c.fornecedor}
                  </Link>
                  <Badge variant={c.status === "RECEBIDO" ? "secondary" : c.status === "CANCELADO" ? "outline" : "default"}>{ROTULO_STATUS_DA_COMPRA[c.status]}</Badge>
                  {c.atrasada ? <Badge variant="destructive">Entrega atrasada</Badge> : null}
                </p>
                <p className="text-muted-foreground text-xs">
                  {c.tipo === "VIDRO" ? "Vidro" : "Material"} · {c.destino === "OBRA" ? `obra ${c.obra}` : "estoque"} · {c.itens} item(ns)
                  {c.previsaoEntrega ? ` · previsão ${formatarDataCalendario(c.previsaoEntrega)}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium tabular-nums">{formatarMoeda(c.totalCentavos)}</p>
                {c.itensSemPreco > 0 ? <p className="text-muted-foreground text-xs">{c.itensSemPreco} item(ns) sem preço</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {temMais ? <p className="text-muted-foreground mt-3 text-xs">Mostrando as 200 mais recentes. Use a busca para achar as demais.</p> : null}
    </>
  );
}
