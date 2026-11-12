import { Download, LifeBuoy, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltroSelect, FiltrosDaLista } from "@/components/lista/filtros-da-lista";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { ROTULO_CLASSIFICACAO } from "@/lib/dominio/garantia";
import { montarConsulta } from "@/lib/listas/parametros";
import { cn } from "@/lib/utils";
import { ListaDeChamados } from "@/modules/obras/components/lista-de-chamados";
import { LIMITE_DE_CHAMADOS, lerFiltrosDeChamados, listarChamados } from "@/modules/obras/queries-chamados";

export const metadata: Metadata = { title: "Assistência e garantia" };

const SITUACOES = [
  ["abertos", "Em aberto"],
  ["resolvidos", "Encerrados"],
  ["todos", "Todos"],
] as const;

export default async function PaginaAssistencia({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const filtros = lerFiltrosDeChamados(await searchParams);
  const { linhas, truncado } = await listarChamados(filtros);
  const filtrado = !!(filtros.busca || filtros.classificacao || filtros.clienteId || filtros.projetoId);
  const consulta = (extra: Record<string, string | undefined>) => montarConsulta({ situacao: filtros.situacao === "abertos" ? undefined : filtros.situacao, busca: filtros.busca, classificacao: filtros.classificacao, cliente: filtros.clienteId, projeto: filtros.projetoId, ...extra });
  const emGarantia = linhas.filter((c) => c.classificacao === "EM_GARANTIA").length;

  return (
    <>
      <CabecalhoPagina
        titulo="Assistência e garantia"
        descricao="Chamados de clientes depois da instalação. O sistema sugere se está em garantia pela data de conclusão da instalação; você confirma ou ajusta e decide se cobra a visita."
        acoes={
          <div className="flex flex-wrap gap-2">
            <a href={`/api/exportar/chamados${consulta({})}`} className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden /> Exportar CSV
            </a>
            <Link href="/obras/assistencia/novo" className={buttonVariants()}>
              <Plus aria-hidden /> Novo chamado
            </Link>
          </div>
        }
      />

      <nav aria-label="Situação dos chamados" className="bg-muted mb-4 inline-flex rounded-lg p-0.5">
        {SITUACOES.map(([valor, rotulo]) => (
          <Link
            key={valor}
            href={`/obras/assistencia${consulta({ situacao: valor === "abertos" ? undefined : valor })}`}
            aria-current={filtros.situacao === valor ? "page" : undefined}
            className={cn("rounded-md px-3 py-1.5 text-sm", filtros.situacao === valor ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {rotulo}
          </Link>
        ))}
      </nav>

      <div className="mb-4">
        <FiltrosDaLista base="/obras/assistencia" busca={filtros.busca} placeholderBusca="Número, cliente, obra ou texto" mantidos={{ situacao: filtros.situacao === "abertos" ? undefined : filtros.situacao, cliente: filtros.clienteId, projeto: filtros.projetoId }} filtrado={filtrado}>
          <FiltroSelect nome="classificacao" rotulo="Garantia" valor={filtros.classificacao} opcoes={(Object.keys(ROTULO_CLASSIFICACAO) as (keyof typeof ROTULO_CLASSIFICACAO)[]).map((c) => ({ valor: c, rotulo: ROTULO_CLASSIFICACAO[c] }))} />
        </FiltrosDaLista>
      </div>

      {linhas.length > 0 ? (
        <p className="text-muted-foreground mb-4 text-sm" role="status">
          {linhas.length} {linhas.length === 1 ? "chamado" : "chamados"} · {emGarantia} em garantia
        </p>
      ) : null}

      {truncado ? (
        <p role="note" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Mostrando só os primeiros {LIMITE_DE_CHAMADOS} chamados. Use a busca e os filtros para chegar aos demais.
        </p>
      ) : null}

      {linhas.length === 0 ? (
        <EstadoVazio
          icone={LifeBuoy}
          titulo={filtrado ? "Nenhum chamado com esses filtros" : filtros.situacao === "abertos" ? "Nenhum chamado em aberto" : "Nenhum chamado ainda"}
          descricao="Abra um chamado quando o cliente pedir regulagem, troca de vidro ou qualquer outra assistência."
          acao={
            <Link href="/obras/assistencia/novo" className={buttonVariants()}>
              Novo chamado
            </Link>
          }
        />
      ) : (
        <ListaDeChamados chamados={linhas} />
      )}
    </>
  );
}
