import { Banknote, BarChart3, Boxes, Factory, Filter, HandCoins, HardHat, Landmark, Percent, Receipt, Ruler, Scale, Star, Target, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirModulo } from "@/lib/auth/modulo";
import { permissoesDe } from "@/lib/permissoes";
import { rotaLiberada } from "@/modules/relatorios/acesso";

export const metadata: Metadata = { title: "Relatórios" };

export default async function PaginaRelatorios() {
  const usuario = await exigirModulo("RELATORIOS");
  // Fase 7C: o índice só mostra o relatório que a pessoa abre (módulo de origem, valores e custo conforme o caso).
  const permissoes = permissoesDe(usuario);
  const liberado = (href: string) => rotaLiberada(permissoes, href);
  return (
    <>
      <CabecalhoPagina titulo="Relatórios" descricao="Números para decidir. Cada relatório mostra como é calculado, filtra por período e exporta em CSV." />
      {liberado("/relatorios/vendas") || liberado("/relatorios/fechamento") || liberado("/relatorios/funil") || liberado("/relatorios/clientes") || liberado("/relatorios/produtos-e-precos") ? (
        <>
        <h2 className="mb-3 text-lg font-medium">Comercial</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {liberado("/relatorios/vendas") ? (
        <li>
          <Link href="/relatorios/vendas" className="hover:bg-accent flex gap-3 rounded-xl border p-4 transition-colors">
            <BarChart3 className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              <span className="block font-medium">Vendas por período</span>
              <span className="text-muted-foreground text-sm">O que o cliente aprovou, proposta por proposta, com e sem nota, e o valor médio por obra.</span>
            </span>
          </Link>
        </li>
        ) : null}
        {liberado("/relatorios/fechamento") ? (
        <li>
          <Link href="/relatorios/fechamento" className="hover:bg-accent flex gap-3 rounded-xl border p-4 transition-colors">
            <Target className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              <span className="block font-medium">Fechamento e tempo de resposta</span>
              <span className="text-muted-foreground text-sm">Quantos projetos o cliente aprovou ou perdeu e quanto tempo se leva da visita até a proposta.</span>
            </span>
          </Link>
        </li>
        ) : null}
        {liberado("/relatorios/funil") ? (
        <li>
          <Link href="/relatorios/funil" className="hover:bg-accent flex gap-3 rounded-xl border p-4 transition-colors">
            <Filter className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              <span className="block font-medium">Funil e origem dos clientes</span>
              <span className="text-muted-foreground text-sm">Quantos projetos chegam a cada fase, de onde vêm, por que se perdem e quanto demora da visita à proposta.</span>
            </span>
          </Link>
        </li>
        ) : null}
        {liberado("/relatorios/clientes") ? (
        <li>
          <Link href="/relatorios/clientes" className="hover:bg-accent flex gap-3 rounded-xl border p-4 transition-colors">
            <Users className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              <span className="block font-medium">Clientes</span>
              <span className="text-muted-foreground text-sm">Quem fechou obra e não volta há tempo (para um contato) e onde estão as obras vendidas, por cidade.</span>
            </span>
          </Link>
        </li>
        ) : null}
        {liberado("/relatorios/produtos-e-precos") ? (
        <li>
          <Link href="/relatorios/produtos-e-precos" className="hover:bg-accent flex gap-3 rounded-xl border p-4 transition-colors">
            <Ruler className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              <span className="block font-medium">Produtos e preços</span>
              <span className="text-muted-foreground text-sm">Que esquadrias mais entram nas propostas aprovadas, em m² e R$, e o preço médio por m² mês a mês.</span>
            </span>
          </Link>
        </li>
        ) : null}
      </ul>
        </>
      ) : null}
      {liberado("/relatorios/producao") || liberado("/relatorios/avaliacoes") || liberado("/relatorios/obras") ? (
        <>
        <h2 className="mt-8 mb-3 text-lg font-medium">Obras</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {liberado("/relatorios/producao") ? (
        <li>
          <Link href="/relatorios/producao" className="hover:bg-accent flex gap-3 rounded-xl border p-4 transition-colors">
            <Factory className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              <span className="block font-medium">Produção da fábrica</span>
              <span className="text-muted-foreground text-sm">Quanto da capacidade está ocupada hoje, os m² produzidos por mês e as obras em andamento (com CSV).</span>
            </span>
          </Link>
        </li>
        ) : null}
        {liberado("/relatorios/avaliacoes") ? (
        <li>
          <Link href="/relatorios/avaliacoes" className="hover:bg-accent flex gap-3 rounded-xl border p-4 transition-colors">
            <Star className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              <span className="block font-medium">Avaliações no Google</span>
              <span className="text-muted-foreground text-sm">Das obras entregues, para quais já se pediu a avaliação e quais pedidos estão atrasados.</span>
            </span>
          </Link>
        </li>
        ) : null}
        {liberado("/relatorios/obras") ? (
        <li>
          <Link href="/relatorios/obras" className="hover:bg-accent flex gap-3 rounded-xl border p-4 transition-colors">
            <HardHat className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              <span className="block font-medium">Obras e assistência</span>
              <span className="text-muted-foreground text-sm">Pontualidade das obras concluídas (com e sem pausas), atrasos por etapa, pausas por motivo e chamados de assistência.</span>
            </span>
          </Link>
        </li>
        ) : null}
      </ul>
        </>
      ) : null}
      {liberado("/relatorios/faturamento") || liberado("/financeiro/recebimentos") || liberado("/financeiro") || liberado("/financeiro/dre") || liberado("/relatorios/financeiro/receber") || liberado("/relatorios/margem-obras") || liberado("/relatorios/financeiro/pagar") ? (
        <>
        <h2 className="mt-8 mb-3 text-lg font-medium">Financeiro</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {[
          { href: "/relatorios/faturamento", icone: BarChart3, titulo: "Faturamento mensal (12 meses)", texto: "Vendido e recebido mês a mês, com nota e sem nota separados." },
          { href: "/financeiro/recebimentos", icone: HandCoins, titulo: "Recebimentos", texto: "Cada pagamento recebido no período, com e sem nota; é a lista por trás do “Recebido” do painel." },
          { href: "/financeiro", icone: Landmark, titulo: "Fluxo de caixa", texto: "Realizado × projetado por mês e em 30, 60 e 90 dias, com o saldo das contas." },
          { href: "/financeiro/dre", icone: Scale, titulo: "DRE gerencial", texto: "Resultado por mês, por grupo e categoria, em regime de caixa ou de competência." },
          { href: "/relatorios/financeiro/receber", icone: Banknote, titulo: "A receber por idade e inadimplência", texto: "Quanto falta receber e há quanto tempo está atrasado, por cliente." },
          { href: "/relatorios/margem-obras", icone: Percent, titulo: "Margem por obra", texto: "Receita da margem menos o custo real de cada obra, com a origem de cada custo; margem incompleta nunca aparece como zero." },
          { href: "/relatorios/financeiro/pagar", icone: Receipt, titulo: "A pagar por vencimento, fornecedor e categoria", texto: "O que vence e o que está atrasado, por faixa, fornecedor e categoria." },
        ]
          .filter((r) => liberado(r.href))
          .map((r) => (
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
        </>
      ) : null}
      {liberado("/relatorios/estoque") ? (
        <>
        <h2 className="mt-8 mb-3 text-lg font-medium">Estoque e compras</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {liberado("/relatorios/estoque") ? (
        <li>
          <Link href="/relatorios/estoque" className="hover:bg-accent flex gap-3 rounded-xl border p-4 transition-colors">
            <Boxes className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              <span className="block font-medium">Posição do estoque e compras por fornecedor</span>
              <span className="text-muted-foreground text-sm">Estoque valorizado (separando o que está sem custo), abaixo do mínimo, retalhos, sucata e o que se comprou de cada fornecedor.</span>
            </span>
          </Link>
        </li>
        ) : null}
      </ul>
        </>
      ) : null}
    </>
  );
}
