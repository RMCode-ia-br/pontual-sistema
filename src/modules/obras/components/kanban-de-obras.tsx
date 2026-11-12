import Link from "next/link";

import { ROTULO_TIPO_ETAPA, TIPOS_DE_ETAPA, type TipoDeEtapa } from "@/lib/dominio/etapas";

import type { ObraDaLista } from "../queries-lista";
import { resumoDoPrazo } from "../textos";
import { MarcasDaObra } from "./lista-de-obras";
import { SemaforoTag } from "./semaforo-tag";

type Coluna = { chave: TipoDeEtapa | "SEM_ETAPAS"; titulo: string; obras: ObraDaLista[] };

/**
 * Quadro por etapa atual. Sem arrastar de propósito: concluir uma etapa pede data (e pode liberar parcela),
 * e arrastar poderia concluir várias por engano. Para mexer na etapa, abra a obra.
 */
export function KanbanDeObras({ obras }: { obras: ObraDaLista[] }) {
  const colunas: Coluna[] = TIPOS_DE_ETAPA.map((t) => ({ chave: t, titulo: ROTULO_TIPO_ETAPA[t], obras: obras.filter((o) => o.etapaAtual?.tipo === t) }));
  colunas.push({ chave: "SEM_ETAPAS", titulo: "Sem etapas", obras: obras.filter((o) => !o.etapaAtual) });
  // As colunas vazias do fim do fluxo (e a de etapas extras) só aparecem quando têm obra.
  const visiveis = colunas.filter((c) => c.obras.length > 0 || (c.chave !== "OUTRA" && c.chave !== "SEM_ETAPAS"));

  return (
    <div role="region" aria-label="Obras por etapa atual (role para o lado para ver todas)" tabIndex={0} className="-mx-4 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
      <div className="flex min-w-max items-start gap-3">
        {visiveis.map((c) => (
          <section key={c.chave} aria-labelledby={`coluna-${c.chave}`} className="bg-muted/40 w-64 shrink-0 rounded-xl p-2">
            <h3 id={`coluna-${c.chave}`} className="mb-2 flex items-center justify-between gap-2 px-1 text-sm font-medium">
              {c.titulo}
              <span className="bg-background text-muted-foreground rounded-full px-2 text-xs tabular-nums">{c.obras.length}</span>
            </h3>
            {c.obras.length === 0 ? (
              <p className="text-muted-foreground px-1 py-3 text-xs">Nenhuma obra nesta etapa.</p>
            ) : (
              <ul className="grid gap-2">
                {c.obras.map((o) => (
                  <li key={o.id} className="bg-background grid gap-1.5 rounded-lg border p-2.5 text-sm">
                    <Link href={`/obras/${o.id}`} className="font-medium hover:underline">
                      {o.titulo}
                    </Link>
                    <p className="text-muted-foreground text-xs">{o.clienteNome}</p>
                    <p className="text-xs">{resumoDoPrazo(o.prazo, null)}</p>
                    <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
                      {o.semaforo ? <SemaforoTag semaforo={o.semaforo} /> : null}
                      <MarcasDaObra obra={o} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
