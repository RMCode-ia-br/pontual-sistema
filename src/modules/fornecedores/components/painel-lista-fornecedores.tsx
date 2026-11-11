import { Download, Plus, Truck } from "lucide-react";
import Link from "next/link";

import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltroSelect, FiltrosDaLista } from "@/components/lista/filtros-da-lista";
import { FiltrosSalvos } from "@/components/lista/filtros-salvos";
import { ListaDeRegistros, type ColunaLista, type LinhaLista } from "@/components/lista/lista-de-registros";
import { PaginacaoLista } from "@/components/lista/paginacao-lista";
import { buttonVariants } from "@/components/ui/button";
import { formatarData, formatarTelefone } from "@/lib/formatadores";
import { montarConsulta, type ParametrosBrutos } from "@/lib/listas/parametros";
import { formatarCnpj } from "@/lib/validadores";
import { listarFiltrosSalvos } from "@/modules/filtros/queries";

import { excluirFornecedores, inativarFornecedores, reativarFornecedores } from "../actions";
import { lerListaFornecedores, listarCategoriasAtivas, listarFornecedores, type FornecedorDaLista } from "../queries";

const COLUNAS: ColunaLista[] = [
  { id: "nome", rotulo: "Fornecedor", ordenavel: "nome" },
  { id: "contato", rotulo: "Contato" },
  { id: "categorias", rotulo: "O que fornece" },
  { id: "prazo", rotulo: "Prazo de entrega" },
  { id: "cnpj", rotulo: "CNPJ", escondidaPorPadrao: true },
  { id: "criadoEm", rotulo: "Cadastrado em", ordenavel: "criadoEm", escondidaPorPadrao: true },
];

function paraLinha(f: FornecedorDaLista): LinhaLista {
  const subContato = [f.vendedorNome, f.email].filter(Boolean).join(" · ");
  return {
    id: f.id,
    href: `/fornecedores/${f.id}`,
    inativa: !f.ativo,
    celulas: {
      nome: { texto: f.razaoSocial, sub: [f.nomeFantasia, f.ativo ? null : "Inativo"].filter(Boolean).join(" · ") || undefined },
      contato: f.telefone || subContato ? { texto: f.telefone ? formatarTelefone(f.telefone) : subContato, sub: f.telefone && subContato ? subContato : undefined } : null,
      categorias: f.categorias.length ? { texto: "", marcas: f.categorias.map((c) => ({ texto: c })) } : null,
      prazo: f.prazoEntregaDias !== null ? `${f.prazoEntregaDias} ${f.prazoEntregaDias === 1 ? "dia" : "dias"}` : null,
      cnpj: f.cnpj ? formatarCnpj(f.cnpj) : null,
      criadoEm: formatarData(f.criadoEm),
    },
  };
}

export async function PainelListaFornecedores({ brutos, usuarioId }: { brutos: ParametrosBrutos; usuarioId: string }) {
  const { parametros, filtros } = lerListaFornecedores(brutos);
  const [{ linhas, paginacao }, categorias, salvos] = await Promise.all([
    listarFornecedores(parametros, filtros),
    listarCategoriasAtivas(),
    listarFiltrosSalvos(usuarioId, "fornecedores"),
  ]);

  const padrao = parametros.ordem === "nome" && parametros.direcao === "asc";
  const atuais = {
    busca: parametros.busca,
    categoria: filtros.categoria,
    situacao: filtros.situacao === "ativos" ? undefined : filtros.situacao,
    ordem: padrao ? undefined : parametros.ordem,
    direcao: padrao ? undefined : parametros.direcao,
    tamanho: parametros.tamanho === 25 ? undefined : parametros.tamanho,
  };
  const filtrado = !!(parametros.busca || filtros.categoria || filtros.situacao !== "ativos");
  const consultaDoFiltro = montarConsulta({ ...atuais, tamanho: undefined }).replace(/^\?/, "");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <FiltrosDaLista base="/fornecedores" busca={parametros.busca} placeholderBusca="Nome, CNPJ, vendedor, telefone ou e-mail" mantidos={{ ordem: atuais.ordem, direcao: atuais.direcao, tamanho: atuais.tamanho }} filtrado={filtrado}>
          <FiltroSelect nome="categoria" rotulo="O que fornece" valor={filtros.categoria} opcoes={categorias.map((c) => ({ valor: c.id, rotulo: c.nome }))} />
          <FiltroSelect nome="situacao" rotulo="Situação" valor={filtros.situacao === "ativos" ? undefined : filtros.situacao} todos="Ativos" opcoes={[{ valor: "inativos", rotulo: "Inativos" }, { valor: "todos", rotulo: "Todos" }]} />
        </FiltrosDaLista>
        <div className="flex flex-wrap items-center gap-2">
          <FiltrosSalvos tela="fornecedores" base="/fornecedores" consultaAtual={consultaDoFiltro} salvos={salvos} />
          <a href={`/api/exportar/fornecedores${montarConsulta(atuais)}`} className={buttonVariants({ variant: "outline", className: "h-9" })}>
            <Download aria-hidden /> Exportar CSV
          </a>
        </div>
      </div>

      {linhas.length === 0 ? (
        filtrado ? (
          <EstadoVazio
            icone={Truck}
            titulo="Nenhum fornecedor nesse filtro"
            descricao="Confira a busca e os filtros, ou limpe tudo para ver a lista completa. A busca ignora acentos e maiúsculas."
            acao={
              <Link href="/fornecedores" className={buttonVariants({ variant: "outline" })}>
                Limpar filtros
              </Link>
            }
          />
        ) : (
          <EstadoVazio
            icone={Truck}
            titulo="Nenhum fornecedor cadastrado ainda"
            descricao="Cadastre quem vende perfis, vidros e ferragens para a Pontual, com contato, prazo e condições. Também dá para importar uma planilha."
            acao={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/fornecedores/novo" className={buttonVariants()}>
                  <Plus aria-hidden /> Novo fornecedor
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
            tela="fornecedores"
            base="/fornecedores"
            atuais={{ ...atuais, pagina: undefined }}
            ordem={parametros.ordem}
            direcao={parametros.direcao}
            colunas={COLUNAS}
            linhas={linhas.map(paraLinha)}
            acoes={[
              { rotulo: "Inativar", executar: inativarFornecedores, confirmar: { titulo: "Inativar os fornecedores marcados?", descricao: "Eles saem das listas padrão e das escolhas, mas nada é apagado. Dá para reativar depois.", botao: "Inativar" } },
              { rotulo: "Reativar", executar: reativarFornecedores },
              { rotulo: "Enviar à lixeira", executar: excluirFornecedores, confirmar: { titulo: "Enviar os fornecedores marcados para a lixeira?", descricao: "Eles saem das listas e da busca, e podem ser restaurados depois na Lixeira. Os produtos deles continuam cadastrados.", botao: "Enviar à lixeira" } },
            ]}
          />
          <PaginacaoLista base="/fornecedores" atuais={atuais} paginacao={paginacao} tamanho={parametros.tamanho} />
        </>
      )}
    </>
  );
}
