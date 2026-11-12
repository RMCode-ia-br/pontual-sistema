import { Banknote, Filter, HardHat, Landmark, Percent, Receipt, Scale } from "lucide-react";
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
      <h2 className="mt-8 mb-3 text-lg font-medium">Financeiro</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {[
          { href: "/financeiro", icone: Landmark, titulo: "Fluxo de caixa", texto: "Realizado × projetado por mês e em 30, 60 e 90 dias, com o saldo das contas." },
          { href: "/financeiro/dre", icone: Scale, titulo: "DRE gerencial", texto: "Resultado por mês, por grupo e categoria, em regime de caixa ou de competência." },
          { href: "/relatorios/financeiro/receber", icone: Banknote, titulo: "A receber por idade e inadimplência", texto: "Quanto falta receber e há quanto tempo está atrasado, por cliente." },
          { href: "/relatorios/margem-obras", icone: Percent, titulo: "Margem por obra", texto: "Receita da margem menos o custo real de cada obra, com a origem de cada custo; margem incompleta nunca aparece como zero." },
          { href: "/relatorios/financeiro/pagar", icone: Receipt, titulo: "A pagar por vencimento, fornecedor e categoria", texto: "O que vence e o que está atrasado, por faixa, fornecedor e categoria." },
        ].map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="hover:bg-accent flex gap-3 rounded-xl border p-4 transition-colors">
              <r.icone className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
              <span>
                <span className="block font-medium">{r.titulo}</span>
                <span className="text-muted-foreground text-sm">{r.texto}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-6 text-sm">Os relatórios de estoque chegam com o módulo correspondente.</p>
    </>
  );
}
