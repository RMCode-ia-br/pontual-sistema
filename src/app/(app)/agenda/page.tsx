import { CalendarDays, ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltroSelect } from "@/components/lista/filtros-da-lista";
import { Button, buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { limitesDoDia } from "@/lib/dominio/agenda";
import { diasDaSemana, gradeDoMes, mesVizinho, somarDias } from "@/lib/dominio/calendario";
import { dataLocalDoInstante, inputParaData } from "@/lib/formatadores";
import { montarConsulta } from "@/lib/listas/parametros";
import { cn } from "@/lib/utils";
import { AssinaturaDaAgenda } from "@/modules/agenda/components/assinatura-da-agenda";
import { GradeDeHoras, GradeMes, ListaDaAgenda, nomeDoMes } from "@/modules/agenda/components/calendario";
import { lerFiltrosAgenda, listarEventos, listarFeedsDoUsuario, periodosDoCalendario } from "@/modules/agenda/queries";
import { ROTULO_TIPO_EVENTO, ROTULO_VISTA, TIPOS_EVENTO, VISTAS, type Vista } from "@/modules/agenda/schemas";
import { listarEquipes } from "@/modules/funcionarios/queries";
import { listarUsuariosAtivos } from "@/modules/tarefas/queries";

export const metadata: Metadata = { title: "Agenda" };

type Busca = Record<string, string | string[] | undefined>;

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Intervalo de dias que a visão mostra e o título dela. */
function periodoDaVista(vista: Vista, data: string): { de: string; ate: string; titulo: string; anterior: string; proxima: string } {
  const br = (d: string) => d.split("-").reverse().join("/");
  if (vista === "mes") {
    const grade = gradeDoMes(data);
    return { de: grade[0][0], ate: grade[grade.length - 1][6], titulo: nomeDoMes(data), anterior: mesVizinho(data, -1), proxima: mesVizinho(data, 1) };
  }
  if (vista === "semana") {
    const dias = diasDaSemana(data);
    return { de: dias[0], ate: dias[6], titulo: `${br(dias[0])} a ${br(dias[6])}`, anterior: somarDias(data, -7), proxima: somarDias(data, 7) };
  }
  if (vista === "dia") return { de: data, ate: data, titulo: br(data), anterior: somarDias(data, -1), proxima: somarDias(data, 1) };
  return { de: data, ate: somarDias(data, 30), titulo: `Próximos 30 dias, a partir de ${br(data)}`, anterior: somarDias(data, -30), proxima: somarDias(data, 30) };
}

export default async function PaginaAgenda({ searchParams }: { searchParams: Promise<Busca> }) {
  const usuario = await exigirSessao();
  const brutos = await searchParams;

  const hoje = dataLocalDoInstante(new Date());
  const vistaBruta = primeiro(brutos.vista);
  const vista: Vista = (VISTAS as readonly string[]).includes(vistaBruta ?? "") ? (vistaBruta as Vista) : "mes";
  const dataBruta = primeiro(brutos.data);
  const data = dataBruta && inputParaData(dataBruta) ? dataBruta : hoje;
  const filtros = lerFiltrosAgenda(brutos);

  const { de, ate, titulo, anterior, proxima } = periodoDaVista(vista, data);
  const [eventos, periodos, usuarios, equipes, feeds] = await Promise.all([
    listarEventos({ inicio: limitesDoDia(de).inicio, fim: limitesDoDia(ate).fim }, filtros),
    periodosDoCalendario(de, ate),
    listarUsuariosAtivos(),
    listarEquipes(),
    listarFeedsDoUsuario(usuario.id),
  ]);

  const manter = { responsavel: filtros.responsavelId, equipe: filtros.equipeId, tipo: filtros.tipo };
  const href = (v: Vista, d: string) => `/agenda${montarConsulta({ vista: v, data: d, ...manter })}`;
  const novo = (inicio: string) => `/agenda/novo${montarConsulta({ inicio })}`;
  const filtrado = !!(filtros.responsavelId || filtros.equipeId || filtros.tipo);
  const linkExportar = `/api/agenda/exportar${montarConsulta({ de, ate, ...manter })}`;
  const vazio = eventos.length === 0;

  return (
    <>
      <CabecalhoPagina
        titulo="Agenda"
        descricao="Visitas, medições, instalações, entregas e assistências. Conflitos de horário avisam, mas nunca impedem."
        acoes={
          <>
            <AssinaturaDaAgenda feeds={feeds} />
            <a href={linkExportar} className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden /> Exportar .ics
            </a>
            <Link href={novo(`${data}T09:00`)} className={buttonVariants()}>
              <Plus aria-hidden /> Novo compromisso
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Visão da agenda" className="bg-muted inline-flex rounded-lg p-0.5">
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

        <form method="get" action="/agenda" role="search" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="vista" value={vista} />
          <input type="hidden" name="data" value={data} />
          <FiltroSelect nome="responsavel" rotulo="Responsável" valor={filtros.responsavelId} opcoes={usuarios.map((u) => ({ valor: u.id, rotulo: u.nome }))} />
          <FiltroSelect nome="equipe" rotulo="Equipe" valor={filtros.equipeId} opcoes={equipes.filter((e) => e.ativo).map((e) => ({ valor: e.id, rotulo: e.nome }))} />
          <FiltroSelect nome="tipo" rotulo="Tipo" valor={filtros.tipo} opcoes={TIPOS_EVENTO.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_EVENTO[t] }))} />
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

      {vista === "mes" ? (
        <GradeMes data={data} hoje={hoje} eventos={eventos} periodos={periodos} linkDoDia={(d) => href("dia", d)} linkNovo={(d) => novo(`${d}T09:00`)} />
      ) : null}
      {vista === "semana" ? (
        <GradeDeHoras dias={diasDaSemana(data)} hoje={hoje} eventos={eventos} periodos={periodos} linkDoDia={(d) => href("dia", d)} linkNovo={(d, h) => novo(`${d}T${h}`)} />
      ) : null}
      {vista === "dia" ? <GradeDeHoras dias={[data]} hoje={hoje} eventos={eventos} periodos={periodos} linkDoDia={(d) => href("dia", d)} linkNovo={(d, h) => novo(`${d}T${h}`)} /> : null}
      {vista === "lista" ? (
        vazio ? (
          <EstadoVazio
            icone={CalendarDays}
            titulo={filtrado ? "Nenhum compromisso com esses filtros" : "Nenhum compromisso nos próximos 30 dias"}
            descricao="Agende uma visita técnica para um projeto e ela aparece aqui, no calendário e no link assinado do seu Google Agenda."
            acao={
              <Link href={novo(`${hoje}T09:00`)} className={buttonVariants()}>
                <Plus aria-hidden /> Novo compromisso
              </Link>
            }
          />
        ) : (
          <ListaDaAgenda eventos={eventos} periodos={periodos} hoje={hoje} />
        )
      ) : vazio ? (
        <p className="text-muted-foreground mt-3 text-sm">
          {filtrado ? "Nenhum compromisso com esses filtros neste período." : "Nenhum compromisso neste período."} Clique em um dia ou horário para agendar, ou use “Novo compromisso”.
        </p>
      ) : null}
    </>
  );
}

