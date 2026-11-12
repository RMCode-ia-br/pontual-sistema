import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AcoesDoCadastro } from "@/components/acoes-do-cadastro";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { STATUS_EM_ABERTO } from "@/lib/dominio/chamados";
import { formatarData, formatarTelefone } from "@/lib/formatadores";
import { primeiroNome } from "@/lib/dominio/modelos-texto";
import { cn } from "@/lib/utils";
import { formatarCnpj, formatarCpf } from "@/lib/validadores";
import { Anexos } from "@/modules/anexos/components/anexos";
import { listarAnexos } from "@/modules/anexos/queries";
import { excluirClientes, inativarClientes, reativarClientes } from "@/modules/clientes/actions/clientes";
import { excluirInteracaoDoCliente, registrarInteracaoDoCliente } from "@/modules/clientes/actions/interacoes";
import { BotoesDeContato } from "@/modules/clientes/components/botoes-de-contato";
import { FormCliente } from "@/modules/clientes/components/form-cliente";
import { LinhaDoTempo } from "@/modules/clientes/components/linha-do-tempo";
import { SecaoContatos } from "@/modules/clientes/components/secao-contatos";
import { SecaoEnderecos } from "@/modules/clientes/components/secao-enderecos";
import { listarContatos, listarEnderecos, listarInteracoes, listarMensagensProntas, obterCliente, ROTULO_MARCACAO } from "@/modules/clientes/queries";
import { ROTULO_ORIGEM } from "@/modules/clientes/schemas";
import { obterConfiguracao } from "@/modules/configuracoes/queries";
import { SecaoDeAssistencia } from "@/modules/obras/components/secao-de-assistencia";
import { listarChamados } from "@/modules/obras/queries-chamados";
import { ProjetosDoCliente } from "@/modules/projetos/components/projetos-do-cliente";
import { contarProjetosDoCliente, listarProjetosDoCliente } from "@/modules/projetos/queries";

export const metadata: Metadata = { title: "Cliente" };

const ABAS = [
  { valor: "dados", titulo: "Dados" },
  { valor: "enderecos", titulo: "Endereços" },
  { valor: "contatos", titulo: "Contatos" },
  { valor: "projetos", titulo: "Projetos" },
  { valor: "assistencia", titulo: "Assistência" },
  { valor: "anexos", titulo: "Arquivos" },
  { valor: "linha-do-tempo", titulo: "Linha do tempo" },
] as const;

