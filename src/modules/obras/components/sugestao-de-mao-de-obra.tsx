"use client";

import { Calculator, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { SugestaoDeMaoDeObra } from "@/lib/dominio/mao-de-obra";
import { formatarMoeda } from "@/lib/formatadores";

import { aplicarSugestaoDeMaoDeObra, verSugestaoDeMaoDeObra } from "../actions/mao-de-obra";

/** "Sugerir a partir dos salários": mostra a conta (salários da fábrica e da instalação ÷ capacidade em m²) e só grava se o gestor confirmar. */
export function SugestaoDeMaoDeObraPorM2() {
  const router = useRouter();
  const [sugestao, setSugestao] = useState<SugestaoDeMaoDeObra | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function ver() {
    setErro(null);
    iniciar(async () => {
      const r = await verSugestaoDeMaoDeObra();
      if (r.ok && r.dados) setSugestao(r.dados);
      else if (!r.ok) setErro(r.erro);
    });
  }
  function aplicar() {
    setErro(null);
    iniciar(async () => {
      const r = await aplicarSugestaoDeMaoDeObra();
      if (r.ok) {
        toast.success(r.mensagem ?? "Definido.");
        setSugestao(null);
        router.refresh();
      } else setErro(r.erro);
    });
  }

  return (
    <div className="grid gap-2 text-sm">
      {!sugestao ? (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={ver} disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : <Calculator aria-hidden />} Sugerir a partir dos salários
        </Button>
      ) : sugestao.ok ? (
        <div role="status" className="grid gap-2 rounded-lg border p-3">
          <p>
            Salários de {sugestao.funcionarios} funcionário(s) de fábrica e instalação ({formatarMoeda(sugestao.somaCentavos)}) ÷ capacidade de {sugestao.capacidadeM2Mes.toLocaleString("pt-BR")} m² por mês = <strong>{formatarMoeda(sugestao.centavosPorM2)} por m²</strong>.
          </p>
          <p className="text-muted-foreground text-xs">É só uma sugestão: nada muda até você confirmar. Se preferir outro valor, digite em Configurações → Empresa.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={aplicar} disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Usar este valor
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSugestao(null)} disabled={pendente}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <p role="status" className="text-muted-foreground rounded-lg border border-dashed p-3">
          Não dá para sugerir: {sugestao.motivo} <Button type="button" variant="ghost" size="sm" onClick={() => setSugestao(null)}>Fechar</Button>
        </p>
      )}
      {erro ? (
        <p role="alert" className="text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
