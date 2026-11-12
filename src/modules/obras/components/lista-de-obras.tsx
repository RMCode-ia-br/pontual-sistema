import { Pause, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ROTULO_STATUS_ETAPA } from "@/lib/dominio/etapas";
import { formatarMoeda } from "@/lib/formatadores";

import type { ObraDaLista } from "../queries-lista";
import { resumoDoPrazo } from "../textos";
import { SemaforoTag } from "./semaforo-tag";

/** Marcas curtas de atenção de uma obra (pausa, bloqueio, etapas atrasadas). */
export function MarcasDaObra({ obra }: { obra: ObraDaLista }) {
  return (
    <>
      {obra.emPausa ? (
        <Badge variant="outline">
          <Pause aria-hidden /> Em pausa
        </Badge>
      ) : null}
      {obra.bloqueada ? <Badge variant="destructive">Etapa bloqueada</Badge> : null}
      {obra.atrasadas > 0 ? (
        <Badge variant="destructive">
          <TriangleAlert aria-hidden /> {obra.atrasadas} {obra.atrasadas === 1 ? "etapa atrasada" : "etapas atrasadas"}
        </Badge>
      ) : null}
    </>
  );
}

/** Obras em linhas (computador) que viram cartões empilhados no celular. */
export function ListaDeObras({ obras }: { obras: ObraDaLista[] }) {
  return (
    <ul className="grid gap-2" aria-label="Obras">
      {obras.map((o) => (
        <li key={o.id} className="grid gap-2 rounded-xl border p-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.6fr)_auto] lg:items-center lg:gap-4">
          <div className="min-w-0">
            <Link href={`/obras/${o.id}`} className="font-medium hover:underline">
              {o.titulo}
            </Link>
            <p className="text-muted-foreground text-xs">
              {o.codigo} · {o.clienteNome}
              {o.responsavelNome ? ` · ${o.responsavelNome}` : ""}
              {o.valorFechadoCentavos !== null ? ` · ${formatarMoeda(o.valorFechadoCentavos)}` : ""}
            </p>
          </div>

          <div className="grid gap-1 text-sm">
            {o.etapaAtual ? (
              <p>
                <span className="text-muted-foreground text-xs">Etapa atual: </span>
                {o.etapaAtual.nome}
                {o.etapaAtual.status === "EM_ANDAMENTO" || o.etapaAtual.status === "BLOQUEADA" ? <span className="text-muted-foreground"> ({ROTULO_STATUS_ETAPA[o.etapaAtual.status].toLowerCase()})</span> : null}
              </p>
            ) : o.etapasTotal === 0 ? (
              <p className="text-muted-foreground">Sem etapas geradas</p>
            ) : (
              <p className="text-muted-foreground">Todas as etapas concluídas</p>
            )}
            {o.etapasTotal > 0 ? (
              <p className="text-muted-foreground text-xs">
                {o.etapasConcluidas} de {o.etapasTotal} etapas concluídas
                {o.equipes.length > 0 ? ` · ${o.equipes.join(", ")}` : ""}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1.5 empty:hidden">
              <MarcasDaObra obra={o} />
            </div>
          </div>

          <p className="text-sm">{resumoDoPrazo(o.prazo, o.dataConclusao)}</p>

          <div className="lg:justify-self-end">{o.semaforo ? <SemaforoTag semaforo={o.semaforo} /> : null}</div>
        </li>
      ))}
    </ul>
  );
}
