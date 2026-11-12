import { ShieldCheck, ShieldX } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatarNumeroDoChamado, ROTULO_STATUS_CHAMADO, ROTULO_TIPO_PROBLEMA, STATUS_EM_ABERTO } from "@/lib/dominio/chamados";
import { ROTULO_CLASSIFICACAO } from "@/lib/dominio/garantia";
import { formatarData, formatarMoeda } from "@/lib/formatadores";

import type { ChamadoDaLista } from "../queries-chamados";

export function SeloDaClassificacao({ classificacao }: { classificacao: ChamadoDaLista["classificacao"] }) {
  return classificacao === "EM_GARANTIA" ? (
    <Badge>
      <ShieldCheck aria-hidden /> {ROTULO_CLASSIFICACAO[classificacao]}
    </Badge>
  ) : (
    <Badge variant="outline">
      <ShieldX aria-hidden /> {ROTULO_CLASSIFICACAO[classificacao]}
    </Badge>
  );
}

/** Chamados em linhas (computador) que viram cartões empilhados no celular. `mostrarCliente` some nas abas do cliente/obra. */
export function ListaDeChamados({ chamados, mostrarCliente = true }: { chamados: ChamadoDaLista[]; mostrarCliente?: boolean }) {
  return (
    <ul className="grid gap-2" aria-label="Chamados de assistência">
      {chamados.map((c) => {
        const emAberto = (STATUS_EM_ABERTO as readonly string[]).includes(c.status);
        return (
          <li key={c.id} className="grid gap-2 rounded-xl border p-3 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.4fr)_auto] lg:items-center lg:gap-4">
            <div className="min-w-0">
              <Link href={`/obras/assistencia/${c.id}`} className="font-medium hover:underline">
                {formatarNumeroDoChamado(c.numero)} · {ROTULO_TIPO_PROBLEMA[c.tipoProblema]}
              </Link>
              <p className="text-muted-foreground line-clamp-2 text-sm">{c.descricao}</p>
              <p className="text-muted-foreground text-xs">
                {mostrarCliente ? `${c.clienteNome}` : ""}
                {mostrarCliente && c.projetoTitulo ? " · " : ""}
                {c.projetoTitulo ?? (mostrarCliente ? "Sem obra" : "")}
              </p>
            </div>
            <div className="grid gap-1 text-sm">
              <p>{ROTULO_STATUS_CHAMADO[c.status]}</p>
              <p className="text-muted-foreground text-xs">
                Aberto em {formatarData(c.abertoEm)}
                {emAberto ? ` · há ${c.diasEmAberto} ${c.diasEmAberto === 1 ? "dia" : "dias"}` : c.resolvidoEm ? ` · encerrado em ${formatarData(c.resolvidoEm)}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 lg:justify-self-end">
              <SeloDaClassificacao classificacao={c.classificacao} />
              {c.cobrarVisita ? <Badge variant="secondary">{c.valorCobradoCentavos ? `Visita cobrada: ${formatarMoeda(c.valorCobradoCentavos)}` : "Visita a cobrar"}</Badge> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
