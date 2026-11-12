import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltroSelect } from "@/components/lista/filtros-da-lista";
import { Button, buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { limitesDoDia } from "@/lib/dominio/agenda";
import { diasDaSemana } from "@/lib/dominio/calendario";
import { dataLocalDoInstante, inputParaData } from "@/lib/formatadores";
import { montarConsulta } from "@/lib/listas/parametros";
import { cn } from "@/lib/utils";
import { GradeDeHoras, GradeMes, ListaDaAgenda } from "@/modules/agenda/components/calendario";
import { lerFiltrosAgenda, listarEventos, periodosDoCalendario } from "@/modules/agenda/queries";
import { ROTULO_VISTA, VISTAS, type TipoEvento, type Vista } from "@/modules/agenda/schemas";
import { periodoDaVista } from "@/modules/agenda/vista";
import { listarEquipesAtivas } from "@/modules/obras/queries";
import { InstalacoesSemAgendamento } from "@/modules/obras/components/instalacoes-sem-agendamento";
import { listarEtapasSemAgendamento } from "@/modules/obras/queries-lista";
import { listarUsuariosAtivos } from "@/modules/tarefas/queries";

export const metadata: Metadata = { title: "Calendário de instalação" };

type Busca = Record<string, string | string[] | undefined>;

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** O que o calendário de instalação mostra: instalações, medição dos vidros e entregas (o resto fica na Agenda). */
const TIPOS_DO_CALENDARIO: readonly TipoEvento[] = ["INSTALACAO", "MEDICAO_VIDROS", "ENTREGA"];

export default async function PaginaCalendarioDeInstalacao({ searchParams }: { searchParams: Promise<Busca> }) {
  await exigirSessao();
  const brutos = await searchParams;

  const hoje = dataLocalDoInstante(new Date());
  const vistaBruta = primeiro(brutos.vista);
  const vista: Vista = (VISTAS as readonly string[]).includes(vistaBruta ?? "") ? (vistaBruta as Vista) : "mes";
  const dataBruta = primeiro(brutos.data);
  const data = dataBruta && inputParaData(dataBruta) ? dataBruta : hoje;
  const { responsavelId, equipeId } = lerFiltrosAgenda(brutos);

  const { de, ate, titulo, anterior, proxima } = periodoDaVista(vista, data);
  const [eventos, periodos, usuarios, equipes, semAgendamento] = await Promise.all([
    listarEventos({ inicio: limitesDoDia(de).inicio, fim: limitesDoDia(ate).fim }, { responsavelId, equipeId, tipos: TIPOS_DO_CALENDARIO }),
    periodosDoCalendario(de, ate),
    listarUsuariosAtivos(),
    listarEquipesAtivas(),
    listarEtapasSemAgendamento(),
  ]);

  const manter = { responsavel: responsavelId, equipe: equipeId };
  const href = (v: Vista, d: string) => `/obras/calendario${montarConsulta({ vista: v, data: d, ...manter })}`;
  const novo = (inicio: string) => `/agenda/novo${montarConsulta({ inicio, tipo: "INSTALACAO", equipe: equipeId })}`;
  const filtrado = !!(responsavelId || equipeId);
  // As etapas sem agendamento acompanham o filtro de equipe (as que não têm equipe aparecem sempre: ainda não foram atribuídas).
  const pendentes = equipeId ? semAgendamento.filter((e) => e.equipeId === equipeId || e.equipeId === null) : semAgendamento;

  return (
    <>
      <CabecalhoPagina
        titulo="Calendário de instalação"
descricao="Instalações, medições dos vidros e entregas das obras, por equipe. Faixas de feriado e férias coletivas aparecem no calendário. Conflitos de horário avisam, mas nunca impedem."
        acoes={
          <Link href={novo(`${data}T08:00`)} className={buttonVariants()}>
            <Plus aria-hidden /> Agendar instalação
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Visão do calendário" className="bg-muted inline-flex rounded-lg p-0.5">
            {VISTAS.map((v) => (
              <Link
                key={v}
                href={href(v, data)}
                aria-current={vista === v ? "page" : undefined}
                className={cn("rounded-md px-3 py-1.5 text-sm", vista === v ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {ROTULO_VISTA[v]}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <Link href={href(vista, anterior)} aria-label="Período anterior" className={buttonVariants({ variant: "outline", size: "icon" })}>
              <ChevronLeft aria-hidden />
            </Link>
            <Link href={href(vista, hoje)} className={buttonVariants({ variant: "outline" })}>
              Hoje
            </Link>
            <Link href={href(vista, proxima)} aria-label="Próximo período" className={buttonVariants({ variant: "outline", size: "icon" })}>
              <ChevronRight aria-hidden />
            </Link>
          </div>
          <h2 className="text-lg font-semibold first-letter:uppercase" aria-live="polite">
            {titulo}
          </h2>
        </div>

        <form method="get" action="/obras/calendario" role="search" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="vista" value={vista} />
          <input type="hidden" name="data" value={data} />
          <FiltroSelect nome="equipe" rotulo="Equipe" valor={equipeId} opcoes={equipes.map((e) => ({ valor: e.id, rotulo: e.nome }))} />
          <FiltroSelect nome="responsavel" rotulo="Responsável" valor={responsavelId} opcoes={usuarios.map((u) => ({ valor: u.id, rotulo: u.nome }))} />
          <Button type="submit" variant="secondary" className="h-9">
            Filtrar
          </Button>
          {filtrado ? (
            <Link href={href(vista, data)} className="text-muted-foreground inline-flex h-9 items-center px-2 text-sm hover:underline">
              Limpar
            </Link>
          ) : null}
        </form>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {vista === "mes" ? <GradeMes data={data} hoje={hoje} eventos={eventos} periodos={periodos} linkDoDia={(d) => href("dia", d)} linkNovo={(d) => novo(`${d}T08:00`)} /> : null}
          {vista === "semana" ? <GradeDeHoras dias={diasDaSemana(data)} hoje={hoje} eventos={eventos} periodos={periodos} linkDoDia={(d) => href("dia", d)} linkNovo={(d, h) => novo(`${d}T${h}`)} /> : null}
          {vista === "dia" ? <GradeDeHoras dias={[data]} hoje={hoje} eventos={eventos} periodos={periodos} linkDoDia={(d) => href("dia", d)} linkNovo={(d, h) => novo(`${d}T${h}`)} /> : null}
          {vista === "lista" ? (
            eventos.length === 0 ? (
              <EstadoVazio
                icone={CalendarDays}
                titulo={filtrado ? "Nenhuma instalação com esses filtros" : "Nenhuma instalação nos próximos 30 dias"}
                descricao="Agende a instalação de uma etapa pela lista “Previstas, sem agendamento” ou pelo botão acima."
              />
            ) : (
              <ListaDaAgenda eventos={eventos} periodos={periodos} hoje={hoje} />
            )
          ) : eventos.length === 0 ? (
            <p className="text-muted-foreground mt-3 text-sm">{filtrado ? "Nada agendado com esses filtros neste período." : "Nada agendado neste período."} Clique em um dia ou horário para agendar.</p>
          ) : null}
        </div>
        <InstalacoesSemAgendamento etapas={pendentes} hoje={hoje} />
      </div>
    </>
  );
}
