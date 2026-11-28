import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { exigirModulo } from "@/lib/auth/modulo";
import { STATUS_EM_ABERTO } from "@/lib/dominio/chamados";
import { ROTULO_STATUS_PROJETO, type StatusProjeto } from "@/lib/dominio/funil";
import { prisma } from "@/lib/db";
import { semValoresNaLinhaDoTempo } from "@/lib/dominio/texto-sem-valores";
import { permissoesDe, podeVerModulo } from "@/lib/permissoes";
import { cn } from "@/lib/utils";
import { LinhaDoTempo } from "@/modules/clientes/components/linha-do-tempo";
import { listarInteracoesDoVinculo } from "@/modules/clientes/queries";
import { BotaoGerarEtapas } from "@/modules/obras/components/botao-gerar-etapas";
import { CartaoPrazo } from "@/modules/obras/components/cartao-prazo";
import { EtapasDaObra } from "@/modules/obras/components/etapas-da-obra";
import { FotosDaObra } from "@/modules/obras/components/fotos-da-obra";
import { PainelPausas } from "@/modules/obras/components/painel-pausas";
import { CustoDaObraAba } from "@/modules/obras/components/custo-da-obra";
import { MateriaisDaObra } from "@/modules/obras/components/materiais-da-obra";
import { ParcelasDaObra } from "@/modules/obras/components/parcelas-da-obra";
import { ResumoDaObra } from "@/modules/obras/components/resumo-da-obra";
import { SemaforoTag } from "@/modules/obras/components/semaforo-tag";
import { listarEquipesAtivas, listarMotivosDeBloqueio, obterObra, obterPedidoDeAvaliacao } from "@/modules/obras/queries";
import { SecaoDeAssistencia } from "@/modules/obras/components/secao-de-assistencia";
import { listarChamados } from "@/modules/obras/queries-chamados";
import { semValoresNosChamados, semValoresNosMateriais } from "@/modules/obras/sem-valores";
import { listarFotosDaObra } from "@/modules/obras/queries-fotos";
import { AvisoDeDadosIncompletos } from "@/components/relatorios/aviso-de-dados-incompletos";
import { ouAviso } from "@/modules/indicadores/dados-do-aceite";
import { carregarCustoDaObra } from "@/modules/obras/queries-custo";
import { carregarMateriaisDaObra } from "@/modules/obras/queries-materiais";
import { excluirInteracaoDoProjeto, registrarInteracaoDoProjeto } from "@/modules/projetos/actions/interacoes";
import { listarUsuariosAtivos } from "@/modules/tarefas/queries";

export const metadata: Metadata = { title: "Obra" };

const ABAS = [
  { valor: "resumo", titulo: "Resumo" },
  { valor: "etapas", titulo: "Etapas e prazo" },
  { valor: "fotos", titulo: "Fotos" },
  { valor: "financeiro", titulo: "Parcelas" },
  { valor: "materiais", titulo: "Materiais e compras" },
  { valor: "custo", titulo: "Custo e margem" },
  { valor: "assistencia", titulo: "Assistência" },
  { valor: "historico", titulo: "Diário e linha do tempo" },
] as const;

