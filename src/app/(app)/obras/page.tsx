import { Download, HardHat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltroSelect, FiltrosDaLista } from "@/components/lista/filtros-da-lista";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirSessao } from "@/lib/auth/sessao";
import { ROTULO_TIPO_ETAPA, TIPOS_DE_ETAPA } from "@/lib/dominio/etapas";
import { ROTULO_SEMAFORO } from "@/lib/dominio/semaforo";
import { montarConsulta } from "@/lib/listas/parametros";
import { cn } from "@/lib/utils";
import { listarEquipesAtivas } from "@/modules/obras/queries";
import { KanbanDeObras } from "@/modules/obras/components/kanban-de-obras";
import { ListaDeObras } from "@/modules/obras/components/lista-de-obras";
import { LIMITE_DE_OBRAS, SEMAFOROS, lerFiltrosDeObras, listarObras } from "@/modules/obras/queries-lista";
import { listarUsuariosAtivos } from "@/modules/tarefas/queries";

export const metadata: Metadata = { title: "Obras" };

type Busca = Record<string, string | string[] | undefined>;

const numero = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export default async function PaginaObras({ searchParams }: { searchParams: Promise<Busca> }) {
  await exigirSessao();
  const brutos = await searchParams;
  const filtros = lerFiltrosDeObras(brutos);
  const andamento = filtros.situacao === "andamento";
  const visao = andamento && (Array.isArray(brutos.visao) ? brutos.visao[0] : brutos.visao) === "quadro" ? "quadro" : "lista";

  const [{ linhas, truncado, resumo, pontualidade }, usuarios, equipes] = await Promise.all([listarObras(filtros), listarUsuariosAtivos(), listarEquipesAtivas()]);

  const consulta = (extra: Record<string, string | undefined>) =>
    montarConsulta({ situacao: filtros.situacao === "concluidas" ? "concluidas" : undefined, visao: visao === "quadro" ? "quadro" : undefined, busca: filtros.busca, etapa: filtros.etapa, semaforo: filtros.semaforo, responsavel: filtros.responsavelId, equipe: filtros.equipeId, de: filtros.de, ate: filtros.ate, ...extra });
  const filtrado = !!(filtros.busca || filtros.etapa || filtros.semaforo || filtros.responsavelId || filtros.equipeId || filtros.de || filtros.ate);
  const linkExportar = `/api/exportar/obras${consulta({})}`;

  return (
    <>
      <CabecalhoPagina
        titulo="Obras"
        descricao="O que está em produção e em instalação, etapa por etapa, com o prazo prometido a cada cliente. Prazos e semáforos são calculados na hora."
        acoes={
          <a href={linkExportar} className={buttonVariants({ variant: "outline" })}>
            <Download aria-hidden /> Exportar CSV
          </a>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Situação das obras" className="bg-muted inline-flex rounded-lg p-0.5">
          {(
            [
              ["andamento", "Em andamento"],
              ["concluidas", "Concluídas"],
            ] as const
          ).map(([valor, rotulo]) => (
            <Link
              key={valor}
              href={`/obras${montarConsulta({ situacao: valor === "concluidas" ? "concluidas" : undefined })}`}
              aria-current={filtros.situacao === valor ? "page" : undefined}
              className={cn("rounded-md px-3 py-1.5 text-sm", filtros.situacao === valor ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {rotulo}
            </Link>
          ))}
        </nav>
        {andamento ? (
          <nav aria-label="Como ver as obras" className="bg-muted inline-flex rounded-lg p-0.5">
            {(
              [
                ["lista", "Lista"],
                ["quadro", "Quadro por etapa"],
              ] as const
            ).map(([valor, rotulo]) => (
              <Link
                key={valor}
                href={`/obras${consulta({ visao: valor === "quadro" ? "quadro" : undefined })}`}
                aria-current={visao === valor ? "page" : undefined}
                className={cn("rounded-md px-3 py-1.5 text-sm", visao === valor ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {rotulo}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      <div className="mb-4">
        <FiltrosDaLista base="/obras" busca={filtros.busca} placeholderBusca="Obra, código ou cliente" mantidos={{ situacao: filtros.situacao === "concluidas" ? "concluidas" : undefined, visao: visao === "quadro" ? "quadro" : undefined }} filtrado={filtrado}>
          {andamento ? <FiltroSelect nome="etapa" rotulo="Etapa atual" valor={filtros.etapa} opcoes={TIPOS_DE_ETAPA.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_ETAPA[t] }))} /> : null}
          {andamento ? <FiltroSelect nome="semaforo" rotulo="Prazo" valor={filtros.semaforo} opcoes={SEMAFOROS.map((s) => ({ valor: s, rotulo: ROTULO_SEMAFORO[s] }))} /> : null}
          <FiltroSelect nome="responsavel" rotulo="Responsável" valor={filtros.responsavelId} opcoes={usuarios.map((u) => ({ valor: u.id, rotulo: u.nome }))} />
          {andamento ? <FiltroSelect nome="equipe" rotulo="Equipe" valor={filtros.equipeId} opcoes={equipes.map((e) => ({ valor: e.id, rotulo: e.nome }))} /> : null}
          {andamento ? null : (
            <>
              <label className="grid gap-1 text-xs">
                <span className="text-muted-foreground">Concluída de</span>
                <Input type="date" name="de" defaultValue={filtros.de} className="h-9" />
              </label>
              <label className="grid gap-1 text-xs">
                <span className="text-muted-foreground">até</span>
                <Input type="date" name="ate" defaultValue={filtros.ate} className="h-9" />
              </label>
            </>
          )}
        </FiltrosDaLista>
      </div>

      {andamento ? (
        <p className="text-muted-foreground mb-4 text-sm" role="status">
          {resumo.total} {resumo.total === 1 ? "obra em andamento" : "obras em andamento"}
          {resumo.vermelhas > 0 ? ` · ${resumo.vermelhas} atrasada${resumo.vermelhas === 1 ? "" : "s"}` : ""}
          {resumo.amarelas > 0 ? ` · ${resumo.amarelas} vence${resumo.amarelas === 1 ? "" : "m"} em breve` : ""}
          {resumo.semPrazo > 0 ? ` · ${resumo.semPrazo} sem prazo definido` : ""}
        </p>
      ) : pontualidade ? (
        <section className="mb-4 rounded-xl border p-4 text-sm" aria-label="Pontualidade do período" role="status">
          {pontualidade.concluidas === 0 ? (
            <p>Nenhuma obra concluída com prazo definido {filtrado ? "neste filtro" : "ainda"}: a pontualidade aparece aqui quando houver.</p>
          ) : (
            <>
              <p>
                <strong>Pontualidade: {numero(pontualidade.pontualidadePct!)}%</strong> ({pontualidade.pontuais} de {pontualidade.concluidas} obras concluídas até o prazo prometido, já com as pausas justificadas).
              </p>
              <p className="text-muted-foreground">
                Desvio médio: {numero(pontualidade.desvioMedioDias!)} dias (negativo = antes do prazo). Sem considerar as pausas: {numero(pontualidade.pontualidadeSemPausasPct!)}% e desvio médio de {numero(pontualidade.desvioMedioSemPausasDias!)} dias.
                {pontualidade.semPrazo > 0 ? ` ${pontualidade.semPrazo} obra(s) sem prazo definido ficaram de fora.` : ""}
              </p>
            </>
          )}
        </section>
      ) : null}

      {truncado ? (
        <p role="note" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Mostrando só as primeiras {LIMITE_DE_OBRAS} obras. Use a busca e os filtros para chegar às demais.
        </p>
      ) : null}

      {linhas.length === 0 ? (
        <EstadoVazio
          icone={HardHat}
          titulo={filtrado ? "Nenhuma obra com esses filtros" : andamento ? "Nenhuma obra em andamento" : "Nenhuma obra concluída ainda"}
          descricao={andamento ? "A obra nasce quando uma proposta é aprovada: as etapas são geradas do modelo e o prazo parte da proposta." : "As obras aparecem aqui quando a etapa de entrega é concluída."}
          acao={
            andamento && !filtrado ? (
              <Link href="/propostas" className={buttonVariants()}>
                Ver propostas
              </Link>
            ) : undefined
          }
        />
      ) : visao === "quadro" ? (
        <KanbanDeObras obras={linhas} />
      ) : (
        <ListaDeObras obras={linhas} />
      )}
    </>
  );
}
