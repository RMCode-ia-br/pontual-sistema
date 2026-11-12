import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { BotaoNovaContaAPagar } from "@/modules/financeiro/components/dialogo-conta-pagar";
import { PainelDeRecorrencias } from "@/modules/financeiro/components/painel-recorrencias";
import { listarRecorrencias, opcoesDeContaAPagar } from "@/modules/financeiro/queries-pagar";
import { lerParametrosFinanceiros } from "@/modules/financeiro/queries-receber";

export const metadata: Metadata = { title: "Contas recorrentes" };

export default async function PaginaDeRecorrencias() {
  await exigirSessao();
  const hoje = dataLocalDoInstante(new Date());
  const [recorrencias, opcoes, config] = await Promise.all([listarRecorrencias(hoje), opcoesDeContaAPagar(), lerParametrosFinanceiros()]);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/financeiro/pagar" className="text-muted-foreground hover:underline">
          ← A pagar
        </Link>
      </p>
      <CabecalhoPagina
        titulo="Contas recorrentes"
        descricao={`Aluguel, energia, DAS, salários: as contas dos próximos ${config.mesesRecorrenciaAFrente} meses são geradas sozinhas (prazo ajustável em Configurações → Empresa → Financeiro).`}
        acoes={<BotaoNovaContaAPagar opcoes={opcoes} hoje={hoje} />}
      />
      <PainelDeRecorrencias recorrencias={recorrencias} opcoes={opcoes} />
    </>
  );
}
