"use client";

import { Ban, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { AreaTexto, Campo, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { estornar } from "../actions/lancamentos";

/** Estorno com motivo: o lançamento fica marcado e sai de saldo, fluxo e DRE (nada é apagado). */
export function BotaoEstornar({ lancamentoId, transferencia, comTitulo }: { lancamentoId: string; transferencia: boolean; comTitulo: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<{ geral?: string; campos?: Record<string, string> }>({});
  const [pendente, iniciar] = useTransition();
  const campos = erro.campos ?? {};

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro({});
    iniciar(async () => {
      const r = await estornar({ lancamentoId, motivo });
      if (r.ok) {
        toast.success(r.mensagem ?? "Estornado.");
        setAberto(false);
        router.refresh();
      } else setErro({ geral: r.erro, campos: r.campos });
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAberto(true)}>
        <Ban aria-hidden /> Estornar
      </Button>
      {aberto ? (
        <Dialog open onOpenChange={(a) => !a && !pendente && setAberto(false)}>
          <DialogContent>
            <form onSubmit={enviar} className="grid gap-4" noValidate>
              <DialogHeader>
                <DialogTitle>Estornar o lançamento?</DialogTitle>
                <DialogDescription>
                  O lançamento não é apagado: fica marcado como estornado, com o motivo, e sai do saldo, do fluxo e do DRE.
                  {transferencia ? " As duas pontas da transferência são estornadas juntas." : ""}
                  {comTitulo ? " O valor pago da conta e o status dela voltam ao que eram antes deste pagamento." : ""}
                </DialogDescription>
              </DialogHeader>
              <Campo id="estorno-motivo" rotulo="Motivo" erro={campos.motivo} obrigatorio>
                <AreaTexto id="estorno-motivo" rows={3} maxLength={300} required value={motivo} onChange={(e) => setMotivo(e.target.value)} {...ariaDoCampo("estorno-motivo", campos.motivo)} />
              </Campo>
              {erro.geral && Object.keys(campos).length === 0 ? (
                <p role="alert" className="text-destructive text-sm">
                  {erro.geral}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={pendente}>
                  Cancelar
                </Button>
                <Button type="submit" variant="destructive" disabled={pendente}>
                  {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Estornar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
