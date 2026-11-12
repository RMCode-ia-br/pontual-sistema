"use client";

import { Banknote, Loader2, Scale } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { AreaTexto, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ResultadoAcao } from "@/lib/acoes";
import { formatarQuantidade } from "@/lib/dominio/estoque";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { CampoDinheiro } from "@/modules/financeiro/components/dialogos-financeiros";

import { ajustarSucataAcao, venderSucataAcao } from "../actions/retalhos";

function useDialogo(acao: (fd: FormData) => Promise<ResultadoAcao<unknown>>, aoFechar: () => void) {
  const router = useRouter();
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<unknown>(acao, (r) => {
    if (r.ok) {
      toast.success(r.mensagem ?? "Salvo.");
      aoFechar();
      router.refresh();
    }
  });
  return { estado, pendente, aoEnviar, erros: estado && !estado.ok ? (estado.campos ?? {}) : {} };
}

function Rodape({ pendente, aoFechar, rotulo }: { pendente: boolean; aoFechar: () => void; rotulo: string }) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={aoFechar} disabled={pendente}>
        Cancelar
      </Button>
      <Button type="submit" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} {rotulo}
      </Button>
    </DialogFooter>
  );
}

function DialogoVenda({ saldoMilesimosKg, contas, hoje, aoFechar }: { saldoMilesimosKg: number; contas: { id: string; nome: string }[]; hoje: string; aoFechar: () => void }) {
  const { estado, pendente, aoEnviar, erros } = useDialogo((fd) => venderSucataAcao(null, fd), aoFechar);
  return (
    <Dialog open onOpenChange={(a) => !a && !pendente && aoFechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Vender sucata</DialogTitle>
            <DialogDescription>Saldo registrado: {formatarQuantidade(saldoMilesimosKg)} kg. Digite o peso e o valor da venda; nada é calculado por você.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo id="sv-data" rotulo="Data" erro={erros.data} obrigatorio>
              <Input id="sv-data" name="data" type="date" required max={hoje} defaultValue={hoje} {...ariaDoCampo("sv-data", erros.data)} />
            </Campo>
            <Campo id="sv-peso" rotulo="Peso (kg)" erro={erros.peso} obrigatorio>
              <Input id="sv-peso" name="peso" inputMode="decimal" required autoComplete="off" {...ariaDoCampo("sv-peso", erros.peso)} />
            </Campo>
            <Campo id="sv-valor" rotulo="Valor da venda" erro={erros.valor} obrigatorio>
              <CampoDinheiro id="sv-valor" nome="valor" erro={erros.valor} />
            </Campo>
          </div>
          <Campo id="sv-conta" rotulo="Conta onde o dinheiro entrou (opcional)" erro={erros.contaFinanceiraId} dica="Escolhendo a conta, a entrada também é lançada no financeiro (categoria “Venda de sucata”). Vazio: só registra a venda.">
            <Selecao id="sv-conta" name="contaFinanceiraId" defaultValue="">
              <option value="">Não lançar no financeiro agora</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo id="sv-obs" rotulo="Observação (opcional)" erro={erros.observacao}>
            <AreaTexto id="sv-obs" name="observacao" rows={2} maxLength={300} />
          </Campo>
          {estado && !estado.ok && Object.keys(erros).length === 0 ? (
            <p role="alert" className="text-destructive text-sm">
              {estado.erro}
            </p>
          ) : null}
          <Rodape pendente={pendente} aoFechar={aoFechar} rotulo="Registrar venda" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoAjuste({ hoje, aoFechar }: { hoje: string; aoFechar: () => void }) {
  const { estado, pendente, aoEnviar, erros } = useDialogo((fd) => ajustarSucataAcao(null, fd), aoFechar);
  return (
    <Dialog open onOpenChange={(a) => !a && !pendente && aoFechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Ajustar a sucata</DialogTitle>
            <DialogDescription>Para acertar o saldo depois de pesar: use um número positivo para acrescentar e um negativo (com “-”) para retirar.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="sa-data" rotulo="Data" erro={erros.data} obrigatorio>
              <Input id="sa-data" name="data" type="date" required max={hoje} defaultValue={hoje} {...ariaDoCampo("sa-data", erros.data)} />
            </Campo>
            <Campo id="sa-peso" rotulo="Peso (kg)" erro={erros.peso} obrigatorio dica="Ex.: 2,5 ou -1,2">
              <Input id="sa-peso" name="peso" inputMode="text" required autoComplete="off" {...ariaDoCampo("sa-peso", erros.peso)} />
            </Campo>
          </div>
          <Campo id="sa-obs" rotulo="Motivo" erro={erros.observacao} obrigatorio>
            <AreaTexto id="sa-obs" name="observacao" rows={2} maxLength={300} required {...ariaDoCampo("sa-obs", erros.observacao)} />
          </Campo>
          {estado && !estado.ok && Object.keys(erros).length === 0 ? (
            <p role="alert" className="text-destructive text-sm">
              {estado.erro}
            </p>
          ) : null}
          <Rodape pendente={pendente} aoFechar={aoFechar} rotulo="Registrar ajuste" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Botões da sucata: vender e ajustar o saldo. */
export function AcoesDeSucata({ saldoMilesimosKg, contas, hoje }: { saldoMilesimosKg: number; contas: { id: string; nome: string }[]; hoje: string }) {
  const [dialogo, setDialogo] = useState<"vender" | "ajustar" | null>(null);
  const fechar = () => setDialogo(null);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setDialogo("vender")} disabled={saldoMilesimosKg <= 0}>
          <Banknote aria-hidden /> Vender sucata
        </Button>
        <Button type="button" variant="outline" onClick={() => setDialogo("ajustar")}>
          <Scale aria-hidden /> Ajustar o saldo
        </Button>
      </div>
      {dialogo === "vender" ? <DialogoVenda saldoMilesimosKg={saldoMilesimosKg} contas={contas} hoje={hoje} aoFechar={fechar} /> : null}
      {dialogo === "ajustar" ? <DialogoAjuste hoje={hoje} aoFechar={fechar} /> : null}
    </>
  );
}
