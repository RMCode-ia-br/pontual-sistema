"use client";

import { Loader2, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Campo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarMoeda } from "@/lib/formatadores";

import { aplicarReajusteDoKg, preverReajusteKg, type PreviaDoReajusteKg } from "../actions/preco-kg";

/** Reajuste em % de TODOS os preços do kg preenchidos, com prévia antes de aplicar (os perfis são recalculados junto). */
export function ReajusteDoKg() {
  const router = useRouter();
  const [percentual, setPercentual] = useState("");
  const [previa, setPrevia] = useState<PreviaDoReajusteKg | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function ver() {
    setErro(null);
    setPrevia(null);
    iniciar(async () => {
      const r = await preverReajusteKg({ percentual });
      if (r.ok && r.dados) setPrevia(r.dados);
      else if (!r.ok) setErro(r.erro);
    });
  }

  function aplicar() {
    setErro(null);
    iniciar(async () => {
      const r = await aplicarReajusteDoKg({ percentual });
      if (r.ok) {
        toast.success(r.mensagem ?? "Reajuste aplicado.");
        setPrevia(null);
        setPercentual("");
        router.refresh();
      } else setErro(r.erro);
    });
  }

  const invalidas = previa?.linhas.filter((l) => l.novoCentavos === null).length ?? 0;
  return (
    <section aria-labelledby="titulo-reajuste-kg" className="grid gap-3 rounded-xl border p-4">
      <h2 id="titulo-reajuste-kg" className="flex items-center gap-2 font-medium">
        <TrendingUp className="size-4" aria-hidden /> Reajuste em todos os preços do kg
      </h2>
      <p className="text-muted-foreground text-sm">Aplica o mesmo percentual em todos os preços preenchidos (use sinal de menos para reduzir). Primeiro você vê a prévia.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Campo id="kg-percentual" rotulo="Percentual" className="w-40">
          <Input
            id="kg-percentual"
            value={percentual}
            onChange={(e) => {
              setPercentual(e.target.value);
              setPrevia(null);
            }}
            inputMode="decimal"
            placeholder="Ex.: 5 ou -3,5"
            maxLength={12}
            autoComplete="off"
          />
        </Campo>
        <Button type="button" variant="outline" onClick={ver} disabled={pendente || percentual.trim() === ""}>
          {pendente && !previa ? <Loader2 className="animate-spin" aria-hidden /> : null} Ver prévia
        </Button>
      </div>
      {erro ? (
        <p role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      ) : null}
      {previa ? (
        <div className="grid gap-2">
          <ul className="grid gap-1 text-sm">
            {previa.linhas.map((l) => (
              <li key={`${l.acabamento}-${l.linha ?? "geral"}`} className="flex flex-wrap justify-between gap-2 rounded-lg border px-3 py-1.5">
                <span>
                  {l.acabamento}
                  {l.linha ? ` · linha ${l.linha}` : ""}
                </span>
                <span className="tabular-nums">
                  {formatarMoeda(l.anteriorCentavos)} → {l.novoCentavos === null ? <strong className="text-destructive">inválido</strong> : <strong>{formatarMoeda(l.novoCentavos)}</strong>}
                </span>
              </li>
            ))}
          </ul>
          {invalidas > 0 ? (
            <p role="alert" className="text-destructive text-sm">
              {invalidas} preço(s) ficariam inválidos (zero, negativo ou acima do teto): nada pode ser aplicado com esse percentual.
            </p>
          ) : (
            <div>
              <Button type="button" onClick={aplicar} disabled={pendente}>
                {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Aplicar o reajuste
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
