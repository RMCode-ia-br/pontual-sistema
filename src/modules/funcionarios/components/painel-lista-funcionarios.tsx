import { Download, HardHat, Plus } from "lucide-react";
import Link from "next/link";

import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltroSelect, FiltrosDaLista } from "@/components/lista/filtros-da-lista";
import { FiltrosSalvos } from "@/components/lista/filtros-salvos";
import { ListaDeRegistros, type ColunaLista, type LinhaLista } from "@/components/lista/lista-de-registros";
import { PaginacaoLista } from "@/components/lista/paginacao-lista";
import { buttonVariants } from "@/components/ui/button";
import { formatarDataCalendario, formatarMoeda, formatarTelefone } from "@/lib/formatadores";
import { montarConsulta, type ParametrosBrutos } from "@/lib/listas/parametros";
import { listarFiltrosSalvos } from "@/modules/filtros/queries";

import { excluirFuncionarios, inativarFuncionarios, reativarFuncionarios } from "../actions/funcionarios";
import { lerListaFuncionarios, listarFuncionarios, type FuncionarioDaLista } from "../queries";
import { FUNCOES, ROTULO_FUNCAO } from "../schemas";

const COLUNAS: ColunaLista[] = [
  { id: "nome", rotulo: "Nome", ordenavel: "nome" },
  { id: "funcao", rotulo: "Função" },
  { id: "contato", rotulo: "Contato" },
  { id: "equipes", rotulo: "Equipes" },
  { id: "admissao", rotulo: "Admissão", ordenavel: "admissaoEm", escondidaPorPadrao: true },
  // Dado sensível: escondido até alguém ligar a coluna (e hoje todos veem tudo; ver aviso no cadastro).
  { id: "salario", rotulo: "Salário base", escondidaPorPadrao: true },
];

function paraLinha(f: FuncionarioDaLista): LinhaLista {
  return {
    id: f.id,
    href: `/funcionarios/${f.id}`,
    inativa: !f.ativo,
    celulas: {
      nome: { texto: f.nome, sub: [f.cargo, f.ativo ? null : "Inativo"].filter(Boolean).join(" · ") || undefined },
      funcao: { texto: "", marcas: [{ texto: ROTULO_FUNCAO[f.funcao] }] },
      contato: f.telefone || f.email ? { texto: f.telefone ? formatarTelefone(f.telefone) : (f.email ?? ""), sub: f.telefone && f.email ? f.email : undefined } : null,
      equipes: f.equipes.length ? { texto: "", marcas: f.equipes.map((e) => ({ texto: e, variante: "outline" as const })) } : null,
      admissao: f.admissaoEm ? formatarDataCalendario(f.admissaoEm) : null,
      salario: f.salarioBaseCentavos !== null ? { texto: formatarMoeda(f.salarioBaseCentavos), direita: false } : null,
    },
  };
}

export async function PainelListaFuncionarios({ brutos, usuarioId }: { brutos: ParametrosBrutos; usuarioId: string }) {
  const { parametros, filtros } = lerListaFuncionarios(brutos);
  const [{ linhas, paginacao }, salvos] = await Promise.all([listarFuncionarios(parametros, filtros), listarFiltrosSalvos(usuarioId, "funcionarios")]);

  const padrao = parametros.ordem === "nome" && parametros.direcao === "asc";
  const atuais = {
    busca: parametros.busca,
    funcao: filtros.funcao,
    situacao: filtros.situacao === "ativos" ? undefined : filtros.situacao,
    ordem: padrao ? undefined : parametros.ordem,
    direcao: padrao ? undefined : parametros.direcao,
    tamanho: parametros.tamanho === 25 ? undefined : parametros.tamanho,
  };
  const filtrado = !!(parametros.busca || filtros.funcao || filtros.situacao !== "ativos");
  const consultaDoFiltro = montarConsulta({ ...atuais, tamanho: undefined }).replace(/^\?/, "");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <FiltrosDaLista base="/funcionarios" busca={parametros.busca} placeholderBusca="Nome, cargo, CPF, telefone ou e-mail" mantidos={{ ordem: atuais.ordem, direcao: atuais.direcao, tamanho: atuais.tamanho }} filtrado={filtrado}>
          <FiltroSelect nome="funcao" rotulo="Função" valor={filtros.funcao} opcoes={FUNCOES.map((f) => ({ valor: f, rotulo: ROTULO_FUNCAO[f] }))} />
          <FiltroSelect nome="situacao" rotulo="Situação" valor={filtros.situacao === "ativos" ? undefined : filtros.situacao} todos="Ativos" opcoes={[{ valor: "inativos", rotulo: "Inativos" }, { valor: "todos", rotulo: "Todos" }]} />
        </FiltrosDaLista>
        <div className="flex flex-wrap items-center gap-2">
          <FiltrosSalvos tela="funcionarios" base="/funcionarios" consultaAtual={consultaDoFiltro} salvos={salvos} />
          <a href={`/api/exportar/funcionarios${montarConsulta(atuais)}`} className={buttonVariants({ variant: "outline", className: "h-9" })}>
            <Download aria-hidden /> Exportar CSV
          </a>
        </div>
      </div>

      {linhas.length === 0 ? (
        filtrado ? (
          <EstadoVazio
            icone={HardHat}
            titulo="Nenhum funcionário nesse filtro"
            descricao="Confira a busca e os filtros, ou limpe tudo para ver a lista completa."
            acao={
              <Link href="/funcionarios" className={buttonVariants({ variant: "outline" })}>
                Limpar filtros
              </Link>
            }
          />
        ) : (
          <EstadoVazio
            icone={HardHat}
            titulo="Nenhum funcionário cadastrado ainda"
            descricao="Cadastre a equipe da Pontual (vendas, fábrica, instalação). Depois monte as equipes de instalação que vão para as obras."
            acao={
              <Link href="/funcionarios/novo" className={buttonVariants()}>
                <Plus aria-hidden /> Novo funcionário
              </Link>
            }
          />
        )
      ) : (
        <>
          <ListaDeRegistros
            tela="funcionarios"
            base="/funcionarios"
            atuais={{ ...atuais, pagina: undefined }}
            ordem={parametros.ordem}
            direcao={parametros.direcao}
            colunas={COLUNAS}
            linhas={linhas.map(paraLinha)}
            acoes={[
              { rotulo: "Inativar", executar: inativarFuncionarios, confirmar: { titulo: "Inativar os funcionários marcados?", descricao: "Eles saem das escolhas (agenda, equipes), mas nada é apagado. Dá para reativar depois.", botao: "Inativar" } },
              { rotulo: "Reativar", executar: reativarFuncionarios },
              { rotulo: "Enviar à lixeira", executar: excluirFuncionarios, confirmar: { titulo: "Enviar os funcionários marcados para a lixeira?", descricao: "Eles saem das listas, da busca e das equipes, e podem ser restaurados depois na Lixeira.", botao: "Enviar à lixeira" } },
            ]}
          />
          <PaginacaoLista base="/funcionarios" atuais={atuais} paginacao={paginacao} tamanho={parametros.tamanho} />
        </>
      )}
    </>
  );
}
