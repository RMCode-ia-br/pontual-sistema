"use client";

import { Plus, Trash2 } from "lucide-react";

import { Selecao } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FORMAS_PAGAMENTO, GATILHOS, ROTULO_FORMA, ROTULO_GATILHO, type ParcelaPlanejada } from "@/lib/dominio/parcelas";
import { percentualParaPontosBase, pontosBaseParaPercentual } from "@/lib/dominio/preco";

import type { ParcelaSer } from "../tipos";

/** Uma parcela do cronograma como a pessoa digita (tudo texto). Serve à forma principal e às formas extras. */
export type LinhaParcela = { chave: string; descricao: string; percentual: string; gatilho: string; forma: string; diasApos: string; dataFixa: string; parcelasCartao: string };

let contador = 0;
export const novaChave = () => `c${++contador}`;

export const pct = (pb: number | null | undefined) => (pb === null || pb === undefined ? "" : pontosBaseParaPercentual(pb));

type Origem = Pick<ParcelaSer, "descricao" | "percentualPb" | "gatilho" | "forma" | "diasApos" | "parcelasCartao"> & { dataFixa?: string | null };

export function linhaDeParcela(p: Origem, comData = true): LinhaParcela {
  return {
    chave: novaChave(),
    descricao: p.descricao,
    percentual: pct(p.percentualPb),
    gatilho: p.gatilho,
    forma: p.forma ?? "",
    diasApos: p.diasApos === null ? "" : String(p.diasApos),
    dataFixa: comData ? (p.dataFixa ?? "") : "",
    parcelasCartao: p.parcelasCartao === null ? "" : String(p.parcelasCartao),
  };
}

export function entradaDeParcela(p: LinhaParcela) {
  return { descricao: p.descricao, percentual: p.percentual, gatilho: p.gatilho as (typeof GATILHOS)[number], forma: (p.forma || null) as (typeof FORMAS_PAGAMENTO)[number] | null, diasApos: p.diasApos, dataFixa: p.dataFixa, parcelasCartao: p.parcelasCartao };
}

/** Cronograma digitado → domínio, só para a prévia na tela (null se ainda não fecha). A validação de verdade é do servidor. */
export function planejarParcelas(linhas: LinhaParcela[]): ParcelaPlanejada[] | null {
  const lidas: ParcelaPlanejada[] = [];
  for (const p of linhas) {
    const pb = percentualParaPontosBase(p.percentual);
    if (pb === null || pb <= 0) return null;
    lidas.push({
      descricao: p.descricao || "Parcela",
      percentualPb: pb,
      gatilho: p.gatilho as ParcelaPlanejada["gatilho"],
      forma: (p.forma || null) as ParcelaPlanejada["forma"],
      diasApos: p.gatilho === "DIAS_APOS_APROVACAO" && /^\d+$/.test(p.diasApos) ? Number(p.diasApos) : null,
      dataFixa: p.gatilho === "DATA_FIXA" ? p.dataFixa || null : null,
      parcelasCartao: p.forma === "CARTAO_CREDITO" && /^\d+$/.test(p.parcelasCartao) ? Number(p.parcelasCartao) : null,
    });
  }
  return lidas;
}

type Props = {
  linhas: LinhaParcela[];
  aoMudar: (f: (a: LinhaParcela[]) => LinhaParcela[]) => void;
  somenteLeitura: boolean;
  /** Prefixo dos rótulos de acessibilidade ("" na forma principal; "Forma 2 — " nas extras). */
  prefixo?: string;
};

export function LinhasDeParcelas({ linhas, aoMudar, somenteLeitura: L, prefixo = "" }: Props) {
  const soma = linhas.reduce((s, p) => s + (percentualParaPontosBase(p.percentual) ?? 0) / 100, 0);
  const mudar = (chave: string, campo: keyof LinhaParcela, valor: string) => aoMudar((a) => a.map((x) => (x.chave === chave ? { ...x, [campo]: valor } : x)));
  return (
    <div className="grid gap-2">
      {linhas.map((p, i) => (
        <div key={p.chave} className="grid gap-2 rounded-lg border p-2 md:grid-cols-12">
          <Input className="md:col-span-4" value={p.descricao} disabled={L} maxLength={120} aria-label={`${prefixo}Descrição da parcela ${i + 1}`} onChange={(e) => mudar(p.chave, "descricao", e.target.value)} />
          <Input className="md:col-span-2" inputMode="decimal" value={p.percentual} disabled={L} maxLength={8} placeholder="%" aria-label={`${prefixo}Percentual da parcela ${i + 1}`} onChange={(e) => mudar(p.chave, "percentual", e.target.value)} />
          <Selecao className="md:col-span-3" value={p.gatilho} disabled={L} aria-label={`${prefixo}Gatilho da parcela ${i + 1}`} onChange={(e) => mudar(p.chave, "gatilho", e.target.value)}>
            {GATILHOS.map((g) => <option key={g} value={g}>{ROTULO_GATILHO[g]}</option>)}
          </Selecao>
          <Selecao className="md:col-span-3" value={p.forma} disabled={L} aria-label={`${prefixo}Forma da parcela ${i + 1}`} onChange={(e) => mudar(p.chave, "forma", e.target.value)}>
            <option value="">Forma a definir</option>
            {FORMAS_PAGAMENTO.map((m) => <option key={m} value={m}>{ROTULO_FORMA[m]}</option>)}
          </Selecao>
          {p.gatilho === "DATA_FIXA" ? <Input className="md:col-span-4" type="date" value={p.dataFixa} disabled={L} aria-label={`${prefixo}Data da parcela ${i + 1}`} onChange={(e) => mudar(p.chave, "dataFixa", e.target.value)} /> : null}
          {p.gatilho === "DIAS_APOS_APROVACAO" ? <Input className="md:col-span-4" inputMode="numeric" value={p.diasApos} disabled={L} maxLength={3} placeholder="Dias após a aprovação" aria-label={`${prefixo}Dias da parcela ${i + 1}`} onChange={(e) => mudar(p.chave, "diasApos", e.target.value)} /> : null}
          {p.forma === "CARTAO_CREDITO" ? <Input className="md:col-span-4" inputMode="numeric" value={p.parcelasCartao} disabled={L} maxLength={2} placeholder="Parcelas no cartão (até 12)" aria-label={`${prefixo}Parcelas do cartão da parcela ${i + 1}`} onChange={(e) => mudar(p.chave, "parcelasCartao", e.target.value)} /> : null}
          {!L ? <Button type="button" variant="ghost" size="sm" className="md:col-span-1" aria-label={`${prefixo}Remover a parcela ${i + 1}`} onClick={() => aoMudar((a) => a.filter((x) => x.chave !== p.chave))}><Trash2 aria-hidden /></Button> : null}
        </div>
      ))}
      {!L ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => aoMudar((a) => [...a, { chave: novaChave(), descricao: "", percentual: "", gatilho: "CONFIRMACAO", forma: "", diasApos: "", dataFixa: "", parcelasCartao: "" }])}>
            <Plus aria-hidden /> Parcela
          </Button>
          <span className={`text-sm ${linhas.length > 0 && Math.abs(soma - 100) > 0.001 ? "text-destructive" : "text-muted-foreground"}`}>Soma: {soma.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</span>
        </div>
      ) : null}
    </div>
  );
}
