import { Download, Plus, Users } from "lucide-react";
import Link from "next/link";

import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltroSelect, FiltrosDaLista } from "@/components/lista/filtros-da-lista";
import { FiltrosSalvos } from "@/components/lista/filtros-salvos";
import { ListaDeRegistros, type ColunaLista, type LinhaLista } from "@/components/lista/lista-de-registros";
import { PaginacaoLista } from "@/components/lista/paginacao-lista";
import { buttonVariants } from "@/components/ui/button";
import { formatarData, formatarTelefone } from "@/lib/formatadores";
import type { ParametrosBrutos } from "@/lib/listas/parametros";
import { montarConsulta } from "@/lib/listas/parametros";
import { formatarCnpj, formatarCpf } from "@/lib/validadores";
import { listarFiltrosSalvos } from "@/modules/filtros/queries";

import { excluirClientes, inativarClientes, reativarClientes } from "../actions/clientes";
import { lerListaClientes, listarClientes, MARCACOES, ROTULO_MARCACAO, type ClienteDaLista } from "../queries";
import { ORIGENS, ROTULO_ORIGEM } from "../schemas";

type Props = {
  brutos: ParametrosBrutos;
  usuarioId: string;
  /** Visão de parceiros: só arquitetos e construtoras, com a coluna de indicados. */
  parceiros?: boolean;
};

const COLUNAS_CLIENTES: ColunaLista[] = [
  { id: "nome", rotulo: "Nome", ordenavel: "nome" },
  { id: "contato", rotulo: "Contato" },
  { id: "marcacoes", rotulo: "Tipo de cadastro" },
  { id: "documento", rotulo: "CPF/CNPJ", escondidaPorPadrao: true },
  { id: "origem", rotulo: "Origem", escondidaPorPadrao: true },
  { id: "criadoEm", rotulo: "Cadastrado em", ordenavel: "criadoEm", escondidaPorPadrao: true },
];

const COLUNAS_PARCEIROS: ColunaLista[] = [
  { id: "nome", rotulo: "Nome", ordenavel: "nome" },
  { id: "contato", rotulo: "Contato" },
  { id: "marcacoes", rotulo: "Tipo de cadastro" },
  { id: "indicados", rotulo: "Clientes indicados" },
  { id: "projetos", rotulo: "Projetos" },
  { id: "fechados", rotulo: "Fechados" },
  { id: "criadoEm", rotulo: "Cadastrado em", ordenavel: "criadoEm", escondidaPorPadrao: true },
];

function paraLinha(c: ClienteDaLista, parceiros: boolean): LinhaLista {
  const documento = c.cpfCnpj ? (c.tipoPessoa === "PF" ? formatarCpf(c.cpfCnpj) : formatarCnpj(c.cpfCnpj)) : null;
  const telefone = c.whatsapp || c.telefone;
  return {
    id: c.id,
    href: `/clientes/${c.id}`,
    inativa: !c.ativo,
    celulas: {
      nome: { texto: c.nome, sub: [c.nomeFantasia, c.ativo ? null : "Inativo"].filter(Boolean).join(" · ") || undefined },
      contato: telefone || c.email ? { texto: telefone ? formatarTelefone(telefone) : (c.email ?? ""), sub: telefone && c.email ? c.email : undefined } : null,
      marcacoes: { texto: "", marcas: c.marcacoes.map((m) => ({ texto: ROTULO_MARCACAO[m], variante: m === "arquiteto" || m === "construtora" ? ("default" as const) : ("secondary" as const) })) },
      documento,
      origem: c.origem ? (ROTULO_ORIGEM[c.origem as keyof typeof ROTULO_ORIGEM] ?? c.origem) : null,
      indicados: parceiros ? String(c.indicados) : null,
      projetos: parceiros ? String(c.projetosDoParceiro) : null,
      fechados: parceiros ? String(c.fechadosDoParceiro) : null,
      criadoEm: formatarData(c.criadoEm),
    },
  };
}

