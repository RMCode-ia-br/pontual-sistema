"use client";

import { Loader2, PauseCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { AreaTexto, CaixaMarcacao, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatarDataCalendario } from "@/lib/formatadores";

import { ajustarPausaDaObra, encerrarPausaDaObra, excluirPausaDaObra, pausarObra } from "../actions/obra";
import type { PausaDaObra } from "../queries";

type Motivo = { id: string; nome: string; justificado: boolean };
type Alvo = { modo: "abrir" } | { modo: "encerrar" | "ajustar"; pausa: PausaDaObra };

type Props = { projetoId: string; pausas: PausaDaObra[]; motivos: Motivo[]; hoje: string; concluida: boolean; relogioIniciado: boolean };

export function PainelPausas({ projetoId, pausas, motivos, hoje, concluida, relogioIniciado }: Props) {
  const router = useRouter();
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const [excluindo, setExcluindo] = useState<PausaDaObra | null>(null);
  const [pendente, iniciar] = useTransition();
  const emCurso = pausas.find((p) => p.emCurso);

  function excluir() {
    const p = excluindo;
    if (!p) return;
    iniciar(async () => {
      const r = await excluirPausaDaObra({ pausaId: p.id });
      setExcluindo(null);
      if (r.ok) {
        toast.success(r.mensagem ?? "Removida.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  return (
    <section aria-labelledby="titulo-pausas" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-pausas" className="font-medium">
          Pausas da obra
        </h2>
        <Button type="button" size="sm" variant="outline" onClick={() => setAlvo({ modo: "abrir" })} disabled={concluida || !!emCurso}>
          <PauseCircle aria-hidden /> Pausar obra
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Uma pausa por motivo que não é culpa da Pontual (cliente, alvenaria, condomínio, força maior) é <strong>justificada</strong> e estende o prazo prometido pelos dias que ela cobre.
        {relogioIniciado ? "" : " O prazo ainda não começou a contar: pausas antes do início não estendem nada."}
      </p>
      {emCurso ? <p className="text-sm">Há uma pausa em curso desde {formatarDataCalendario(emCurso.inicio)}. Encerre-a antes de abrir outra ou de concluir a entrega.</p> : null}

      {pausas.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Nenhuma pausa registrada.</p>
      ) : (
        <ul className="grid gap-2">
          {pausas.map((p) => (
            <li key={p.id} className="grid gap-2 rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{p.motivo}</p>
                <Badge variant={p.justificada ? "default" : "outline"}>{p.justificada ? "Justificada (estende o prazo)" : "Não justificada"}</Badge>
                {p.emCurso ? <Badge variant="destructive">Em curso</Badge> : null}
              </div>
              <p className="text-sm">
                {formatarDataCalendario(p.inicio)} {p.fim ? `a ${formatarDataCalendario(p.fim)}` : "até hoje"}
              </p>
              {p.observacao ? <p className="text-muted-foreground text-sm whitespace-pre-line">{p.observacao}</p> : null}
              <div className="flex flex-wrap gap-2">
                {p.emCurso ? (
                  <Button type="button" size="sm" onClick={() => setAlvo({ modo: "encerrar", pausa: p })}>
                    Encerrar pausa
                  </Button>
                ) : null}
                <Button type="button" size="sm" variant="outline" onClick={() => setAlvo({ modo: "ajustar", pausa: p })}>
                  Ajustar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setExcluindo(p)} aria-label={`Remover a pausa de ${formatarDataCalendario(p.inicio)}`}>
                  <Trash2 aria-hidden /> Remover
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {alvo ? <DialogoDePausa key={alvo.modo === "abrir" ? "abrir" : `${alvo.modo}-${alvo.pausa.id}`} alvo={alvo} projetoId={projetoId} motivos={motivos} hoje={hoje} aoFechar={() => setAlvo(null)} /> : null}
      <ConfirmarAcao
        aberto={!!excluindo}
        aoFechar={() => setExcluindo(null)}
        titulo="Remover a pausa?"
        descricao="O registro sai da obra e o prazo prometido é recalculado sem ele. A remoção fica na auditoria."
        botao="Remover"
        pendente={pendente}
        aoConfirmar={excluir}
      />
    </section>
  );
}

function DialogoDePausa({ alvo, projetoId, motivos, hoje, aoFechar }: { alvo: Alvo; projetoId: string; motivos: Motivo[]; hoje: string; aoFechar: () => void }) {
  const router = useRouter();
  const pausa = alvo.modo === "abrir" ? null : alvo.pausa;
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(hoje);
  const [motivoId, setMotivoId] = useState("");
  const [justificada, setJustificada] = useState(pausa?.justificada ?? false);
  const [observacao, setObservacao] = useState(pausa?.observacao ?? "");
  const [erro, setErro] = useState<{ geral?: string; campos?: Record<string, string> }>({});
  const [pendente, iniciar] = useTransition();
  const campos = erro.campos ?? {};
  const motivo = motivos.find((m) => m.id === motivoId);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro({});
    iniciar(async () => {
      const r =
        alvo.modo === "abrir"
          ? await pausarObra({ projetoId, inicio, motivoBloqueioId: motivoId, observacao: observacao.trim() || null })
          : alvo.modo === "encerrar"
            ? await encerrarPausaDaObra({ pausaId: alvo.pausa.id, fim })
            : await ajustarPausaDaObra({ pausaId: alvo.pausa.id, justificada, observacao: observacao.trim() || null });
      if (r.ok) {
        toast.success(r.mensagem ?? "Salvo.");
        aoFechar();
        router.refresh();
      } else setErro({ geral: r.erro, campos: r.campos });
    });
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !pendente && aoFechar()}>
      <DialogContent>
        <form onSubmit={enviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{alvo.modo === "abrir" ? "Pausar a obra" : alvo.modo === "encerrar" ? "Encerrar a pausa" : "Ajustar a pausa"}</DialogTitle>
            <DialogDescription>
              {alvo.modo === "abrir" ? "Registre por que a obra parou. O motivo define se a pausa estende o prazo prometido." : pausa ? `${pausa.motivo}, desde ${formatarDataCalendario(pausa.inicio)}` : ""}
            </DialogDescription>
          </DialogHeader>

          {alvo.modo === "abrir" ? (
            <>
              <Campo id="motivo-pausa" rotulo="Motivo" erro={campos.motivoBloqueioId} obrigatorio>
                <Selecao id="motivo-pausa" value={motivoId} required onChange={(e) => setMotivoId(e.target.value)} {...ariaDoCampo("motivo-pausa", campos.motivoBloqueioId)}>
                  <option value="" disabled>
                    Escolha o motivo
                  </option>
                  {motivos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              {motivo ? <p className="text-muted-foreground text-sm">{motivo.justificado ? "Pausa justificada: estende o prazo prometido." : "Motivo imputável à Pontual: o prazo prometido não muda."}</p> : null}
              <Campo id="inicio-pausa" rotulo="Começou em" erro={campos.inicio} obrigatorio>
                <Input id="inicio-pausa" type="date" value={inicio} max={hoje} required onChange={(e) => setInicio(e.target.value)} {...ariaDoCampo("inicio-pausa", campos.inicio)} />
              </Campo>
            </>
          ) : null}

          {alvo.modo === "encerrar" ? (
            <Campo id="fim-pausa" rotulo="Terminou em" erro={campos.fim} obrigatorio>
              <Input id="fim-pausa" type="date" value={fim} min={pausa?.inicio} max={hoje} required onChange={(e) => setFim(e.target.value)} {...ariaDoCampo("fim-pausa", campos.fim)} />
            </Campo>
          ) : null}

          {alvo.modo === "ajustar" ? <CaixaMarcacao id="justificada" rotulo="Pausa justificada (estende o prazo prometido)" checked={justificada} onChange={(e) => setJustificada(e.target.checked)} /> : null}

          {alvo.modo !== "encerrar" ? (
            <Campo id="obs-pausa" rotulo="Observação (opcional)" erro={campos.observacao}>
              <AreaTexto id="obs-pausa" rows={3} maxLength={500} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </Campo>
          ) : null}

          {erro.geral && Object.keys(campos).length === 0 ? (
            <p role="alert" className="text-destructive text-sm">
              {erro.geral}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} {alvo.modo === "abrir" ? "Pausar obra" : alvo.modo === "encerrar" ? "Encerrar pausa" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
