import { Download, Package, Plus, TrendingUp } from "lucide-react";
import Link from "next/link";

import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltroSelect, FiltrosDaLista } from "@/components/lista/filtros-da-lista";
import { FiltrosSalvos } from "@/components/lista/filtros-salvos";
import { ListaDeRegistros, type ColunaLista, type LinhaLista } from "@/components/lista/lista-de-registros";
import { PaginacaoLista } from "@/components/lista/paginacao-lista";
import { buttonVariants } from "@/components/ui/button";
import { formatarData, formatarMoeda } from "@/lib/formatadores";
import { montarConsulta, type ParametrosBrutos } from "@/lib/listas/parametros";
import { listarFiltrosSalvos } from "@/modules/filtros/queries";

import { excluirProdutos, inativarProdutos, reativarProdutos } from "../actions/produtos";
import { lerListaProdutos, listarOpcoesDeProduto, listarProdutos, type ProdutoDaLista } from "../queries";
import { SIGLA_UNIDADE } from "../schemas";

const COLUNAS: ColunaLista[] = [
  // A primeira coluna é o título (e o link) do produto; no celular o código vai como linha de apoio.
  { id: "descricao", rotulo: "Produto", ordenavel: "descricao" },
  { id: "codigo", rotulo: "Código", ordenavel: "codigo", soNaTabela: true },
  { id: "categoria", rotulo: "Categoria" },
  { id: "fornecedor", rotulo: "Fornecedor" },
  { id: "custo", rotulo: "Custo unitário", ordenavel: "custo" },
  { id: "linha", rotulo: "Linha / acabamento", escondidaPorPadrao: true },
  { id: "localizacao", rotulo: "Localização", escondidaPorPadrao: true },
  { id: "atualizadoEm", rotulo: "Atualizado em", ordenavel: "atualizadoEm", escondidaPorPadrao: true },
];

function paraLinha(p: ProdutoDaLista): LinhaLista {
  return {
    id: p.id,
    href: `/produtos/${p.id}`,
    inativa: !p.ativo,
    celulas: {
      descricao: { texto: p.descricao, sub: [p.codigo, p.ativo ? null : "Inativo"].filter(Boolean).join(" · ") },
      codigo: p.codigo,
      categoria: p.categoria,
      fornecedor: p.fornecedor,
      custo:
        p.custoUnitarioCentavos !== null
          ? { texto: `${formatarMoeda(p.custoUnitarioCentavos)} / ${SIGLA_UNIDADE[p.unidade]}`, sub: p.custoAtualizadoEm ? `em ${formatarData(p.custoAtualizadoEm)}` : undefined }
          : { texto: "", marcas: [{ texto: "Sem custo", variante: "outline" as const }] },
      linha: [p.linha, p.acabamento].filter(Boolean).join(" · ") || null,
      localizacao: p.localizacao,
      atualizadoEm: formatarData(p.atualizadoEm),
    },
  };
}

