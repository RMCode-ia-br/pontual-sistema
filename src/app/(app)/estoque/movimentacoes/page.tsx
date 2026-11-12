import { ClipboardList, Download, PackageSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltroSelect, FiltrosDaLista } from "@/components/lista/filtros-da-lista";
import { PaginacaoLista } from "@/components/lista/paginacao-lista";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirSessao } from "@/lib/auth/sessao";
import { ROTULO_TIPO_DE_MOVIMENTO, type TipoDeMovimento } from "@/lib/dominio/estoque";
import { montarConsulta } from "@/lib/listas/parametros";
import { ListaDeMovimentos } from "@/modules/estoque/components/lista-de-movimentos";
import { lerListaMovimentos, listarMovimentos } from "@/modules/estoque/queries";

export const metadata: Metadata = { title: "Movimentações de estoque" };

export default async function PaginaMovimentacoes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const brutos = await searchParams;
  const { parametros, filtros } = lerListaMovimentos(brutos);
  const { linhas, paginacao } = await listarMovimentos(parametros, filtros);

  const padrao = parametros.ordem === "data" && parametros.direcao === "desc";
  const atuais = {
    busca: parametros.busca,
    tipo: filtros.tipo,
    de: filtros.de,
    ate: filtros.ate,
    ordem: padrao ? undefined : parametros.ordem,
    direcao: padrao ? undefined : parametros.direcao,
    tamanho: parametros.tamanho === 25 ? undefined : parametros.tamanho,
  };
  const filtrado = !!(parametros.busca || filtros.tipo || filtros.de || filtros.ate);

  return (
    <>
      <CabecalhoPagina
        titulo="Movimentações de estoque"
        descricao="Entradas, saídas para obra, devoluções, ajustes e perdas. O saldo de cada produto é a soma destes movimentos."
        acoes={
          <Link href="/estoque/inventario-inicial" className={buttonVariants({ variant: "outline" })}>
            <ClipboardList aria-hidden /> Contagem inicial
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <FiltrosDaLista base="/estoque/movimentacoes" busca={parametros.busca} placeholderBusca="Código ou descrição do produto" mantidos={{ ordem: atuais.ordem, direcao: atuais.direcao, tamanho: atuais.tamanho }} filtrado={filtrado}>
          <FiltroSelect
            nome="tipo"
            rotulo="Tipo"
            valor={filtros.tipo}
            opcoes={(Object.keys(ROTULO_TIPO_DE_MOVIMENTO) as TipoDeMovimento[]).map((t) => ({ valor: t, rotulo: ROTULO_TIPO_DE_MOVIMENTO[t] }))}
          />
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">De</span>
            <Input type="date" name="de" defaultValue={filtros.de ?? ""} className="h-9" />
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Até</span>
            <Input type="date" name="ate" defaultValue={filtros.ate ?? ""} className="h-9" />
          </label>
        </FiltrosDaLista>
        <a href={`/api/exportar/estoque/movimentacoes${montarConsulta(atuais)}`} className={buttonVariants({ variant: "outline", className: "h-9" })}>
          <Download aria-hidden /> Exportar CSV
        </a>
      </div>

      {linhas.length === 0 ? (
        filtrado ? (
          <EstadoVazio
            icone={PackageSearch}
            titulo="Nenhuma movimentação nesse filtro"
            descricao="Confira a busca e as datas, ou limpe tudo para ver todas as movimentações."
            acao={
              <Link href="/estoque/movimentacoes" className={buttonVariants({ variant: "outline" })}>
                Limpar filtros
              </Link>
            }
          />
        ) : (
          <EstadoVazio
            icone={PackageSearch}
            titulo="Nenhuma movimentação ainda"
            descricao="O estoque começa vazio: nada foi inventado. Registre movimentos pela ficha de cada produto, ou faça a contagem inicial do que já existe na fábrica (opcional)."
            acao={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/estoque/inventario-inicial" className={buttonVariants()}>
                  Fazer a contagem inicial
                </Link>
                <Link href="/produtos" className={buttonVariants({ variant: "outline" })}>
                  Ver os produtos
                </Link>
              </div>
            }
          />
        )
      ) : (
        <>
          <ListaDeMovimentos movimentos={linhas} />
          <PaginacaoLista base="/estoque/movimentacoes" atuais={atuais} paginacao={paginacao} tamanho={parametros.tamanho} />
        </>
      )}
    </>
  );
}
