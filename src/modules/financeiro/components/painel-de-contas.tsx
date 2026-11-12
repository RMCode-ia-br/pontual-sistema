"use client";

import { ArrowLeftRight, Landmark, Plus, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

import type { ContaComSaldo, OpcoesDeLancamento } from "../queries";
import { ROTULO_TIPO_DE_CONTA } from "../schemas";

import { DialogoConta, DialogoLancamento, DialogoTransferencia } from "./dialogos-financeiros";

type Dialogo = "conta" | "lancamento" | "transferencia" | null;

export function ValorEmReais({ centavos, className }: { centavos: number; className?: string }) {
  return <span className={cn("tabular-nums", centavos < 0 && "text-destructive", className)}>{formatarMoeda(centavos)}</span>;
}

export function AvisoDeSaldoNaoInformado({ nomes }: { nomes: string[] }) {
  if (nomes.length === 0) return null;
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
      <span>
        <strong>Saldo não informado</strong> em {nomes.join(", ")}. Enquanto não for preenchido, o saldo mostra só o movimento registrado, e o fluxo de caixa e o DRE avisam disso. Informe o saldo e a data dele em “Editar conta”.
      </span>
    </p>
  );
}

function CartaoDaConta({ conta }: { conta: ContaComSaldo }) {
  return (
    <li>
      <Link
        href={`/financeiro/contas/${conta.id}`}
        className="hover:border-primary/50 focus-visible:ring-ring/50 grid gap-1 rounded-xl border p-4 outline-none focus-visible:ring-3"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{conta.nome}</span>
          <Badge variant="secondary">{ROTULO_TIPO_DE_CONTA[conta.tipo]}</Badge>
          {!conta.ativo ? <Badge variant="outline">Inativa</Badge> : null}
        </span>
        <span className="text-2xl font-semibold">
          <ValorEmReais centavos={conta.saldoAtualCentavos} />
        </span>
        {conta.saldoInicialInformado && conta.dataSaldoInicial ? (
          <span className="text-muted-foreground text-xs">
            Saldo inicial de {formatarMoeda(conta.saldoInicialCentavos)} em {formatarDataCalendario(conta.dataSaldoInicial)}
          </span>
        ) : (
          <Badge variant="outline" className="w-fit border-amber-500/60">
            Saldo não informado
          </Badge>
        )}
        <span className="text-muted-foreground text-xs">
          {conta.totalDeLancamentos === 0 ? "Nenhum lançamento ainda" : `${conta.totalDeLancamentos} lançamento${conta.totalDeLancamentos === 1 ? "" : "s"}`}
        </span>
      </Link>
    </li>
  );
}

export function PainelDeContas({ ativas, inativas, opcoes, hoje }: { ativas: ContaComSaldo[]; inativas: ContaComSaldo[]; opcoes: OpcoesDeLancamento; hoje: string }) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const semSaldo = ativas.filter((c) => !c.saldoInicialInformado).map((c) => c.nome);
  const total = ativas.reduce((s, c) => s + c.saldoAtualCentavos, 0);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => setDialogo("conta")}>
          <Plus aria-hidden /> Nova conta
        </Button>
        <Button type="button" variant="outline" onClick={() => setDialogo("lancamento")} disabled={ativas.length === 0}>
          <Wallet aria-hidden /> Novo lançamento
        </Button>
        <Button type="button" variant="outline" onClick={() => setDialogo("transferencia")} disabled={ativas.length < 2}>
          <ArrowLeftRight aria-hidden /> Transferência
        </Button>
      </div>

      {ativas.length === 0 ? (
        <EstadoVazio
          icone={Landmark}
          titulo="Cadastre as contas onde o dinheiro entra e sai"
          descricao="Um banco, o caixa da loja. Sem contas não dá para registrar pagamentos. O saldo inicial é opcional: o sistema não inventa saldo e avisa no fluxo de caixa e no DRE enquanto faltar."
          acao={
            <Button type="button" onClick={() => setDialogo("conta")}>
              <Plus aria-hidden /> Cadastrar a primeira conta
            </Button>
          }
        />
      ) : (
        <>
          <AvisoDeSaldoNaoInformado nomes={semSaldo} />
          <section aria-labelledby="titulo-total" className="grid gap-1">
            <h2 id="titulo-total" className="text-muted-foreground text-sm">
              Saldo total das contas ativas
            </h2>
            <p className="text-3xl font-semibold">
              <ValorEmReais centavos={total} />
            </p>
            {semSaldo.length > 0 ? <p className="text-muted-foreground text-xs">Inclui contas sem saldo informado (só o movimento registrado).</p> : null}
          </section>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ativas.map((c) => (
              <CartaoDaConta key={c.id} conta={c} />
            ))}
          </ul>
        </>
      )}

      {inativas.length > 0 ? (
        <section aria-labelledby="titulo-inativas" className="grid gap-3">
          <h2 id="titulo-inativas" className="text-muted-foreground text-sm font-medium">
            Contas inativas
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inativas.map((c) => (
              <CartaoDaConta key={c.id} conta={c} />
            ))}
          </ul>
        </section>
      ) : null}

      {dialogo === "conta" ? <DialogoConta aoFechar={() => setDialogo(null)} /> : null}
      {dialogo === "lancamento" ? <DialogoLancamento opcoes={opcoes} hoje={hoje} aoFechar={() => setDialogo(null)} /> : null}
      {dialogo === "transferencia" ? <DialogoTransferencia contas={opcoes.contas} hoje={hoje} aoFechar={() => setDialogo(null)} /> : null}
    </div>
  );
}
