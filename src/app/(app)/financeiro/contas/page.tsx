import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { PainelDeContas } from "@/modules/financeiro/components/painel-de-contas";
import { listarContasFinanceiras, opcoesDeLancamento } from "@/modules/financeiro/queries";

export const metadata: Metadata = { title: "Contas e lançamentos" };

export default async function PaginaDeContas() {
  await exigirSessao();
  const hoje = dataLocalDoInstante(new Date());
  const [todas, opcoes] = await Promise.all([listarContasFinanceiras(hoje, { incluirInativas: true }), opcoesDeLancamento()]);

  return (
    <>
      <CabecalhoPagina titulo="Contas e lançamentos" descricao="Onde o dinheiro entra e sai: saldo de cada conta, extrato, lançamentos avulsos e transferências." />
      <PainelDeContas ativas={todas.filter((c) => c.ativo)} inativas={todas.filter((c) => !c.ativo)} opcoes={opcoes} hoje={hoje} />
    </>
  );
}
