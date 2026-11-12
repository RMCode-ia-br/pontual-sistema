import { FileText, HardHat, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { ROTULO_STATUS_PROJETO } from "@/lib/dominio/funil";
import { formatarTelefone } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { Anexos } from "@/modules/anexos/components/anexos";
import { listarAnexos } from "@/modules/anexos/queries";
import { BotoesDeContato } from "@/modules/clientes/components/botoes-de-contato";
import { LinhaDoTempo } from "@/modules/clientes/components/linha-do-tempo";
import { listarInteracoesDoVinculo } from "@/modules/clientes/queries";
import { obterConfiguracao } from "@/modules/configuracoes/queries";
import { EventosDoProjeto } from "@/modules/agenda/components/eventos-do-projeto";
import { listarEventosDoProjeto, proximaVisitaDoProjeto, variaveisDaVisita } from "@/modules/agenda/queries";
import { listarMensagensProntas } from "@/modules/clientes/queries";
import { primeiroNome } from "@/lib/dominio/modelos-texto";
import { excluirInteracaoDoProjeto, registrarInteracaoDoProjeto } from "@/modules/projetos/actions/interacoes";
import { ControleDoProjeto } from "@/modules/projetos/components/controle-do-projeto";
import { FormProjeto } from "@/modules/projetos/components/form-projeto";
import { ResumoDoProjeto } from "@/modules/projetos/components/resumo-do-projeto";
import { listarMotivosPerda, obterProjeto } from "@/modules/projetos/queries";
import { listarPropostasDoProjeto } from "@/modules/propostas/queries";
import { TabelaPropostas } from "@/modules/propostas/components/tabela-propostas";
import { ListaTarefas } from "@/modules/tarefas/components/lista-tarefas";
import { listarTarefas } from "@/modules/tarefas/queries";
import { listarUsuariosAtivos } from "@/modules/tarefas/queries";

export const metadata: Metadata = { title: "Projeto" };

const ABAS = [
  { valor: "resumo", titulo: "Resumo" },
  { valor: "dados", titulo: "Dados" },
  { valor: "visitas", titulo: "Visitas" },
  { valor: "tarefas", titulo: "Tarefas" },
  { valor: "propostas", titulo: "Propostas" },
  { valor: "anexos", titulo: "Arquivos e fotos" },
  { valor: "linha-do-tempo", titulo: "Linha do tempo" },
] as const;

export default async function PaginaProjeto({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const usuario = await exigirSessao();
  const { id } = await params;
  const { aba: abaBruta } = await searchParams;

  const projeto = await obterProjeto(id);
  if (!projeto) notFound();
  const aba = ABAS.find((a) => a.valor === abaBruta)?.valor ?? "resumo";
  const [motivos, config, visita] = await Promise.all([listarMotivosPerda(), obterConfiguracao(), proximaVisitaDoProjeto(projeto.id)]);
  const mensagens = await listarMensagensProntas({
    cliente: primeiroNome(projeto.cliente.nome),
    nomeFantasia: config?.nomeFantasia ?? undefined,
    linkAvaliacao: config?.linkAvaliacaoGoogle ?? undefined,
    ...(visita ? variaveisDaVisita(visita) : {}),
  });

  const contagem: Record<string, number | undefined> = { visitas: projeto.qtdVisitas, tarefas: projeto.qtdTarefasAbertas };

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/projetos" className="text-muted-foreground hover:underline">
          ← Voltar para os projetos
        </Link>
      </p>
      <CabecalhoPagina
        titulo={projeto.titulo}
        descricao={`${projeto.codigo} · ${projeto.cliente.nome}${projeto.cliente.whatsapp || projeto.cliente.telefone ? ` · ${formatarTelefone(projeto.cliente.whatsapp || projeto.cliente.telefone)}` : ""}`}
        acoes={
          <>
            {["APROVADO", "EM_EXECUCAO", "CONCLUIDO"].includes(projeto.status) ? (
              <Link href={`/obras/${projeto.id}`} className={buttonVariants({ variant: "outline" })}>
                <HardHat aria-hidden /> Acompanhar obra
              </Link>
            ) : null}
            <ControleDoProjeto projeto={{ id: projeto.id, titulo: projeto.titulo, status: projeto.status }} motivos={motivos} />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant={projeto.status === "PERDIDO" ? "destructive" : projeto.status === "APROVADO" ? "default" : "secondary"}>{ROTULO_STATUS_PROJETO[projeto.status]}</Badge>
        {projeto.qtdTarefasAbertas > 0 ? (
          <span className="text-muted-foreground text-sm">
            {projeto.qtdTarefasAbertas} {projeto.qtdTarefasAbertas === 1 ? "tarefa aberta" : "tarefas abertas"}
          </span>
        ) : null}
      </div>

      <div className="mb-6">
        <BotoesDeContato telefone={projeto.cliente.telefone} whatsapp={projeto.cliente.whatsapp} email={projeto.cliente.email} mensagens={mensagens} />
      </div>

      <nav aria-label="Seções do projeto" className="mb-6 flex gap-1 overflow-x-auto border-b">
        {ABAS.map((a) => (
          <Link
            key={a.valor}
            href={`/projetos/${projeto.id}?aba=${a.valor}`}
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

      {aba === "resumo" ? <ResumoDoProjeto projeto={projeto} /> : null}
      {aba === "dados" ? (
        <div className="max-w-3xl">
          <FormProjeto
            usuarios={await listarUsuariosAtivos()}
            usuarioAtualId={usuario.id}
            faixasDePorte={{ medioMinimoCentavos: config?.porteMedioMinimoCentavos ?? null, grandeMinimoCentavos: config?.porteGrandeMinimoCentavos ?? null }}
            projeto={{
              id: projeto.id,
              codigo: projeto.codigo,
              titulo: projeto.titulo,
              cliente: { id: projeto.cliente.id, nome: projeto.cliente.nome },
              enderecoObraId: projeto.enderecoObra?.id ?? null,
              arquiteto: projeto.arquiteto,
              construtora: projeto.construtora,
              responsavelId: projeto.responsavel?.id ?? null,
              tiposServico: projeto.tiposServico,
              origem: projeto.origem,
              origemDetalhe: projeto.origemDetalhe,
              porte: projeto.porte,
              interesse: projeto.interesse,
              temperatura: projeto.temperatura,
              faseDaObra: projeto.faseDaObra,
              investimentoPrevistoCentavos: projeto.investimentoPrevistoCentavos,
              valorEstimadoCentavos: projeto.valorEstimadoCentavos,
              prazoDesejado: projeto.prazoDesejado,
              observacoes: projeto.observacoes,
            }}
          />
        </div>
      ) : null}
      {aba === "tarefas" ? (
        <div className="max-w-3xl">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-medium">Tarefas do projeto</h2>
            <Link href={`/tarefas/nova?projeto=${projeto.id}`} className={buttonVariants()}>
              <Plus aria-hidden /> Nova tarefa
            </Link>
          </div>
          <ListaTarefas tarefas={await listarTarefas({ status: "abertas", projetoId: projeto.id })} vazioPorFiltro={false} />
        </div>
      ) : null}
      {aba === "visitas" ? (
        <div className="max-w-3xl">
          <EventosDoProjeto projetoId={projeto.id} eventos={await listarEventosDoProjeto(projeto.id)} />
        </div>
      ) : null}
      {aba === "propostas" ? <PropostasDoProjeto projetoId={projeto.id} /> : null}
      {aba === "anexos" ? (
        <div className="max-w-3xl">
          <Anexos entidadeTipo="Projeto" entidadeId={projeto.id} anexos={await listarAnexos("Projeto", projeto.id)} titulo="Arquivos e fotos do projeto" />
        </div>
      ) : null}
      {aba === "linha-do-tempo" ? (
        <div className="max-w-3xl">
          <LinhaDoTempo
            vinculo={{ campo: "projetoId", id: projeto.id }}
            itens={await listarInteracoesDoVinculo({ projetoId: projeto.id })}
            registrar={registrarInteracaoDoProjeto}
            excluir={excluirInteracaoDoProjeto}
          />
        </div>
      ) : null}
    </>
  );
}

async function PropostasDoProjeto({ projetoId }: { projetoId: string }) {
  const propostas = await listarPropostasDoProjeto(projetoId);
  return (
    <div className="grid gap-4">
      <div>
        <Link href={`/propostas/nova?projeto=${projetoId}`} className={buttonVariants()}>
          <Plus aria-hidden /> Nova proposta
        </Link>
      </div>
      {propostas.length === 0 ? (
        <EstadoVazio icone={FileText} titulo="Nenhuma proposta neste projeto" descricao="Crie a proposta: ela já nasce com o cliente, o endereço da obra e os textos padrão, e você importa as medidas da visita." />
      ) : (
        <TabelaPropostas propostas={propostas} mostrarProjeto={false} />
      )}
    </div>
  );
}
