"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Campo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { mascararMoeda } from "@/lib/formatadores/mascaras";
import { CampoDinheiro } from "@/modules/financeiro/components/dialogos-financeiros";

import { salvarPrecosKg } from "../actions/preco-kg";
import type { PrecoDoAcabamento } from "../queries-preco-kg";

const paraCampo = (c: number | null) => (c === null ? "" : mascararMoeda(String(c)));

/** Preço do kg de UM acabamento: o geral (qualquer linha) e, se quiser, um por linha. Vazio = "sem preço do kg". */
export function CartaoDePrecoKg({ acabamento, linhas }: { acabamento: PrecoDoAcabamento; linhas: { id: string; nome: string }[] }) {
  const router = useRouter();
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<unknown>((fd) => salvarPrecosKg(null, fd), (r) => {
    if (r.ok) {
      toast.success(r.mensagem ?? "Salvo.");
      router.refresh();
    }
  });
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const idGeral = `kg-${acabamento.id}-geral`;
  const porLinha = new Map(acabamento.porLinha.map((p) => [p.linhaId, p.custoKgCentavos]));
  const temLinhaPreenchida = acabamento.porLinha.some((p) => p.custoKgCentavos !== null);

  return (
    <form onSubmit={aoEnviar} className="grid gap-3 rounded-xl border p-4" noValidate aria-label={`Preço do kg: ${acabamento.nome}`}>
      <input type="hidden" name="acabamentoId" value={acabamento.id} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-medium">{acabamento.nome}</h2>
        {acabamento.geralCentavos === null && !temLinhaPreenchida ? <span className="text-muted-foreground text-xs">Sem preço do kg</span> : null}
      </div>

      <Campo id={idGeral} rotulo="Preço do kg (qualquer linha)" erro={erros["preco:geral"]} dica="R$ por quilo. Vazio = sem preço (o custo dos perfis fica “sem custo”, nunca zero).">
        <CampoDinheiro id={idGeral} nome="preco:geral" erro={erros["preco:geral"]} obrigatorio={false} defaultValue={paraCampo(acabamento.geralCentavos)} />
      </Campo>

      {linhas.length > 0 ? (
        <details open={temLinhaPreenchida} className="text-sm">
          <summary className="text-muted-foreground cursor-pointer">Preço diferente por linha (opcional)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {linhas.map((l) => {
              const id = `kg-${acabamento.id}-${l.id}`;
              return (
                <Campo key={l.id} id={id} rotulo={`Linha ${l.nome}`} erro={erros[`preco:${l.id}`]} dica="Vazio = vale o preço geral.">
                  <CampoDinheiro id={id} nome={`preco:${l.id}`} erro={erros[`preco:${l.id}`]} obrigatorio={false} defaultValue={paraCampo(porLinha.get(l.id) ?? null)} />
                </Campo>
              );
            })}
          </div>
        </details>
      ) : null}

      {acabamento.perfis > 0 ? (
        <p className="text-muted-foreground text-xs">
          {acabamento.perfis} {acabamento.perfis === 1 ? "perfil" : "perfis"} por kg neste acabamento.
        </p>
      ) : null}
      {acabamento.perfisSemCusto > 0 ? (
        <p role="status" className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {acabamento.perfisSemCusto} {acabamento.perfisSemCusto === 1 ? "perfil" : "perfis"} ainda sem custo
            {acabamento.perfisSemPeso > 0 ? `; ${acabamento.perfisSemPeso} sem peso por metro (sem ele não há custo por barra nem por metro)` : ""}.
          </span>
        </p>
      ) : null}

      {estado && !estado.ok && Object.keys(erros).length === 0 ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.erro}
        </p>
      ) : null}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Salvar preços
        </Button>
      </div>
    </form>
  );
}
