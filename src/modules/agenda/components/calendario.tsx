import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";

import { partesLocais, periodosQueCobrem, type PeriodoDoCalendario } from "@/lib/dominio/agenda";
import { distribuirEmColunas, gradeDoMes, mesmoMes } from "@/lib/dominio/calendario";
import { FUSO_PADRAO } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

import type { EventoDaAgenda } from "../queries";
import { ROTULO_STATUS_EVENTO, ROTULO_TIPO_EVENTO } from "../schemas";
import { estiloDoEvento } from "./estilo-do-evento";

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export const nomeDoMes = (dataLocal: string) => `${MESES[Number(dataLocal.slice(5, 7)) - 1]} de ${dataLocal.slice(0, 4)}`;

const diaDoMes = (d: string) => Number(d.slice(8, 10));
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const hora = (iso: string) => formatInTimeZone(iso, FUSO_PADRAO, "HH:mm");

/** Nome curto do compromisso para a grade: título, ou tipo + cliente. */
export function tituloDoEvento(e: EventoDaAgenda): string {
  return e.titulo || `${ROTULO_TIPO_EVENTO[e.tipo]}${e.clienteNome ? ` — ${e.clienteNome}` : ""}`;
}

const dicaDoEvento = (e: EventoDaAgenda) =>
  `${hora(e.inicio)}–${hora(e.fim)} · ${tituloDoEvento(e)} · ${ROTULO_STATUS_EVENTO[e.status]}${e.responsavelNome ? ` · ${e.responsavelNome}` : ""}`;

function eventosDoDia(eventos: EventoDaAgenda[], dia: string): EventoDaAgenda[] {
  return eventos.filter((e) => partesLocais(new Date(e.inicio)).data === dia);
}

/** Faixas do calendário (feriado, férias coletivas, outro) que cobrem um dia. */
function FaixasDoDia({ dia, periodos, compacto = false }: { dia: string; periodos: PeriodoDoCalendario[]; compacto?: boolean }) {
  const cobrem = periodosQueCobrem(dia, periodos);
  if (cobrem.length === 0) return null;
  return (
    <>
      {cobrem.map((p) => (
        <span
          key={`${p.tipo}-${p.nome}`}
          title={p.nome}
          className={cn(
            "block truncate rounded px-1 text-[11px] leading-4",
            p.tipo === "FERIADO" && "bg-red-500/15 text-red-800 dark:text-red-200",
            p.tipo === "FERIAS_COLETIVA_FORNECEDORES" && "bg-amber-500/20 text-amber-900 dark:text-amber-200",
            p.tipo === "OUTRO" && "bg-muted text-muted-foreground",
            compacto && "hidden sm:block",
          )}
        >
          {p.tipo === "FERIAS_COLETIVA_FORNECEDORES" ? `Férias: ${p.nome}` : p.nome}
        </span>
      ))}
    </>
  );
}

function ChipDoEvento({ e }: { e: EventoDaAgenda }) {
  return (
    <Link href={`/agenda/${e.id}`} title={dicaDoEvento(e)} className={cn("block truncate rounded px-1.5 py-0.5 text-xs hover:brightness-95", estiloDoEvento(e.tipo, e.status))}>
      <span className="tabular-nums">{hora(e.inicio)}</span> {tituloDoEvento(e)}
    </Link>
  );
}

