import { Download, FolderKanban, Plus } from "lucide-react";
import Link from "next/link";

import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltrosDaLista } from "@/components/lista/filtros-da-lista";
import { FiltrosSalvos } from "@/components/lista/filtros-salvos";
import { ListaDeRegistros, type ColunaLista, type LinhaLista } from "@/components/lista/lista-de-registros";
import { PaginacaoLista } from "@/components/lista/paginacao-lista";
import { buttonVariants } from "@/components/ui/button";
import { ROTULO_STATUS_PROJETO } from "@/lib/dominio/funil";
import { formatarData, formatarMoeda } from "@/lib/formatadores";
import { montarConsulta, type ParametrosBrutos } from "@/lib/listas/parametros";
import { ROTULO_ORIGEM } from "@/modules/clientes/schemas";
import { listarFiltrosSalvos } from "@/modules/filtros/queries";
import { listarUsuariosAtivos } from "@/modules/tarefas/queries";

import { excluirProjetos } from "../actions/projetos";
import { lerListaProjetos, listarProjetos, type ProjetoDaLista } from "../queries";
import { ROTULO_PORTE, ROTULO_TEMPERATURA } from "../schemas";
import { FiltrosDeProjetos, haFiltroDeProjeto, parametrosDosFiltros } from "./filtros-de-projetos";

const COLUNAS: ColunaLista[] = [
  { id: "titulo", rotulo: "Projeto", ordenavel: "titulo" },
  { id: "status", rotulo: "Fase" },
  { id: "responsavel", rotulo: "Responsável" },
  { id: "valor", rotulo: "Valor estimado", ordenavel: "valor" },
  { id: "movimentacao", rotulo: "Parado há", ordenavel: "movimentacao" },
  { id: "origem", rotulo: "Origem", escondidaPorPadrao: true },
  { id: "porte", rotulo: "Porte", escondidaPorPadrao: true },
  { id: "temperatura", rotulo: "Temperatura", escondidaPorPadrao: true },
  { id: "criadoEm", rotulo: "Criado em", ordenavel: "criadoEm", escondidaPorPadrao: true },
];

function paraLinha(p: ProjetoDaLista): LinhaLista {
  return {
    id: p.id,
    href: `/projetos/${p.id}`,
    celulas: {
      titulo: { texto: p.titulo, sub: `${p.codigo} · ${p.clienteNome}` },
      status: { texto: "", marcas: [{ texto: ROTULO_STATUS_PROJETO[p.status], variante: p.status === "PERDIDO" ? "destructive" : p.status === "APROVADO" ? "default" : "secondary" }] },
      responsavel: p.responsavelNome,
      valor: p.valorEstimadoCentavos !== null ? { texto: formatarMoeda(p.valorEstimadoCentavos), direita: true } : null,
      movimentacao: p.diasParado === 0 ? "hoje" : `${p.diasParado} ${p.diasParado === 1 ? "dia" : "dias"}`,
      origem: p.origem ? (ROTULO_ORIGEM[p.origem as keyof typeof ROTULO_ORIGEM] ?? p.origem) : null,
      porte: p.porte ? (ROTULO_PORTE[p.porte as keyof typeof ROTULO_PORTE] ?? p.porte) : null,
      temperatura: p.temperatura ? (ROTULO_TEMPERATURA[p.temperatura as keyof typeof ROTULO_TEMPERATURA] ?? p.temperatura) : null,
      criadoEm: formatarData(p.criadoEm),
    },
  };
}

/** Lista de projetos: busca, filtros, ordenação, paginação, colunas, filtros salvos e CSV (spec 7.3, visão em lista). */
export async function PainelListaProjetos({ brutos, usuarioId }: { brutos: ParametrosBrutos; usuarioId: string }) {
  const { parametros, filtros } = lerListaProjetos(brutos);
  const [{ linhas, paginacao }, salvos, usuarios] = await Promise.all([
    listarProjetos(parametros, filtros),
    listarFiltrosSalvos(usuarioId, "projetos"),
    listarUsuariosAtivos(),
  ]);

  const padrao = parametros.ordem === "movimentacao" && parametros.direcao === "desc";
  const atuais = {
    busca: parametros.busca,
    ...parametrosDosFiltros(filtros),
    ordem: padrao ? undefined : parametros.ordem,
    direcao: padrao ? undefined : parametros.direcao,
    tamanho: parametros.tamanho === 25 ? undefined : parametros.tamanho,
  };
  const filtrado = haFiltroDeProjeto(parametros.busca, filtros, true);
  const consultaDoFiltro = montarConsulta({ ...atuais, tamanho: undefined }).replace(/^\?/, "");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <FiltrosDaLista base="/projetos" busca={parametros.busca} placeholderBusca="Código, título ou cliente" mantidos={{ ordem: atuais.ordem, direcao: atuais.direcao, tamanho: atuais.tamanho }} filtrado={filtrado}>
          <FiltrosDeProjetos filtros={filtros} usuarios={usuarios} comFase />
        </FiltrosDaLista>
        <div className="flex flex-wrap items-center gap-2">
          <FiltrosSalvos tela="projetos" base="/projetos" consultaAtual={consultaDoFiltro} salvos={salvos} />
          <a href={`/api/exportar/projetos${montarConsulta(atuais)}`} className={buttonVariants({ variant: "outline", className: "h-9" })}>
            <Download aria-hidden /> Exportar CSV
          </a>
        </div>
      </div>

      {linhas.length === 0 ? (
        filtrado ? (
          <EstadoVazio
            icone={FolderKanban}
            titulo="Nenhum projeto nesse filtro"
            descricao="Confira a busca e os filtros, ou limpe tudo para ver a lista completa. A busca ignora acentos e maiúsculas."
            acao={
              <Link href="/projetos" className={buttonVariants({ variant: "outline" })}>
                Limpar filtros
              </Link>
            }
          />
        ) : (
          <EstadoVazio
            icone={FolderKanban}
            titulo="Nenhum projeto ainda"
            descricao="Um projeto nasce quando um cliente pede um orçamento. Crie o primeiro e acompanhe-o no funil até a proposta ser aprovada."
            acao={
              <Link href="/projetos/novo" className={buttonVariants()}>
                <Plus aria-hidden /> Novo projeto
              </Link>
            }
          />
        )
      ) : (
        <>
          <ListaDeRegistros
            tela="projetos"
            base="/projetos"
            atuais={{ ...atuais, pagina: undefined }}
            ordem={parametros.ordem}
            direcao={parametros.direcao}
            colunas={COLUNAS}
            linhas={linhas.map(paraLinha)}
            acoes={[
              {
                rotulo: "Enviar à lixeira",
                executar: excluirProjetos,
                confirmar: { titulo: "Enviar os projetos marcados para a lixeira?", descricao: "Eles saem das listas, do funil e da busca, e podem ser restaurados depois na Lixeira.", botao: "Enviar à lixeira" },
              },
            ]}
          />
          <PaginacaoLista base="/projetos" atuais={atuais} paginacao={paginacao} tamanho={parametros.tamanho} />
        </>
      )}
    </>
  );
}