export default async function PaginaCliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  await exigirSessao();
  const { id } = await params;
  const { aba: abaBruta } = await searchParams;

  const cliente = await obterCliente(id);
  if (!cliente) notFound();
  const aba = ABAS.find((a) => a.valor === abaBruta)?.valor ?? "dados";

  const empresa = await obterConfiguracao();
  const mensagens = await listarMensagensProntas({
    cliente: primeiroNome(cliente.nome),
    nomeFantasia: empresa?.nomeFantasia ?? undefined,
    linkAvaliacao: empresa?.linkAvaliacaoGoogle ?? undefined,
  });

  const contagem: Record<string, number | undefined> = {
    enderecos: cliente.qtdEnderecos,
    contatos: cliente.qtdContatos,
    projetos: await contarProjetosDoCliente(cliente.id),
    assistencia: await prisma.chamado.count({ where: { clienteId: cliente.id, deletadoEm: null, status: { in: [...STATUS_EM_ABERTO] } } }),
  };
  const documento = cliente.cpfCnpj ? (cliente.tipoPessoa === "PF" ? formatarCpf(cliente.cpfCnpj) : formatarCnpj(cliente.cpfCnpj)) : null;
  const descricao = [
    cliente.tipoPessoa === "PF" ? "Pessoa física" : "Pessoa jurídica",
    documento,
    cliente.telefone || cliente.whatsapp ? formatarTelefone(cliente.whatsapp || cliente.telefone) : null,
    cliente.origem ? `Origem: ${ROTULO_ORIGEM[cliente.origem]}` : null,
    `Cadastrado em ${formatarData(cliente.criadoEm)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/clientes" className="text-muted-foreground hover:underline">
          ← Voltar para os clientes
        </Link>
      </p>
      <CabecalhoPagina
        titulo={cliente.nome}
        descricao={descricao}
        acoes={
          <AcoesDoCadastro
            id={cliente.id}
            nome={cliente.nome}
            ativo={cliente.ativo}
            voltarPara="/clientes"
            inativar={inativarClientes}
            reativar={reativarClientes}
            excluir={excluirClientes}
            preservado="Endereços, contatos e histórico são preservados."
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {cliente.ativo ? null : <Badge variant="destructive">Inativo</Badge>}
        {cliente.marcacoes.map((m) => (
          <Badge key={m} variant={m === "arquiteto" || m === "construtora" ? "default" : "secondary"}>
            {ROTULO_MARCACAO[m]}
          </Badge>
        ))}
        {cliente.indicadoPor ? (
          <span className="text-muted-foreground text-sm">
            Indicado por{" "}
            <Link href={`/clientes/${cliente.indicadoPor.id}`} className="text-foreground underline">
              {cliente.indicadoPor.nome}
            </Link>
          </span>
        ) : null}
        {cliente.qtdIndicados > 0 ? (
          <span className="text-muted-foreground text-sm">
            · Indicou {cliente.qtdIndicados} {cliente.qtdIndicados === 1 ? "cliente" : "clientes"}
          </span>
        ) : null}
      </div>

      <div className="mb-6">
        <BotoesDeContato telefone={cliente.telefone} whatsapp={cliente.whatsapp} email={cliente.email} mensagens={mensagens} />
      </div>

      <nav aria-label="Seções do cliente" className="mb-6 flex gap-1 overflow-x-auto border-b">
        {ABAS.map((a) => (
          <Link
            key={a.valor}
            href={`/clientes/${cliente.id}?aba=${a.valor}`}
            aria-current={aba === a.valor ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm",
              aba === a.valor ? "border-primary text-primary font-medium" : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {a.titulo}
            {contagem[a.valor] ? <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-xs tabular-nums">{contagem[a.valor]}</span> : null}
          </Link>
        ))}
      </nav>

      {aba === "dados" ? (
        <div className="max-w-3xl">
          <FormCliente
            cliente={{
              id: cliente.id,
              tipoPessoa: cliente.tipoPessoa,
              nome: cliente.nome,
              nomeFantasia: cliente.nomeFantasia,
              cpfCnpj: cliente.cpfCnpj,
              telefone: cliente.telefone,
              whatsapp: cliente.whatsapp,
              email: cliente.email,
              clienteFinal: cliente.marcacoes.includes("clienteFinal"),
              arquiteto: cliente.marcacoes.includes("arquiteto"),
              construtora: cliente.marcacoes.includes("construtora"),
              empresa: cliente.marcacoes.includes("empresa"),
              origem: cliente.origem,
              origemDetalhe: cliente.origemDetalhe,
              indicadoPor: cliente.indicadoPor,
              observacoes: cliente.observacoes,
            }}
          />
        </div>
      ) : null}
      {aba === "enderecos" ? (
        <div className="max-w-3xl">
          <SecaoEnderecos clienteId={cliente.id} enderecos={await listarEnderecos(cliente.id)} />
        </div>
      ) : null}
      {aba === "contatos" ? (
        <div className="max-w-3xl">
          <SecaoContatos clienteId={cliente.id} contatos={await listarContatos(cliente.id)} />
        </div>
      ) : null}
      {aba === "projetos" ? (
        <div className="max-w-3xl">
          <ProjetosDoCliente clienteId={cliente.id} projetos={await listarProjetosDoCliente(cliente.id)} />
        </div>
      ) : null}
      {aba === "assistencia" ? (
        <div className="max-w-3xl">
          <SecaoDeAssistencia chamados={(await listarChamados({ situacao: "todos", busca: "", clienteId: cliente.id })).linhas} novoHref={`/obras/assistencia/novo?cliente=${cliente.id}`} />
        </div>
      ) : null}
      {aba === "anexos" ? (
        <div className="max-w-3xl">
          <Anexos entidadeTipo="Cliente" entidadeId={cliente.id} anexos={await listarAnexos("Cliente", cliente.id)} titulo="Arquivos do cliente" />
        </div>
      ) : null}
      {aba === "linha-do-tempo" ? (
        <div className="max-w-3xl">
          <LinhaDoTempo vinculo={{ campo: "clienteId", id: cliente.id }} itens={await listarInteracoes(cliente.id)} registrar={registrarInteracaoDoCliente} excluir={excluirInteracaoDoCliente} />
        </div>
      ) : null}
    </>
  );
}
