import { Filter, HardHat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";

export const metadata: Metadata = { title: "Relatórios" };

export default async function PaginaRelatorios() {
  await exigirSessao();
  return (
    <>
      <CabecalhoPagina titulo="Relatórios" descricao="Números para decidir. Cada relatório mostra como é calculado, filtra por período e exporta em CSV." />
      <h2 className="mb-3 text-lg font-medium">Comercial</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        <li>
          <Link href="/relatorios/funil" className="hover:bg-accent flex gap-3 rounded-xl border p-4 transition-colors">
            <Filter className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              <span className="block font-medium">Funil e origem dos clientes</span>
              <span className="text-muted-foreground text-sm">Quantos projetos chegam a cada fase, de onde vêm, por que se perdem e quanto demora da visita à proposta.</span>
            </span>
          </Link>
        </li>
      </ul>
      <h2 className="mt-8 mb-3 text-lg font-medium">Obras</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        <li>
          <Link href="/relatorios/obras" className="hover:bg-accent flex gap-3 rounded-xl border p-4 transition-colors">
            <HardHat className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              <span className="block font-medium">Obras e assistência</span>
              <span className="text-muted-foreground text-sm">Pontualidade das obras concluídas (com e sem pausas), atrasos por etapa, pausas por motivo e chamados de assistência.</span>
            </span>
          </Link>
        </li>
      </ul>
      <p className="text-muted-foreground mt-6 text-sm">Os relatórios de financeiro e estoque chegam com os módulos correspondentes.</p>
    </>
  );
}
