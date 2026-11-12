import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

import type { FinanceiroDoCliente } from "../queries-receber";

import { SeloDaSituacao } from "./selo-da-situacao";

/** Aba "Financeiro" da ficha do cliente: quanto falta receber, o que está atrasado e as contas dele. */
export function FinanceiroDoClienteSecao({ clienteId, dados }: { clienteId: string; dados: FinanceiroDoCliente }) {
  if (dados.contas.length === 0) {
    return <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Este cliente ainda não tem contas a receber. Elas nascem quando uma proposta dele é aprovada.</p>;
  }
  return (
    <section aria-labelledby="titulo-fin-cliente" className="grid gap-4">
      <h2 id="titulo-fin-cliente" className="sr-only">
        Financeiro do cliente
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">Falta receber</p>
          <p className="text-xl font-semibold tabular-nums">{formatarMoeda(dados.saldoCentavos)}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">Atrasado</p>
          <p className={cn("text-xl font-semibold tabular-nums", dados.atrasadoCentavos > 0 && "text-destructive")}>{formatarMoeda(dados.atrasadoCentavos)}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">Já recebido</p>
          <p className="text-xl font-semibold tabular-nums">{formatarMoeda(dados.recebidoCentavos)}</p>
        </div>
      </div>
      <ul className="grid gap-2">
        {dados.contas.map((c) => (
          <li key={c.id} className="grid gap-1 rounded-xl border p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
            <div className="grid gap-0.5">
              <Link href={`/financeiro/receber/${c.id}`} className="font-medium hover:underline">
                {c.descricao}
              </Link>
              <p className="text-muted-foreground text-xs">
                {c.projetoCodigo ? `${c.projetoCodigo} · ` : ""}
                {c.vencimento ? `vence em ${formatarDataCalendario(c.vencimento)}` : "sem vencimento"}
                {c.valorPagoCentavos > 0 ? ` · recebido ${formatarMoeda(c.valorPagoCentavos)}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <span className="font-medium tabular-nums">{formatarMoeda(c.valorCentavos)}</span>
              <SeloDaSituacao resumo={c.resumo} />
            </div>
          </li>
        ))}
      </ul>
      <Link href={`/financeiro/receber?cliente=${clienteId}&aba=todas`} className={buttonVariants({ variant: "outline", className: "w-fit" })}>
        Ver em A receber
      </Link>
    </section>
  );
}
