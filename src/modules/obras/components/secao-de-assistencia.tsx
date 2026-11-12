import { LifeBuoy, Plus } from "lucide-react";
import Link from "next/link";

import { EstadoVazio } from "@/components/layout/estado-vazio";
import { buttonVariants } from "@/components/ui/button";

import type { ChamadoDaLista } from "../queries-chamados";
import { ListaDeChamados } from "./lista-de-chamados";

/** Aba "Assistência" da obra e do cliente: chamados do vínculo e atalho para abrir um novo já com ele escolhido. */
export function SecaoDeAssistencia({ chamados, novoHref, mostrarCliente = false }: { chamados: ChamadoDaLista[]; novoHref: string; mostrarCliente?: boolean }) {
  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Link href={novoHref} className={buttonVariants()}>
          <Plus aria-hidden /> Novo chamado
        </Link>
      </div>
      {chamados.length === 0 ? (
        <EstadoVazio icone={LifeBuoy} titulo="Nenhum chamado de assistência" descricao="Quando o cliente pedir regulagem ou troca de vidro, abra um chamado: o sistema confere a garantia pela data da instalação." />
      ) : (
        <ListaDeChamados chamados={chamados} mostrarCliente={mostrarCliente} />
      )}
    </div>
  );
}
