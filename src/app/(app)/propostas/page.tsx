import { FileText, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { PaginacaoLista } from "@/components/lista/paginacao-lista";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirSessao } from "@/lib/auth/sessao";
import { Selecao } from "@/components/formulario";
import { listarPropostas } from "@/modules/propostas/queries";
import { ROTULO_STATUS_PROPOSTA, STATUS_PROPOSTA } from "@/modules/propostas/schemas";
import { TabelaPropostas } from "@/modules/propostas/components/tabela-propostas";

export const metadata: Metadata = { title: "Propostas" };

export default async function PaginaPropostas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const brutos = await searchParams;
  const { linhas, paginacao, parametros, filtros } = await listarPropostas(brutos);
  const filtrando = !!(parametros.busca || filtros.status || filtros.projeto || filtros.revisoes === "todas");

  return (
    <>
      <CabecalhoPagina
        titulo="Propostas"
        descricao="Propostas com opções, itens, PDF e aprovação. Cada número é único; revisões usam o mesmo número."
        acoes={
          <Link href="/propostas/nova" className={buttonVariants()}>
            <Plus aria-hidden /> Nova proposta
          </Link>
        }
      />

      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-[1fr_12rem_12rem_auto]" role="search" aria-label="Filtrar propostas">
        <Input name="busca" defaultValue={parametros.busca} placeholder="Buscar por número, cliente ou projeto" aria-label="Buscar propostas" maxLength={80} />
        <Selecao name="status" defaultValue={filtros.status ?? ""} aria-label="Situação">
          <option value="">Todas as situações</option>
          {STATUS_PROPOSTA.map((s) => (
            <option key={s} value={s}>
              {ROTULO_STATUS_PROPOSTA[s]}
            </option>
          ))}
        </Selecao>
        <Selecao name="revisoes" defaultValue={filtros.revisoes} aria-label="Revisões">
          <option value="vigentes">Só a revisão vigente</option>
          <option value="todas">Todas as revisões</option>
        </Selecao>
        <Button type="submit" variant="outline">
          <Search aria-hidden /> Filtrar
        </Button>
      </form>

      {linhas.length === 0 ? (
        <EstadoVazio
          icone={FileText}
          titulo={filtrando ? "Nenhuma proposta encontrada" : "Nenhuma proposta ainda"}
          descricao={filtrando ? "Tente outra busca ou limpe os filtros." : "Crie a primeira proposta a partir de um projeto: ela já nasce com o cliente, o endereço e os textos padrão."}
          acao={
            filtrando ? (
              <Link href="/propostas" className={buttonVariants({ variant: "outline" })}>
                Limpar filtros
              </Link>
            ) : (
              <Link href="/propostas/nova" className={buttonVariants()}>
                Nova proposta
              </Link>
            )
          }
        />
      ) : (
        <>
          <TabelaPropostas propostas={linhas} />
          <PaginacaoLista base="/propostas" atuais={{ busca: parametros.busca || undefined, status: filtros.status, revisoes: filtros.revisoes === "todas" ? "todas" : undefined, tamanho: parametros.tamanho, ordem: parametros.ordem, direcao: parametros.direcao }} paginacao={paginacao} tamanho={parametros.tamanho} />
        </>
      )}
    </>
  );
}
