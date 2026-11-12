"use client";

import { ArrowLeftRight, CheckCircle2, Circle, Pencil, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROTULO_FORMA, type FormaPagamento } from "@/lib/dominio/parcelas";
import { formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

import { conciliar } from "../actions/lancamentos";
import type { ContaComSaldo, ExtratoDaConta, OpcoesDeLancamento } from "../queries";

import { DialogoConta, DialogoLancamento } from "./dialogos-financeiros";

type Linha = ExtratoDaConta["linhas"][number];

function BotaoConciliar({ linha }: { linha: Linha }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const l = linha.lancamento;
  if (l.estornado) return null;
  return (
    <button
      type="button"
      disabled={pendente}
      aria-pressed={l.conciliado}
      aria-label={l.conciliado ? `Desfazer a conciliação de ${l.descricao}` : `Marcar ${l.descricao} como conciliado`}
      className="text-muted-foreground hover:text-foreground inline-flex min-h-8 items-center gap-1 text-xs disabled:opacity-50"
      onClick={() =>
        iniciar(async () => {
          const r = await conciliar({ lancamentoId: l.id, conciliado: !l.conciliado });
          if (r.ok) router.refresh();
          else toast.error(r.erro);
        })
      }
    >
      {l.conciliado ? <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> : <Circle className="size-4" aria-hidden />}
      {l.conciliado ? "Conciliado" : "Conciliar"}
    </button>
  );
}

function Descricao({ linha }: { linha: Linha }) {
  const l = linha.lancamento;
  return (
    <div className="grid gap-0.5">
      <Link href={`/financeiro/lancamentos/${l.id}`} className={cn("font-medium hover:underline", l.estornado && "text-muted-foreground line-through")}>
        {l.descricao}
      </Link>
      <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {l.categoria ? <span>{l.categoria}</span> : l.transferenciaId ? null : <span>Sem categoria</span>}
        {l.forma ? <span>{ROTULO_FORMA[l.forma as FormaPagamento] ?? l.forma}</span> : null}
        {l.transferenciaId ? (
          <Badge variant="secondary">
            <ArrowLeftRight aria-hidden /> Transferência
          </Badge>
        ) : null}
        {l.comNotaFiscal ? <Badge variant="outline">Com nota</Badge> : null}
        {l.estornado ? <Badge variant="destructive">Estornado{l.motivoEstorno ? `: ${l.motivoEstorno}` : ""}</Badge> : null}
        {linha.incluidoNoSaldoInicial ? <Badge variant="outline">Já incluído no saldo inicial</Badge> : null}
      </span>
    </div>
  );
}

function Valor({ linha }: { linha: Linha }) {
  const l = linha.lancamento;
  const entrada = l.tipo === "ENTRADA";
  return (
    <span className={cn("font-medium tabular-nums", l.estornado || linha.incluidoNoSaldoInicial ? "text-muted-foreground" : entrada ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400", l.estornado && "line-through")}>
      {entrada ? "+" : "−"} {formatarMoeda(l.valorCentavos)}
    </span>
  );
}

export function ExtratoDaContaLista({ extrato }: { extrato: ExtratoDaConta }) {
  if (extrato.linhas.length === 0) {
    return <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">Nenhum lançamento neste período. Use “Novo lançamento” ou ajuste as datas.</p>;
  }
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Extrato da conta</caption>
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs">
              <th scope="col" className="py-2 pr-3 font-medium">Data</th>
              <th scope="col" className="py-2 pr-3 font-medium">Lançamento</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Valor</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Saldo</th>
              <th scope="col" className="py-2 font-medium">Conferência</th>
            </tr>
          </thead>
          <tbody>
            {extrato.linhas.map((linha) => (
              <tr key={linha.lancamento.id} className="border-b align-top">
                <td className="py-2 pr-3 whitespace-nowrap">{formatarDataCalendario(linha.lancamento.data)}</td>
                <td className="py-2 pr-3">
                  <Descricao linha={linha} />
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  <Valor linha={linha} />
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{formatarMoeda(linha.saldoAposCentavos)}</td>
                <td className="py-2">
                  <BotaoConciliar linha={linha} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-2 md:hidden">
        {extrato.linhas.map((linha) => (
          <li key={linha.lancamento.id} className="grid gap-2 rounded-xl border p-3">
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground text-xs">{formatarDataCalendario(linha.lancamento.data)}</span>
              <Valor linha={linha} />
            </div>
            <Descricao linha={linha} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">Saldo: {formatarMoeda(linha.saldoAposCentavos)}</span>
              <BotaoConciliar linha={linha} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Botões da página da conta: editar a conta e lançar nela. */
export function AcoesDaConta({ conta, opcoes, hoje }: { conta: ContaComSaldo; opcoes: OpcoesDeLancamento; hoje: string }) {
  const [dialogo, setDialogo] = useState<"conta" | "lancamento" | null>(null);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setDialogo("conta")}>
        <Pencil aria-hidden /> Editar conta
      </Button>
      <Button type="button" onClick={() => setDialogo("lancamento")} disabled={!conta.ativo}>
        <Wallet aria-hidden /> Novo lançamento
      </Button>
      {dialogo === "conta" ? <DialogoConta conta={conta} aoFechar={() => setDialogo(null)} /> : null}
      {dialogo === "lancamento" ? <DialogoLancamento opcoes={opcoes} hoje={hoje} contaInicialId={conta.id} aoFechar={() => setDialogo(null)} /> : null}
    </>
  );
}