export async function PainelListaProdutos({ brutos, usuarioId }: { brutos: ParametrosBrutos; usuarioId: string }) {
  const { parametros, filtros } = lerListaProdutos(brutos);
  const [{ linhas, paginacao }, opcoes, salvos] = await Promise.all([
    listarProdutos(parametros, filtros),
    listarOpcoesDeProduto(),
    listarFiltrosSalvos(usuarioId, "produtos"),
  ]);

  const padrao = parametros.ordem === "codigo" && parametros.direcao === "asc";
  const atuais = {
    busca: parametros.busca,
    categoria: filtros.categoria,
    linha: filtros.linha,
    fornecedor: filtros.fornecedor,
    custo: filtros.custo,
    situacao: filtros.situacao === "ativos" ? undefined : filtros.situacao,
    ordem: padrao ? undefined : parametros.ordem,
    direcao: padrao ? undefined : parametros.direcao,
    tamanho: parametros.tamanho === 25 ? undefined : parametros.tamanho,
  };
  const filtrado = !!(parametros.busca || filtros.categoria || filtros.linha || filtros.fornecedor || filtros.custo || filtros.situacao !== "ativos");
  const consultaDoFiltro = montarConsulta({ ...atuais, tamanho: undefined }).replace(/^\?/, "");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <FiltrosDaLista base="/produtos" busca={parametros.busca} placeholderBusca="Código, descrição ou localização" mantidos={{ ordem: atuais.ordem, direcao: atuais.direcao, tamanho: atuais.tamanho }} filtrado={filtrado}>
          <FiltroSelect nome="categoria" rotulo="Categoria" valor={filtros.categoria} opcoes={opcoes.categorias.map((c) => ({ valor: c.id, rotulo: c.nome }))} />
          <FiltroSelect nome="fornecedor" rotulo="Fornecedor" valor={filtros.fornecedor} opcoes={opcoes.fornecedores.map((f) => ({ valor: f.id, rotulo: f.nome }))} />
          <FiltroSelect nome="linha" rotulo="Linha" valor={filtros.linha} opcoes={opcoes.linhas.map((l) => ({ valor: l.id, rotulo: l.nome }))} />
          <FiltroSelect nome="custo" rotulo="Custo" valor={filtros.custo} opcoes={[{ valor: "sem", rotulo: "Sem custo informado" }, { valor: "com", rotulo: "Com custo" }, { valor: "antigo", rotulo: "Custo desatualizado (+90 dias)" }]} />
          <FiltroSelect nome="situacao" rotulo="Situação" valor={filtros.situacao === "ativos" ? undefined : filtros.situacao} todos="Ativos" opcoes={[{ valor: "inativos", rotulo: "Inativos" }, { valor: "todos", rotulo: "Todos" }]} />
        </FiltrosDaLista>
        <div className="flex flex-wrap items-center gap-2">
          <FiltrosSalvos tela="produtos" base="/produtos" consultaAtual={consultaDoFiltro} salvos={salvos} />
          <Link href="/produtos/reajuste" className={buttonVariants({ variant: "outline", className: "h-9" })}>
            <TrendingUp aria-hidden /> Reajuste em lote
          </Link>
          <a href={`/api/exportar/produtos${montarConsulta(atuais)}`} className={buttonVariants({ variant: "outline", className: "h-9" })}>
            <Download aria-hidden /> Exportar CSV
          </a>
        </div>
      </div>

      {linhas.length === 0 ? (
        filtrado ? (
          <EstadoVazio
            icone={Package}
            titulo="Nenhum produto nesse filtro"
            descricao="Confira a busca e os filtros, ou limpe tudo para ver a lista completa. A busca ignora acentos e maiúsculas."
            acao={
              <Link href="/produtos" className={buttonVariants({ variant: "outline" })}>
                Limpar filtros
              </Link>
            }
          />
        ) : (
          <EstadoVazio
            icone={Package}
            titulo="Nenhum produto cadastrado ainda"
            descricao="Cadastre perfis, vidros, ferragens e acessórios com o custo de cada um. Para trazer centenas de itens de uma vez, importe uma planilha."
            acao={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/produtos/novo" className={buttonVariants()}>
                  <Plus aria-hidden /> Novo produto
                </Link>
                <Link href="/configuracoes/importacao" className={buttonVariants({ variant: "outline" })}>
                  Importar planilha
                </Link>
              </div>
            }
          />
        )
      ) : (
        <>
          <ListaDeRegistros
            tela="produtos"
            base="/produtos"
            atuais={{ ...atuais, pagina: undefined }}
            ordem={parametros.ordem}
            direcao={parametros.direcao}
            colunas={COLUNAS}
            linhas={linhas.map(paraLinha)}
            acoes={[
              { rotulo: "Inativar", executar: inativarProdutos, confirmar: { titulo: "Inativar os produtos marcados?", descricao: "Eles saem das listas padrão e das escolhas, mas nada é apagado. Dá para reativar depois.", botao: "Inativar" } },
              { rotulo: "Reativar", executar: reativarProdutos },
              { rotulo: "Enviar à lixeira", executar: excluirProdutos, confirmar: { titulo: "Enviar os produtos marcados para a lixeira?", descricao: "Eles saem das listas e da busca, e podem ser restaurados depois na Lixeira. O histórico de preços é preservado.", botao: "Enviar à lixeira" } },
            ]}
          />
          <PaginacaoLista base="/produtos" atuais={atuais} paginacao={paginacao} tamanho={parametros.tamanho} />
        </>
      )}
    </>
  );
}
