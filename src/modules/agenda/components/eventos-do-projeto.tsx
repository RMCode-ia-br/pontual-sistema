import { CalendarDays, Plus } from "lucide-react";
import Link from "next/link";

import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatarDataHora } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

import type { EventoDaAgenda } from "../queries";
import { ROTULO_STATUS_EVENTO, ROTULO_TIPO_EVENTO } from "../schemas";
import { estiloDoEvento } from "./estilo-do-evento";

/** Aba "Visitas" do projeto: os compromissos ligados a ele e o atalho para agendar a visita técnica. */
export function EventosDoProjeto({ projetoId, eventos }: { projetoId: string; eventos: EventoDaAgenda[] }) {
  const agendar = (
    <Link href={`/agenda/novo?projeto=${projetoId}&tipo=VISITA_TECNICA`} className={buttonVariants()}>
      <Plus aria-hidden /> Agendar visita
    </Link>
  );
  if (eventos.length === 0) {
    return (
      <EstadoVazio
        icone={CalendarDays}
        titulo="Nenhuma visita agendada"
        descricao="Agende a visita técnica (gratuita, cerca de 1 hora). Ao agendar, o projeto sai de “Novo contato” e vai para “Visita agendada”."
        acao={agendar}
      />
    );
  }
  return (
    <section aria-labelledby="titulo-eventos-projeto" className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="titulo-eventos-projeto" className="font-medium">
          Visitas e compromissos
        </h2>
        {agendar}
      </div>
      <ul className="grid gap-2">
        {eventos.map((e) => (
          <li key={e.id}>
            <Link href={`/agenda/${e.id}`} className={cn("flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 text-sm hover:brightness-95", estiloDoEvento(e.tipo, e.status))}>
              <span className="min-w-0">
                <span className="block font-medium">{e.titulo || ROTULO_TIPO_EVENTO[e.tipo]}</span>
                <span className="text-xs opacity-80">
                  {formatarDataHora(e.inicio)}
                  {e.responsavelNome ? ` · ${e.responsavelNome}` : ""}
                  {e.local ? ` · ${e.local}` : ""}
                </span>
              </span>
              <Badge variant="secondary">{ROTULO_STATUS_EVENTO[e.status]}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
