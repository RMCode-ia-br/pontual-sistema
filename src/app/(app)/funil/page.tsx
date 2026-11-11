import { FolderKanban, List, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltrosDaLista } from "@/components/lista/filtros-da-lista";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { montarConsulta } from "@/lib/listas/parametros";
import { FiltrosDeProjetos, haFiltroDeProjeto, parametrosDosFiltros } from "@/modules/projetos/components/filtros-de-projetos";
import { Kanban } from "@/modules/projetos/components/kanban";
import { carregarFunil, lerListaProjetos, listarMotivosPerda } from "@/modules/projetos/queries";
import { listarUsuariosAtivos } from "@/modules/tarefas/queries";

export const metadata: Metadata = { title: "Funil" };

export default async function PaginaFunil({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const brutos = await searchParams;
  const { parametros, filtros } = lerListaProjetos(brutos);
  const [colunas, motivos, usuarios] = await Promise.all([carregarFunil(filtros, parametros.busca), listarMotivosPerda(), listarUsuariosAtivos()]);

  // No funil a fase não é filtro: o quadro mostra todas as colunas.
  const filtrado = haFiltroDeProjeto(parametros.busca, filtros, false);
  const semProjetos = colunas.every((c) => c.total === 0);
  const paraLista = montarConsulta({ busca: parametros.busca, ...parametrosDosFiltros({ ...filtros, status: undefined }) });

  return (
    <>
      <CabecalhoPagina
        titulo="Funil"
        descricao="Do primeiro contato à proposta aprovada. Arraste os cartões entre as fases (no celular, segure o cartão ou use “Mover para…”)."
        acoes={
          <>
            <Link href={`/projetos${paraLista}`} className={buttonVariants({ variant: "outline" })}>
              <List aria-hidden /> Ver em lista
            </Link>
            <Link href="/projetos/novo" className={buttonVariants()}>
              <Plus aria-hidden /> Novo projeto
            </Link>
          </>
        }
      />
      <div className="mb-4">
        <FiltrosDaLista base="/funil" busca={parametros.busca} placeholderBusca="Código, título ou cliente" filtrado={filtrado}>
          <FiltrosDeProjetos filtros={filtros} usuarios={usuarios} comFase={false} />
        </FiltrosDaLista>
      </div>

      {semProjetos && !filtrado ? (
        <EstadoVazio
          icone={FolderKanban}
          titulo="O funil está vazio"
          descricao="Cada pedido de orçamento vira um projeto. Crie o primeiro e acompanhe-o daqui até a proposta aprovada."
          acao={
            <Link href="/projetos/novo" className={buttonVariants()}>
              <Plus aria-hidden /> Novo projeto
            </Link>
          }
        />
      ) : (
        <Kanban colunas={colunas} motivos={motivos} filtrado={filtrado} />
      )}
    </>
  );
}
