import { FolderKanban, Plus } from "lucide-react";
import Link from "next/link";

import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ROTULO_STATUS_PROJETO } from "@/lib/dominio/funil";
import { formatarData, formatarMoeda } from "@/lib/formatadores";

import type { ProjetoDoCliente } from "../queries";

/** Aba "Projetos" da ficha do cliente. */
export function ProjetosDoCliente({ clienteId, projetos }: { clienteId: string; projetos: ProjetoDoCliente[] }) {
  const novo = (
    <Link href={`/projetos/novo?cliente=${clienteId}`} className={buttonVariants()}>
      <Plus aria-hidden /> Novo projeto
    </Link>
  );
  if (projetos.length === 0) {
    return (
      <EstadoVazio
        icone={FolderKanban}
        titulo="Nenhum projeto para este cliente"
        descricao="Quando ele pedir um orçamento, crie um projeto: é por ele que a visita, a proposta e a obra ficam organizadas."
        acao={novo}
      />
    );
  }
  return (
    <section aria-labelledby="titulo-projetos-cliente" className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="titulo-projetos-cliente" className="font-medium">
          Projetos
        </h2>
        {novo}
      </div>
      <ul className="grid gap-2">
        {projetos.map((p) => (
          <li key={p.id}>
            <Link href={`/projetos/${p.id}`} className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{p.titulo}</span>
                <span className="text-muted-foreground text-xs">
                  {p.codigo} · criado em {formatarData(p.criadoEm)}
                  {p.valorEstimadoCentavos !== null ? ` · ${formatarMoeda(p.valorEstimadoCentavos)}` : ""}
                </span>
              </span>
              <Badge variant={p.status === "PERDIDO" ? "destructive" : p.status === "APROVADO" ? "default" : "secondary"}>{ROTULO_STATUS_PROJETO[p.status]}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