export default async function PaginaObra({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const sessao = await exigirModulo("OBRAS");
  // Valores e custo dentro de uma tela que o Campo vê: removidos NO SERVIDOR (nada vai no HTML), não só escondidos (Fase 7C).
  const permissoes = permissoesDe(sessao);
  const { verValores, verCustoMargem } = permissoes;
  const verComercial = podeVerModulo(permissoes, "COMERCIAL") && verValores;
  const { id } = await params;
  const { aba: abaBruta } = await searchParams;

  const obraCompleta = await obterObra(id);
  const obra = obraCompleta && !verValores ? { ...obraCompleta, valorFechadoCentavos: null, parcelas: [] } : obraCompleta;
  if (!obra) {
    // Projeto que ainda não foi aprovado não é obra: leva à ficha comercial.
    const projeto = await prisma.projeto.findFirst({ where: { id, deletadoEm: null }, select: { id: true } });
    if (projeto) redirect(verComercial ? `/projetos/${id}` : "/obras");
    notFound();
  }
  // Parcelas exigem "ver valores"; Custo e margem exige "ver custo e margem" (a aba some e o endereço direto cai no resumo).
  const abasVisiveis = ABAS.filter((a) => (a.valor !== "financeiro" || verValores) && (a.valor !== "custo" || verCustoMargem));
  const aba = abasVisiveis.find((a) => a.valor === abaBruta)?.valor ?? "resumo";
  // Aba de custo: valor do aceite faltando em proposta aprovada vira aviso (o número fica bloqueado), não erro da página.
  const custoDaObra = aba === "custo" ? await ouAviso(() => carregarCustoDaObra(obra.id)) : null;
  const concluida = obra.status === "CONCLUIDO";
  const nomes = Object.fromEntries(obra.etapas.map((e) => [e.id, e.nome]));
  const atrasadas = obra.etapas.filter((e) => e.atrasada).length;
  // Chamados em aberto desta obra (o número vai na aba); a lista completa só é carregada na aba.
  const chamadosEmAberto = await prisma.chamado.count({ where: { projetoId: obra.id, deletadoEm: null, status: { in: [...STATUS_EM_ABERTO] } } });
  const contagem: Record<string, number | undefined> = { etapas: atrasadas, assistencia: chamadosEmAberto };

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={verComercial ? "/projetos" : "/obras"} className="text-muted-foreground hover:underline">
          {verComercial ? "← Voltar para os projetos" : "← Voltar para as obras"}
        </Link>
      </p>
      <CabecalhoPagina
        titulo={obra.titulo}
        descricao={`${obra.codigo} · ${obra.cliente.nome}`}
        acoes={
          verComercial ? (
            <Link href={`/projetos/${obra.id}`} className={cn(buttonVariants({ variant: "outline" }))}>
              Ver projeto
            </Link>
          ) : undefined
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge variant={concluida ? "secondary" : "default"}>{ROTULO_STATUS_PROJETO[obra.status as StatusProjeto]}</Badge>
        {obra.semaforo ? <SemaforoTag semaforo={obra.semaforo} /> : null}
        {atrasadas > 0 ? (
          <span className="text-destructive text-sm">
            {atrasadas} {atrasadas === 1 ? "etapa atrasada" : "etapas atrasadas"}
          </span>
        ) : null}
      </div>

      <nav aria-label="Seções da obra" className="mb-6 flex gap-1 overflow-x-auto border-b">
        {abasVisiveis.map((a) => (
          <Link
            key={a.valor}
            href={`/obras/${obra.id}?aba=${a.valor}`}
            aria-current={aba === a.valor ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm",
              aba === a.valor ? "border-primary text-primary font-medium" : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {a.titulo}
            {contagem[a.valor] ? <span className="bg-destructive/15 text-destructive rounded-full px-1.5 text-xs tabular-nums">{contagem[a.valor]}</span> : null}
          </Link>
        ))}
      </nav>

      {aba === "resumo" ? <ResumoDaObra obra={obra} nomes={nomes} pedidoDeAvaliacao={await obterPedidoDeAvaliacao(obra)} mostrarValores={verValores} /> : null}

      {aba === "etapas" ? (
        <div className="grid gap-6">
          {obra.etapas.length === 0 ? (
            <BotaoGerarEtapas projetoId={obra.id} />
          ) : (
            <>
              {obra.avisos.length > 0 ? (
                <section role="note" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm" aria-label="Avisos da obra">
                  <ul className="list-disc pl-5">
                    {obra.avisos.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <CartaoPrazo obra={obra} nomes={nomes} />
              <EtapasDaObra
                projetoId={obra.id}
                etapas={obra.etapas}
                temPrazo={obra.prazo.definido}
                motivos={await listarMotivosDeBloqueio()}
                usuarios={await listarUsuariosAtivos()}
                equipes={await listarEquipesAtivas()}
                hoje={obra.hoje}
                condominioPendente={!!obra.condominio && obra.condominio.exigeAprovacaoFachada && !obra.condominio.fachadaAprovada}
              />
              <PainelPausas projetoId={obra.id} pausas={obra.pausas} motivos={await listarMotivosDeBloqueio()} hoje={obra.hoje} concluida={concluida} relogioIniciado={obra.prazo.relogioIniciado} />
            </>
          )}
        </div>
      ) : null}

      {aba === "fotos" ? (
        <div className="max-w-5xl">
          <FotosDaObra projetoId={obra.id} fotos={await listarFotosDaObra(obra.id)} autorizaPortfolio={obra.autorizaPortfolio} />
        </div>
      ) : null}

      {aba === "financeiro" ? (
        <div className="max-w-3xl">
          <ParcelasDaObra parcelas={obra.parcelas} />
        </div>
      ) : null}

      {aba === "materiais" ? <MateriaisDaObra projetoId={obra.id} m={semValoresNosMateriais(await carregarMateriaisDaObra(obra.id), { valores: verValores, custo: verCustoMargem })} /> : null}

      {aba === "custo" ? (custoDaObra?.ok ? <CustoDaObraAba c={custoDaObra.dado} /> : custoDaObra ? <AvisoDeDadosIncompletos mensagem={custoDaObra.mensagem} /> : null) : null}

      {aba === "assistencia" ? (
        <div className="max-w-3xl">
          <SecaoDeAssistencia chamados={semValoresNosChamados((await listarChamados({ situacao: "todos", busca: "", projetoId: obra.id })).linhas, verValores)} novoHref={`/obras/assistencia/novo?projeto=${obra.id}`} />
        </div>
      ) : null}

      {aba === "historico" ? (
        <div className="max-w-3xl">
          <LinhaDoTempo vinculo={{ campo: "projetoId", id: obra.id }} itens={semValoresNaLinhaDoTempo(await listarInteracoesDoVinculo({ projetoId: obra.id }), verValores)} registrar={registrarInteracaoDoProjeto} excluir={excluirInteracaoDoProjeto} />
        </div>
      ) : null}
    </>
  );
}
