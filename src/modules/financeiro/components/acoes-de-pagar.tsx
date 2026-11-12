"use client";

import { Ban, Banknote, CalendarClock, Loader2, PencilLine, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { AreaTexto, CaixaMarcacao, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ResultadoAcao } from "@/lib/acoes";
import { FORMAS_PAGAMENTO, ROTULO_FORMA } from "@/lib/dominio/parcelas";
import { formatarMoeda } from "@/lib/formatadores";
import { mascararMoeda } from "@/lib/formatadores/mascaras";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";

import { ajustarContaPagar, cancelarContaPagar, pagar, reabrirContaPagar } from "../actions/pagar";

import { CampoDinheiro } from "./dialogos-financeiros";

export type ContaParaPagar = {
  id: string;
  status: "ABERTA" | "PARCIAL" | "PAGA" | "CANCELADA";
  descricao: string;
  valorCentavos: number;
  valorPagoCentavos: number;
  saldoCentavos: number;
  forma: string | null;
};

type Dialogo = "pagar" | "ajustar" | "cancelar" | "reabrir" | null;

function ErroGeral({ estado }: { estado: ResultadoAcao<unknown> | null }) {
  if (!estado || estado.ok) return null;
  if (estado.campos && Object.keys(estado.campos).length > 0) return null;
  return (
    <p role="alert" className="text-destructive text-sm">
      {estado.erro}
    </p>
  );
}

function Rodape({ pendente, aoFechar, rotulo, destrutivo = false }: { pendente: boolean; aoFechar: () => void; rotulo: string; destrutivo?: boolean }) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={aoFechar} disabled={pendente}>
        Cancelar
      </Button>
      <Button type="submit" variant={destrutivo ? "destructive" : "default"} disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} {rotulo}
      </Button>
    </DialogFooter>
  );
}

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