/** Visão de mês: um quadro por dia, com até 3 compromissos (no celular, só a contagem; o dia leva à visão diária). */
export function GradeMes({ data, hoje, eventos, periodos, linkDoDia, linkNovo }: { data: string; hoje: string; eventos: EventoDaAgenda[]; periodos: PeriodoDoCalendario[]; linkDoDia: (dia: string) => string; linkNovo: (dia: string) => string }) {
  const semanas = gradeDoMes(data);
  return (
    <div role="grid" aria-label={`Agenda de ${nomeDoMes(data)}`} className="overflow-hidden rounded-xl border">
      <div role="row" className="bg-muted/50 grid grid-cols-7 border-b text-center text-xs font-medium">
        {DIAS_CURTOS.map((d) => (
          <div key={d} role="columnheader" className="py-2 capitalize">
            {d}
          </div>
        ))}
      </div>
      {semanas.map((semana) => (
        <div key={semana[0]} role="row" className="grid grid-cols-7 border-b last:border-b-0">
          {semana.map((dia) => {
            const doDia = eventosDoDia(eventos, dia);
            const fora = !mesmoMes(dia, data);
            return (
              <div key={dia} role="gridcell" className={cn("min-h-16 border-r p-1 last:border-r-0 sm:min-h-28", fora && "bg-muted/30 text-muted-foreground", dia === hoje && "bg-primary/5")}>
                <div className="flex items-center justify-between">
                  <Link
                    href={linkDoDia(dia)}
                    aria-label={`Ver ${dia.split("-").reverse().join("/")}`}
                    aria-current={dia === hoje ? "date" : undefined}
                    className={cn("inline-flex size-6 items-center justify-center rounded-full text-xs hover:bg-muted", dia === hoje && "bg-primary text-primary-foreground hover:bg-primary")}
                  >
                    {diaDoMes(dia)}
                  </Link>
                  <Link href={linkNovo(dia)} aria-label={`Agendar em ${dia.split("-").reverse().join("/")}`} className="text-muted-foreground hover:text-foreground hidden px-1 text-sm sm:inline">
                    +
                  </Link>
                </div>
                <div className="mt-0.5 grid gap-0.5">
                  <FaixasDoDia dia={dia} periodos={periodos} compacto />
                  <div className="hidden gap-0.5 sm:grid">
                    {doDia.slice(0, 3).map((e) => (
                      <ChipDoEvento key={e.id} e={e} />
                    ))}
                    {doDia.length > 3 ? (
                      <Link href={linkDoDia(dia)} className="text-muted-foreground px-1.5 text-xs hover:underline">
                        +{doDia.length - 3} mais
                      </Link>
                    ) : null}
                  </div>
                  {doDia.length > 0 ? (
                    <Link href={linkDoDia(dia)} className="bg-primary/10 text-primary rounded px-1 text-center text-[11px] sm:hidden">
                      {doDia.length} {doDia.length === 1 ? "compromisso" : "compromissos"}
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const HORA_INICIAL_PADRAO = 7;
const HORA_FINAL_PADRAO = 20;
const ALTURA_DA_HORA = 56; // px

/**
 * Visão de semana (7 dias) ou de dia (1 dia): grade de horas com os compromissos posicionados pelo horário local.
 * Compromissos sobrepostos dividem a largura. Cada hora vazia é um link para agendar naquele horário.
 */
export function GradeDeHoras({ dias, hoje, eventos, periodos, linkDoDia, linkNovo }: { dias: string[]; hoje: string; eventos: EventoDaAgenda[]; periodos: PeriodoDoCalendario[]; linkDoDia: (dia: string) => string; linkNovo: (dia: string, hora: string) => string }) {
  // A grade cobre 7h–20h e se estende quando há compromisso fora disso (agendar fora do expediente é permitido).
  let PRIMEIRA_HORA = HORA_INICIAL_PADRAO;
  let ULTIMA_HORA = HORA_FINAL_PADRAO;
  for (const e of eventos) {
    if (!dias.includes(partesLocais(new Date(e.inicio)).data)) continue;
    PRIMEIRA_HORA = Math.min(PRIMEIRA_HORA, Math.floor(partesLocais(new Date(e.inicio)).minutos / 60));
    const fim = partesLocais(new Date(e.fim));
    ULTIMA_HORA = fim.data === partesLocais(new Date(e.inicio)).data ? Math.max(ULTIMA_HORA, Math.ceil(fim.minutos / 60)) : Math.max(ULTIMA_HORA, 24);
  }
  const horas = Array.from({ length: ULTIMA_HORA - PRIMEIRA_HORA }, (_, i) => PRIMEIRA_HORA + i);
  const altura = horas.length * ALTURA_DA_HORA;
  const colunas = dias.length;
  const largura = colunas === 1 ? "min-w-0" : "min-w-[46rem]";

  return (
    <div className="overflow-x-auto rounded-xl border">
      <div className={largura}>
        <div className="bg-muted/50 grid border-b text-center text-xs" style={{ gridTemplateColumns: `3rem repeat(${colunas}, minmax(0, 1fr))` }}>
          <div />
          {dias.map((dia) => (
            <div key={dia} className={cn("border-l px-1 py-1.5", dia === hoje && "bg-primary/10")}>
              <Link href={linkDoDia(dia)} className="font-medium hover:underline" aria-current={dia === hoje ? "date" : undefined}>
                <span className="capitalize">{DIAS_CURTOS[new Date(`${dia}T00:00:00Z`).getUTCDay()]}</span> {dataCurta(dia)}
              </Link>
              <FaixasDoDia dia={dia} periodos={periodos} />
            </div>
          ))}
        </div>

        <div className="grid" style={{ gridTemplateColumns: `3rem repeat(${colunas}, minmax(0, 1fr))` }}>
          <div className="text-muted-foreground relative text-right text-[11px]" style={{ height: altura }}>
            {horas.map((h, i) => (
              <span key={h} className="absolute right-1 -translate-y-1/2" style={{ top: i * ALTURA_DA_HORA }}>
                {i > 0 ? `${String(h).padStart(2, "0")}:00` : ""}
              </span>
            ))}
          </div>
          {dias.map((dia) => {
            const itens = distribuirEmColunas(
              eventosDoDia(eventos, dia).map((e) => {
                const ini = partesLocais(new Date(e.inicio)).minutos;
                const fimParte = partesLocais(new Date(e.fim));
                // Se termina em outro dia, vai até o fim da grade.
                const fim = fimParte.data === dia ? fimParte.minutos : ULTIMA_HORA * 60;
                return { e, inicioMin: ini, fimMin: Math.max(fim, ini + 15) };
              }),
            );
            return (
              <div key={dia} className={cn("relative border-l", dia === hoje && "bg-primary/5")} style={{ height: altura }}>
                {horas.map((h, i) => (
                  <Link
                    key={h}
                    href={linkNovo(dia, `${String(h).padStart(2, "0")}:00`)}
                    aria-label={`Agendar em ${dataCurta(dia)} às ${String(h).padStart(2, "0")}:00`}
                    className="hover:bg-primary/5 absolute inset-x-0 border-t"
                    style={{ top: i * ALTURA_DA_HORA, height: ALTURA_DA_HORA }}
                  />
                ))}
                {itens.map(({ e, inicioMin, fimMin, coluna, colunas: n }) => {
                  const topo = Math.max(0, ((inicioMin - PRIMEIRA_HORA * 60) / 60) * ALTURA_DA_HORA);
                  const base = Math.min(altura, ((fimMin - PRIMEIRA_HORA * 60) / 60) * ALTURA_DA_HORA);
                  if (base <= 0 || topo >= altura) return null;
                  return (
                    <Link
                      key={e.id}
                      href={`/agenda/${e.id}`}
                      title={dicaDoEvento(e)}
                      className={cn("absolute overflow-hidden rounded px-1.5 py-0.5 text-xs leading-tight shadow-sm hover:brightness-95", estiloDoEvento(e.tipo, e.status))}
                      style={{ top: topo, height: Math.max(20, base - topo - 1), left: `calc(${(coluna / n) * 100}% + 1px)`, width: `calc(${100 / n}% - 2px)` }}
                    >
                      <span className="font-medium tabular-nums">{hora(e.inicio)}</span> {tituloDoEvento(e)}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Visão em lista: os próximos compromissos agrupados por dia (a melhor no celular). */
export function ListaDaAgenda({ eventos, periodos, hoje }: { eventos: EventoDaAgenda[]; periodos: PeriodoDoCalendario[]; hoje: string }) {
  const porDia = new Map<string, EventoDaAgenda[]>();
  for (const e of eventos) {
    const dia = partesLocais(new Date(e.inicio)).data;
    porDia.set(dia, [...(porDia.get(dia) ?? []), e]);
  }
  return (
    <ol className="grid gap-4">
      {[...porDia.entries()].map(([dia, doDia]) => (
        <li key={dia}>
          <h3 className={cn("mb-1.5 text-sm font-medium", dia === hoje && "text-primary")}>
            <span className="capitalize">{DIAS_CURTOS[new Date(`${dia}T00:00:00Z`).getUTCDay()]}</span>, {dia.split("-").reverse().join("/")}
            {dia === hoje ? " (hoje)" : ""}
          </h3>
          <div className="mb-1.5 grid gap-1">
            <FaixasDoDia dia={dia} periodos={periodos} />
          </div>
          <ul className="grid gap-2">
            {doDia.map((e) => (
              <li key={e.id}>
                <Link href={`/agenda/${e.id}`} className={cn("block rounded-lg p-3 text-sm hover:brightness-95", estiloDoEvento(e.tipo, e.status))}>
                  <span className="flex flex-wrap items-center justify-between gap-x-3">
                    <span className="font-medium">{tituloDoEvento(e)}</span>
                    <span className="tabular-nums">
                      {hora(e.inicio)}–{hora(e.fim)}
                    </span>
                  </span>
                  <span className="text-xs opacity-80">
                    {ROTULO_TIPO_EVENTO[e.tipo]} · {ROTULO_STATUS_EVENTO[e.status]}
                    {e.responsavelNome ? ` · ${e.responsavelNome}` : ""}
                    {e.local ? ` · ${e.local}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