/** Lista de clientes (ou de parceiros): busca, filtros, ordenação, paginação, colunas, filtros salvos e CSV. */
export async function PainelListaClientes({ brutos, usuarioId, parceiros = false }: Props) {
  const base = parceiros ? "/parceiros" : "/clientes";
  const tela = parceiros ? "parceiros" : "clientes";
  const { parametros, filtros } = lerListaClientes(brutos);
  const [{ linhas, paginacao }, salvos] = await Promise.all([
    listarClientes(parametros, filtros, { soParceiros: parceiros }),
    listarFiltrosSalvos(usuarioId, tela),
  ]);

  const atuais = {
    busca: parametros.busca,
    tipo: filtros.tipo,
    marcacao: filtros.marcacao,
    origem: filtros.origem,
    situacao: filtros.situacao === "ativos" ? undefined : filtros.situacao,
    parado: filtros.semContato ? "1" : undefined,
    ordem: parametros.ordem === "nome" && parametros.direcao === "asc" ? undefined : parametros.ordem,
    direcao: parametros.ordem === "nome" && parametros.direcao === "asc" ? undefined : parametros.direcao,
    tamanho: parametros.tamanho === 25 ? undefined : parametros.tamanho,
  };
  const filtrado = !!(parametros.busca || filtros.tipo || filtros.marcacao || filtros.origem || filtros.semContato || filtros.situacao !== "ativos");
  const consultaDoFiltro = montarConsulta({ ...atuais, tamanho: undefined }).replace(/^\?/, "");
  const linkExportar = `/api/exportar/clientes${montarConsulta({ ...atuais, parceiros: parceiros })}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <FiltrosDaLista base={base} busca={parametros.busca} placeholderBusca="Nome, CPF/CNPJ, telefone ou e-mail" mantidos={{ ordem: atuais.ordem, direcao: atuais.direcao, tamanho: atuais.tamanho }} filtrado={filtrado}>
          <FiltroSelect nome="tipo" rotulo="Pessoa" valor={filtros.tipo} opcoes={[{ valor: "PF", rotulo: "Física" }, { valor: "PJ", rotulo: "Jurídica" }]} />
          <FiltroSelect nome="marcacao" rotulo="Tipo de cadastro" valor={filtros.marcacao} opcoes={MARCACOES.map((m) => ({ valor: m, rotulo: ROTULO_MARCACAO[m] }))} />
          <FiltroSelect nome="origem" rotulo="Origem" valor={filtros.origem} opcoes={ORIGENS.map((o) => ({ valor: o, rotulo: ROTULO_ORIGEM[o] }))} />
          <FiltroSelect
            nome="situacao"
            rotulo="Situação"
            valor={filtros.situacao === "ativos" ? undefined : filtros.situacao}
            todos="Ativos"
            opcoes={[{ valor: "inativos", rotulo: "Inativos" }, { valor: "todos", rotulo: "Todos" }]}
          />
        </FiltrosDaLista>
        <div className="flex flex-wrap items-center gap-2">
          <FiltrosSalvos tela={tela} base={base} consultaAtual={consultaDoFiltro} salvos={salvos} />
          <a href={linkExportar} className={buttonVariants({ variant: "outline", className: "h-9" })}>
            <Download aria-hidden /> Exportar CSV
          </a>
        </div>
      </div>

      {linhas.length === 0 ? (
        filtrado ? (
          <EstadoVazio
            icone={Users}
            titulo={parceiros ? "Nenhum parceiro nesse filtro" : "Nenhum cliente nesse filtro"}
            descricao="Confira a busca e os filtros, ou limpe tudo para ver a lista completa. A busca ignora acentos e maiúsculas."
            acao={
              <Link href={base} className={buttonVariants({ variant: "outline" })}>
                Limpar filtros
              </Link>
            }
          />
        ) : parceiros ? (
          <EstadoVazio
            icone={Users}
            titulo="Nenhum parceiro ainda"
            descricao="Parceiros são os clientes marcados como arquiteto/designer ou construtora. Marque essa opção no cadastro do cliente para ele aparecer aqui."
            acao={
              <Link href="/clientes/novo" className={buttonVariants()}>
                <Plus aria-hidden /> Novo cliente
              </Link>
            }
          />
        ) : (
          <EstadoVazio
            icone={Users}
            titulo="Nenhum cliente cadastrado ainda"
            descricao="Cadastre o primeiro cliente, ou importe uma planilha para trazer vários de uma vez."
            acao={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/clientes/novo" className={buttonVariants()}>
                  <Plus aria-hidden /> Novo cliente
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
            tela={tela}
            base={base}
            atuais={{ ...atuais, pagina: undefined }}
            ordem={parametros.ordem}
            direcao={parametros.direcao}
            colunas={parceiros ? COLUNAS_PARCEIROS : COLUNAS_CLIENTES}
            linhas={linhas.map((c) => paraLinha(c, parceiros))}
            acoes={[
              { rotulo: "Inativar", executar: inativarClientes, confirmar: { titulo: "Inativar os clientes marcados?", descricao: "Eles saem das listas padrão, mas nada é apagado. Dá para reativar depois.", botao: "Inativar" } },
              { rotulo: "Reativar", executar: reativarClientes },
              { rotulo: "Enviar à lixeira", executar: excluirClientes, confirmar: { titulo: "Enviar os clientes marcados para a lixeira?", descricao: "Eles saem das listas e da busca, e podem ser restaurados depois na Lixeira.", botao: "Enviar à lixeira" } },
            ]}
          />
          <PaginacaoLista base={base} atuais={atuais} paginacao={paginacao} tamanho={parametros.tamanho} />
        </>
      )}
    </>
  );
}
