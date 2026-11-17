"use client";

import { AlertTriangle, ArrowLeftRight, Loader2, RotateCcw, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { AreaTexto, Selecao } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { StatusProposta } from "@/lib/dominio/ciclo-proposta";
import { formatarMoeda } from "@/lib/formatadores";

import { desfazerAprovacaoAcao, previaDesfazerAcao, previaTrocaAcao, reabrirRevisaoAcao, trocarAprovacaoAcao } from "../actions/aprovacao";
import type { PreviaDaTroca, PreviaDoDesfazer } from "../previa-desfazer";

type Irma = { id: string; revisao: number; status: StatusProposta; temSnapshot: boolean };

type Props = {
  propostaId: string;
  numero: string;
  revisao: number;
  status: StatusProposta;
  /** Esta revisão já foi enviada ao cliente (tem o conteúdo congelado)? Decide o texto de "reabrir". */
  temSnapshot: boolean;
  /** As outras revisões do mesmo número. */
  irmas: Irma[];
};

const FORMAS = [
  { v: "WHATSAPP", r: "WhatsApp" },
  { v: "EMAIL", r: "E-mail" },
  { v: "ASSINATURA", r: "Assinatura" },
  { v: "VERBAL", r: "Verbal" },
] as const;
type Forma = (typeof FORMAS)[number]["v"];

const rotulo = (r: number) => (r === 0 ? "original" : `Rev. ${r}`);
/** "aaaa-mm-dd" → "dd/mm/aaaa" (data de calendário: nunca passa por fuso). */
const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const ROTULO_FASE: Record<string, string> = { PROPOSTA_ENVIADA: "Proposta enviada", ELABORANDO_PROPOSTA: "Elaborando proposta", APROVADO: "Aprovado" };

function Bloqueios({ itens }: { itens: { texto: string }[] }) {
  if (itens.length === 0) return null;
  return (
    <div role="alert" className="border-destructive/40 bg-destructive/10 rounded-lg border p-3 text-sm">
      <p className="font-medium">Antes de continuar, resolva:</p>
      <ul className="mt-1 list-disc pl-5">
        {itens.map((b) => (
          <li key={b.texto}>{b.texto}</li>
        ))}
      </ul>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function Quadro({ titulo, linhas }: { titulo: string; linhas: { ordem: number; valorCentavos: number; vencimento: string | null }[] }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{titulo}</p>
      {linhas.length === 0 ? (
        <p>sem parcelas</p>
      ) : (
        <ul>
          {linhas.map((l) => (
            <li key={l.ordem} className="tabular-nums">
              {l.ordem}. {formatarMoeda(l.valorCentavos)}
              {l.vencimento ? ` · vence ${br(l.vencimento)}` : " · aguarda a etapa"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AcoesDeAprovacao(p: Props) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [carregando, carregar] = useTransition();
  // Cada pedido de prévia ganha um número: a resposta de um pedido antigo (o usuário já mudou a revisão ou a opção) é descartada.
  const pedido = useRef(0);
  const [dialogo, setDialogo] = useState<"desfazer" | "trocar" | "reabrir" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  // desfazer
  const [previaD, setPreviaD] = useState<PreviaDoDesfazer | null>(null);
  const [reabrirId, setReabrirId] = useState("");

  // trocar
  const [previaT, setPreviaT] = useState<PreviaDaTroca | null>(null);
  const [paraId, setParaId] = useState("");
  const [opcaoId, setOpcaoId] = useState("");
  const [aceitaEm, setAceitaEm] = useState("");
  const [forma, setForma] = useState<Forma>("WHATSAPP");
  const [observacao, setObservacao] = useState("");

  const aprovada = p.status === "APROVADA";
  const substituidas = p.irmas.filter((i) => i.status === "SUBSTITUIDA").sort((a, b) => b.revisao - a.revisao);
  const irmaAprovada = p.irmas.find((i) => i.status === "APROVADA");

  function fechar() {
    pedido.current += 1; // uma prévia que ainda esteja chegando não deve aparecer depois de fechar
    setDialogo(null);
    setErro(null);
  }

  function rodar(fn: () => Promise<{ ok: boolean; erro?: string; mensagem?: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível concluir.");
        return;
      }
      toast.success(r.mensagem ?? "Pronto.");
      fechar();
      router.refresh();
    });
  }

  function abrirDesfazer() {
    setDialogo("desfazer");
    setErro(null);
    setPreviaD(null);
    setMotivo("");
    const meu = ++pedido.current;
    carregar(async () => {
      const r = await previaDesfazerAcao(p.propostaId);
      if (meu !== pedido.current) return;
      if (!r.ok || !r.dados) return setErro(r.ok ? "Não foi possível carregar." : r.erro);
      setPreviaD(r.dados);
      setReabrirId(r.dados.padraoReabrirId ?? "");
    });
  }

  function carregarTroca(alvo: string, opcao: string | undefined, preencher: boolean) {
    const meu = ++pedido.current;
    carregar(async () => {
      const r = await previaTrocaAcao({ deId: p.propostaId, paraId: alvo, opcaoId: opcao });
      if (meu !== pedido.current) return;
      if (!r.ok || !r.dados) {
        // Falhou: não deixa a prévia da revisão ou opção anterior na tela com botão de confirmar.
        setPreviaT(null);
        return setErro(r.ok ? "Não foi possível carregar." : r.erro);
      }
      setErro(null);
      setPreviaT(r.dados);
      setOpcaoId(r.dados.opcaoPadraoId ?? "");
      if (preencher) {
        setAceitaEm(r.dados.aceite.aceitaEm);
        setForma((FORMAS.find((f) => f.v === r.dados!.aceite.forma)?.v ?? "WHATSAPP") as Forma);
        setObservacao(r.dados.aceite.observacao ?? "");
      }
    });
  }

  function abrirTroca(alvo: string) {
    setDialogo("trocar");
    setErro(null);
    setPreviaT(null);
    setMotivo("");
    setParaId(alvo);
    carregarTroca(alvo, undefined, true);
  }

  const motivoOk = motivo.trim().length >= 3;

  return (
    <section aria-labelledby="sec-aprovacao" className="mt-4 grid gap-3 rounded-xl border p-4">
      <h2 id="sec-aprovacao" className="font-medium">
        Aprovação
      </h2>

      {aprovada ? (
        <>
          <p className="text-muted-foreground text-sm">Aprovou por engano, ou o cliente fechou outra revisão? Dá para desfazer ou trocar aqui mesmo: tudo fica registrado na linha do tempo.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={abrirDesfazer}>
              <Undo2 aria-hidden /> Desfazer aprovação
            </Button>
            {substituidas.length > 0 ? (
              <Button type="button" variant="outline" onClick={() => abrirTroca(substituidas[0].id)}>
                <ArrowLeftRight aria-hidden /> Trocar pela {rotulo(substituidas[0].revisao)}
              </Button>
            ) : null}
          </div>
        </>
      ) : irmaAprovada ? (
        <p className="text-sm">
          A <Link href={`/propostas/${irmaAprovada.id}`} className="text-primary underline">{rotulo(irmaAprovada.revisao)}</Link> deste número está aprovada e esta revisão ficou de lado. Para aprovar esta no lugar, abra a {rotulo(irmaAprovada.revisao)} e use “Trocar pela {rotulo(p.revisao)}”.
        </p>
      ) : (
        <>
          <p className="text-sm">Esta revisão foi substituída. Se ela voltou a ser a certa, reabra-a.</p>
          <div>
            <Button type="button" variant="outline" onClick={() => setDialogo("reabrir")}>
              <RotateCcw aria-hidden /> Reabrir esta revisão
            </Button>
          </div>
        </>
      )}

      <ConfirmarAcao
        aberto={dialogo === "reabrir"}
        aoFechar={fechar}
        titulo={`Reabrir a ${rotulo(p.revisao)} da proposta ${p.numero}?`}
        descricao={
          p.temSnapshot
            ? "Ela já foi enviada ao cliente: volta como “enviada” e a revisão que vale hoje sai de vigor."
            : "Ela volta como rascunho, para você editar e enviar. A proposta que vale hoje continua valendo até a nova ser enviada."
        }
        botao="Reabrir revisão"
        pendente={pendente}
        aoConfirmar={() => rodar(() => reabrirRevisaoAcao(p.propostaId))}
      />

      <Dialog open={dialogo === "desfazer"} onOpenChange={(a) => !a && fechar()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Desfazer a aprovação da proposta {p.numero}</DialogTitle>
            <DialogDescription>A proposta deixa de estar aprovada e volta a “enviada” (ou fica de lado, se você reabrir uma revisão que já tinha sido enviada). Nada é apagado de verdade: o que foi gerado fica como histórico.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {carregando && !previaD ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Conferindo o que já aconteceu…
              </p>
            ) : null}
            {previaD ? (
              <>
                <Bloqueios itens={previaD.bloqueios} />
                <ul className="list-disc pl-5 text-sm">
                  <li>
                    Valor aprovado: <strong>{previaD.aceite.valorCentavos !== null ? formatarMoeda(previaD.aceite.valorCentavos) : "—"}</strong> (aceite em {br(previaD.aceite.aceitaEm)}).
                  </li>
                  <li>{previaD.efeitos.parcelas} parcela(s) a receber serão canceladas.</li>
                  <li>
                    {previaD.efeitos.etapasMantidasPorOutraParte
                      ? "As etapas da obra continuam (há outra parte aprovada)."
                      : `${previaD.efeitos.etapasRemovidas} etapa(s) da obra serão removidas.`}
                  </li>
                  <li>{previaD.efeitos.tarefas} tarefa(s) “Agendar medição exata” / condomínio serão canceladas.</li>
                  <li>
                    Valor fechado do projeto: {previaD.efeitos.valorFechadoDepoisCentavos === null ? "fica sem valor fechado" : `passa a ${formatarMoeda(previaD.efeitos.valorFechadoDepoisCentavos)}`}; fase: {ROTULO_FASE[previaD.efeitos.faseDepois] ?? previaD.efeitos.faseDepois}.
                  </li>
                </ul>
                {previaD.avisoDeMes ? <Aviso>{previaD.avisoDeMes}</Aviso> : null}
                <fieldset className="grid gap-1 text-sm">
                  <legend className="mb-1">Qual revisão passa a valer?</legend>
                  {previaD.revisoes.map((r) => (
                    <label key={r.id} className="flex items-start gap-2">
                      <input type="radio" name="reabrir" value={r.id} checked={reabrirId === r.id} onChange={() => setReabrirId(r.id)} className="mt-1" />
                      <span>
                        A {r.rotulo} — volta como {r.voltaComo === "RASCUNHO" ? "rascunho (você edita e envia depois)" : "enviada, e esta proposta passa a substituída"}
                        {r.id === previaD.padraoReabrirId ? " · mais recente" : ""}
                      </span>
                    </label>
                  ))}
                  <label className="flex items-start gap-2">
                    <input type="radio" name="reabrir" value="" checked={reabrirId === ""} onChange={() => setReabrirId("")} className="mt-1" />
                    <span>Nenhuma: só esta proposta volta a “enviada”</span>
                  </label>
                </fieldset>
              </>
            ) : null}
            <label className="grid gap-1 text-sm">
              Motivo (obrigatório)
              <AreaTexto value={motivo} rows={2} maxLength={500} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo de desfazer a aprovação" placeholder="Ex.: aprovei a original, mas o cliente fechou a revisão" />
            </label>
            {erro ? (
              <p role="alert" className="text-destructive text-sm">
                {erro}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pendente || carregando || !previaD || previaD.bloqueios.length > 0 || !motivoOk}
              onClick={() => rodar(() => desfazerAprovacaoAcao({ propostaId: p.propostaId, motivo, reabrirId }))}
            >
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Desfazer aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogo === "trocar"} onOpenChange={(a) => !a && fechar()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Trocar a aprovação da proposta {p.numero}</DialogTitle>
            <DialogDescription>Desfaz a aprovação desta e aprova a revisão escolhida, tudo de uma vez: se algo impedir, nada muda.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {substituidas.length > 1 ? (
              <label className="grid gap-1 text-sm">
                Aprovar no lugar desta
                <Selecao
                  value={paraId}
                  aria-label="Aprovar no lugar desta"
                  onChange={(e) => {
                    setParaId(e.target.value);
                    carregarTroca(e.target.value, undefined, false);
                  }}
                >
                  {substituidas.map((s) => (
                    <option key={s.id} value={s.id}>
                      {rotulo(s.revisao)}
                    </option>
                  ))}
                </Selecao>
              </label>
            ) : null}
            {carregando && !previaT ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Calculando o que muda…
              </p>
            ) : null}
            {previaT ? (
              <>
                {previaT.erro ? <Bloqueios itens={[{ texto: previaT.erro }]} /> : null}
                <Bloqueios itens={previaT.bloqueios} />
                {previaT.problemasDaRevisao.length > 0 ? <Bloqueios itens={previaT.problemasDaRevisao.map((t) => ({ texto: `A ${previaT.paraRotulo} ainda não está pronta para ser aprovada: ${t}` }))} /> : null}
                {previaT.opcoes.length > 1 ? (
                  <label className="grid gap-1 text-sm">
                    Opção aprovada
                    <Selecao
                      value={opcaoId}
                      aria-label="Opção aprovada"
                      onChange={(e) => {
                        setOpcaoId(e.target.value);
                        carregarTroca(paraId, e.target.value, false);
                      }}
                    >
                      {previaT.opcoes.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nome} — {formatarMoeda(o.totalCentavos)}
                        </option>
                      ))}
                    </Selecao>
                  </label>
                ) : null}
                <div className="rounded-lg border p-3 text-sm">
                  <p className="mb-2 font-medium">
                    O que muda: {previaT.deRotulo} → {previaT.paraRotulo}
                  </p>
                  <p>
                    Valor fechado do projeto: {previaT.valorFechado.antesCentavos === null ? "—" : formatarMoeda(previaT.valorFechado.antesCentavos)} → <strong>{previaT.valorFechado.depoisCentavos === null ? "—" : formatarMoeda(previaT.valorFechado.depoisCentavos)}</strong>
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Quadro titulo="Parcelas hoje (serão canceladas)" linhas={previaT.parcelas.antes} />
                    <Quadro titulo="Parcelas novas" linhas={previaT.parcelas.depois} />
                  </div>
                  <p className="mt-2">
                    {previaT.etapas.mantidasPorOutraParte
                      ? "As etapas da obra continuam como estão (há outra parte aprovada)."
                      : `${previaT.etapas.removidas} etapa(s) da obra saem e são geradas de novo. Prazo: ${previaT.etapas.prazoAntes} → ${previaT.etapas.prazoDepois}.`}
                  </p>
                  <p>As tarefas “Agendar medição exata” ({previaT.tarefas.canceladas}) são canceladas e criadas de novo para a {previaT.paraRotulo}.</p>
                </div>
                {previaT.avisoDeMes ? <Aviso>{previaT.avisoDeMes}</Aviso> : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Data do aceite
                    <Input type="date" value={aceitaEm} onChange={(e) => setAceitaEm(e.target.value)} aria-label="Data do aceite" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Como o cliente aceitou
                    <Selecao value={forma} onChange={(e) => setForma(e.target.value as Forma)} aria-label="Forma do aceite">
                      {FORMAS.map((f) => (
                        <option key={f.v} value={f.v}>
                          {f.r}
                        </option>
                      ))}
                    </Selecao>
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  Observação do aceite (opcional)
                  <AreaTexto value={observacao} rows={2} maxLength={1000} onChange={(e) => setObservacao(e.target.value)} aria-label="Observação do aceite" />
                </label>
              </>
            ) : null}
            <label className="grid gap-1 text-sm">
              Motivo da troca (obrigatório)
              <AreaTexto value={motivo} rows={2} maxLength={500} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo da troca" placeholder="Ex.: aprovei a original, mas o cliente fechou a revisão" />
            </label>
            {erro ? (
              <p role="alert" className="text-destructive text-sm">
                {erro}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pendente || carregando || !previaT || !!previaT.erro || previaT.bloqueios.length > 0 || previaT.problemasDaRevisao.length > 0 || !motivoOk || !opcaoId || !aceitaEm}
              onClick={() => rodar(() => trocarAprovacaoAcao({ deId: p.propostaId, paraId, opcaoId, forma, aceitaEm, observacao, motivo }))}
            >
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Trocar aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
