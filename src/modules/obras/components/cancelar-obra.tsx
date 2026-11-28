"use client";

import { AlertTriangle, Ban, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { AreaTexto } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatarMoeda } from "@/lib/formatadores";

import { cancelarObraAcao, previaCancelarObraAcao } from "../actions/cancelar";
import type { PreviaDoCancelamento } from "../servico-cancelar";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Botão e diálogo de "Cancelar a obra" (ação destrutiva de Obras). A prévia só LÊ: mostra o que muda, o que fica como está e
 * o que o sistema NÃO desfaz; o servidor lê tudo de novo ao cancelar. O motivo é obrigatório.
 */
export function CancelarObra({ projetoId, codigo }: { projetoId: string; codigo: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [previa, setPrevia] = useState<PreviaDoCancelamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [carregando, carregar] = useTransition();
  const [pendente, iniciar] = useTransition();

  function abrir() {
    setAberto(true);
    setPrevia(null);
    setErro(null);
    setMotivo("");
    carregar(async () => {
      const r = await previaCancelarObraAcao(projetoId);
      if (r.ok && r.dados) setPrevia(r.dados);
      else setErro(r.ok ? "Não foi possível ler a prévia." : r.erro);
    });
  }

  function cancelar() {
    setErro(null);
    iniciar(async () => {
      const r = await cancelarObraAcao({ projetoId, motivo });
      if (r.ok) {
        toast.success(r.mensagem ?? "Obra cancelada.");
        setAberto(false);
        router.push("/obras");
      } else setErro(r.erro);
    });
  }

  const bloqueada = !!previa && previa.bloqueios.length > 0;
  const plano = previa?.plano;

  return (
    <>
      <Button type="button" variant="destructive" onClick={abrir}>
        <Ban aria-hidden /> Cancelar a obra
      </Button>

      <Dialog open={aberto} onOpenChange={(a) => !a && !pendente && setAberto(false)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancelar a obra {codigo}</DialogTitle>
            <DialogDescription>
              A obra passa a “Cancelado”. A proposta continua aprovada: a venda do mês em que foi aprovada não some, e o cancelamento aparece no relatório de vendas, no mês em que acontece. Nada é apagado.
            </DialogDescription>
          </DialogHeader>

          {carregando || (!previa && !erro) ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
              <Loader2 className="animate-spin" aria-hidden /> Conferindo o que muda…
            </p>
          ) : null}

          {previa && bloqueada ? (
            <div role="alert" className="border-destructive/40 bg-destructive/10 rounded-lg border p-3 text-sm">
              <p className="font-medium">Não dá para cancelar:</p>
              <ul className="mt-1 list-disc pl-5">
                {previa.bloqueios.map((b) => (
                  <li key={b.codigo}>{b.texto}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {previa && plano && !bloqueada ? (
            <div className="grid gap-3 text-sm">
              <section aria-label="O que vai mudar" className="grid gap-1 rounded-lg border p-3">
                <p className="font-medium">O que vai mudar</p>
                <ul className="list-disc pl-5">
                  <li>
                    A obra {previa.codigo} ({previa.cliente}) vai para “Cancelado”.
                  </li>
                  <li>
                    {plano.parcelasACancelar.length > 0
                      ? `${plural(plano.parcelasACancelar.length, "parcela a receber será cancelada", "parcelas a receber serão canceladas")} (${formatarMoeda(plano.valorACancelarCentavos)}).`
                      : "Nenhuma parcela a receber será cancelada."}
                  </li>
                  <li>{plano.tarefasACancelar > 0 ? `${plural(plano.tarefasACancelar, "tarefa aberta será cancelada", "tarefas abertas serão canceladas")}.` : "Nenhuma tarefa aberta será cancelada."}</li>
                </ul>
              </section>

              {plano.parcelasQueFicam.length > 0 ? (
                <section aria-label="O que fica como está" className="grid gap-1 rounded-lg border p-3">
                  <p className="font-medium">O que fica como está</p>
                  <ul className="list-disc pl-5">
                    <li>
                      {plural(plano.parcelasQueFicam.length, "parcela já tem recebimento", "parcelas já têm recebimento")} ({formatarMoeda(plano.valorRecebidoCentavos)} recebidos): continua registrada.
                    </li>
                  </ul>
                </section>
              ) : null}

              {plano.avisos.length > 0 ? (
                <section aria-label="O que o sistema não desfaz" className="grid gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                  <p className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="size-4 text-amber-600" aria-hidden /> O que o sistema NÃO desfaz (trate à parte)
                  </p>
                  <ul className="list-disc pl-5">
                    {plano.avisos.map((a) => (
                      <li key={a.codigo + a.texto}>{a.texto}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <label className="grid gap-1">
                <span className="font-medium">Motivo do cancelamento (obrigatório)</span>
                <AreaTexto value={motivo} rows={2} maxLength={500} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo do cancelamento da obra" placeholder="Ex.: o cliente desistiu da obra" />
              </label>
            </div>
          ) : null}

          {erro ? (
            <p role="alert" className="text-destructive text-sm">
              {erro}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={pendente}>
              Voltar
            </Button>
            {previa && !bloqueada ? (
              <Button type="button" variant="destructive" onClick={cancelar} disabled={pendente || motivo.trim().length < 3}>
                {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Cancelar a obra
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