function DialogoPagamento({ conta, contas, hoje, aoFechar }: { conta: ContaParaPagar; contas: { id: string; nome: string }[]; hoje: string; aoFechar: () => void }) {
  const { estado, pendente, aoEnviar, erros } = useDialogo((fd) => pagar(null, fd), aoFechar);
  const [valor, setValor] = useState(mascararMoeda(String(conta.saldoCentavos)));
  const [chave, setChave] = useState(0);
  return (
    <Dialog open onOpenChange={(a) => !a && !pendente && aoFechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Registrar pagamento</DialogTitle>
            <DialogDescription>
              {conta.descricao}. Saldo a pagar: <strong>{formatarMoeda(conta.saldoCentavos)}</strong>. Pode ser parcial; não pode passar do saldo. O comprovante se anexa depois, no lançamento.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="contaPagarId" value={conta.id} />
          {contas.length === 0 ? (
            <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Não há conta financeira ativa. <Link href="/financeiro/contas" className="underline">Cadastre uma conta</Link> para registrar de onde saiu o dinheiro.
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="pg-data" rotulo="Data do pagamento" erro={erros.data} obrigatorio>
              <Input id="pg-data" name="data" type="date" required defaultValue={hoje} max={hoje} {...ariaDoCampo("pg-data", erros.data)} />
            </Campo>
            <Campo id="pg-valor" rotulo="Valor pago" erro={erros.valor} obrigatorio>
              <CampoDinheiro key={chave} id="pg-valor" nome="valor" erro={erros.valor} defaultValue={valor} />
            </Campo>
          </div>
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setValor(mascararMoeda(String(conta.saldoCentavos)));
                setChave((c) => c + 1);
              }}
            >
              Pagar o saldo todo ({formatarMoeda(conta.saldoCentavos)})
            </Button>
          </div>
          <Campo id="pg-conta" rotulo="Conta de onde saiu" erro={erros.contaFinanceiraId} obrigatorio>
            <Selecao id="pg-conta" name="contaFinanceiraId" required defaultValue={contas.length === 1 ? contas[0].id : ""} {...ariaDoCampo("pg-conta", erros.contaFinanceiraId)}>
              <option value="">Escolha a conta...</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo id="pg-forma" rotulo="Forma" erro={erros.forma}>
            <Selecao id="pg-forma" name="forma" defaultValue={conta.forma ?? ""}>
              <option value="">—</option>
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f} value={f}>
                  {ROTULO_FORMA[f]}
                </option>
              ))}
            </Selecao>
          </Campo>
          <CaixaMarcacao id="pg-nota" name="comNotaFiscal" rotulo="Pago com nota fiscal (só a marca)" />
          <Campo id="pg-obs" rotulo="Observação (opcional)" erro={erros.observacao}>
            <AreaTexto id="pg-obs" name="observacao" rows={2} maxLength={500} />
          </Campo>
          <ErroGeral estado={estado} />
          <Rodape pendente={pendente} aoFechar={aoFechar} rotulo="Registrar pagamento" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoAjuste({ conta, aoFechar }: { conta: ContaParaPagar; aoFechar: () => void }) {
  const { estado, pendente, aoEnviar, erros } = useDialogo((fd) => ajustarContaPagar(null, fd), aoFechar);
  return (
    <Dialog open onOpenChange={(a) => !a && !pendente && aoFechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Ajustar a conta</DialogTitle>
            <DialogDescription>
              Valor atual {formatarMoeda(conta.valorCentavos)}
              {conta.valorPagoCentavos > 0 ? `, já pago ${formatarMoeda(conta.valorPagoCentavos)} (o novo valor não pode ser menor)` : ""}. Deixe em branco o que não quer mudar. O ajuste fica na auditoria com o motivo.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="contaPagarId" value={conta.id} />
          <Campo id="ajp-valor" rotulo="Novo valor (opcional)" erro={erros.valor}>
            <CampoDinheiro id="ajp-valor" nome="valor" erro={erros.valor} obrigatorio={false} />
          </Campo>
          {conta.status !== "PAGA" ? (
            <Campo id="ajp-venc" rotulo="Novo vencimento (opcional)" erro={erros.vencimento}>
              <Input id="ajp-venc" name="vencimento" type="date" defaultValue="" {...ariaDoCampo("ajp-venc", erros.vencimento)} />
            </Campo>
          ) : null}
          <Campo id="ajp-motivo" rotulo="Motivo" erro={erros.motivo} obrigatorio>
            <AreaTexto id="ajp-motivo" name="motivo" rows={2} maxLength={300} required {...ariaDoCampo("ajp-motivo", erros.motivo)} />
          </Campo>
          <ErroGeral estado={estado} />
          <Rodape pendente={pendente} aoFechar={aoFechar} rotulo="Ajustar" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoCancelar({ conta, aoFechar }: { conta: ContaParaPagar; aoFechar: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<{ geral?: string; campos?: Record<string, string> }>({});
  const [pendente, iniciar] = useTransition();
  const campos = erro.campos ?? {};
  return (
    <Dialog open onOpenChange={(a) => !a && !pendente && aoFechar()}>
      <DialogContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setErro({});
            iniciar(async () => {
              const r = await cancelarContaPagar({ contaPagarId: conta.id, motivo });
              if (r.ok) {
                toast.success(r.mensagem ?? "Cancelada.");
                aoFechar();
                router.refresh();
              } else setErro({ geral: r.erro, campos: r.campos });
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Cancelar a conta?</DialogTitle>
            <DialogDescription>{conta.descricao}. Nada é apagado: a conta fica cancelada, com o motivo. Só se cancela conta sem pagamento (com pagamento, estorne antes).</DialogDescription>
          </DialogHeader>
          <Campo id="cap-motivo" rotulo="Motivo" erro={campos.motivo} obrigatorio>
            <AreaTexto id="cap-motivo" rows={2} maxLength={300} required value={motivo} onChange={(e) => setMotivo(e.target.value)} {...ariaDoCampo("cap-motivo", campos.motivo)} />
          </Campo>
          {erro.geral && Object.keys(campos).length === 0 ? (
            <p role="alert" className="text-destructive text-sm">
              {erro.geral}
            </p>
          ) : null}
          <Rodape pendente={pendente} aoFechar={aoFechar} rotulo="Cancelar a conta" destrutivo />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Botões da página da conta a pagar: pagar, ajustar, cancelar e reabrir. */
export function AcoesDePagar({ conta, contas, hoje }: { conta: ContaParaPagar; contas: { id: string; nome: string }[]; hoje: string }) {
  const router = useRouter();
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [pendente, iniciar] = useTransition();
  const aberta = conta.status === "ABERTA" || conta.status === "PARCIAL";
  const fechar = () => setDialogo(null);

  function reabrir() {
    iniciar(async () => {
      const r = await reabrirContaPagar({ contaPagarId: conta.id });
      fechar();
      if (r.ok) {
        toast.success(r.mensagem ?? "Reaberta.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {aberta ? (
          <Button type="button" onClick={() => setDialogo("pagar")}>
            <Banknote aria-hidden /> Registrar pagamento
          </Button>
        ) : null}
        {conta.status !== "CANCELADA" ? (
          <Button type="button" variant="outline" onClick={() => setDialogo("ajustar")}>
            {aberta ? <CalendarClock aria-hidden /> : <PencilLine aria-hidden />} {conta.status === "PAGA" ? "Ajustar valor" : "Ajustar valor ou vencimento"}
          </Button>
        ) : null}
        {conta.status !== "CANCELADA" && conta.valorPagoCentavos === 0 ? (
          <Button type="button" variant="ghost" onClick={() => setDialogo("cancelar")}>
            <Ban aria-hidden /> Cancelar conta
          </Button>
        ) : null}
        {conta.status === "CANCELADA" ? (
          <Button type="button" variant="outline" onClick={() => setDialogo("reabrir")}>
            <RotateCcw aria-hidden /> Reabrir
          </Button>
        ) : null}
      </div>
      {dialogo === "pagar" ? <DialogoPagamento conta={conta} contas={contas} hoje={hoje} aoFechar={fechar} /> : null}
      {dialogo === "ajustar" ? <DialogoAjuste conta={conta} aoFechar={fechar} /> : null}
      {dialogo === "cancelar" ? <DialogoCancelar conta={conta} aoFechar={fechar} /> : null}
      <ConfirmarAcao aberto={dialogo === "reabrir"} aoFechar={fechar} titulo="Reabrir a conta?" descricao="Ela volta a ficar em aberto." botao="Reabrir" pendente={pendente} aoConfirmar={reabrir} />
    </>
  );
}
