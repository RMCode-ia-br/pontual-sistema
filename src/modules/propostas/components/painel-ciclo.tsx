"use client";

import { CheckCircle2, FileDown, GitCompare, Loader2, Mail, MessageCircle, Send, Undo2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { AreaTexto, Selecao } from "@/components/formulario";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { podeCriarRevisao, type StatusProposta } from "@/lib/dominio/ciclo-proposta";

import { aprovarPropostaAcao, cancelarProposta, criarRevisao, encerrarValidadePorReajuste, marcarComoEnviada, recusarProposta } from "../actions/ciclo";

type Props = {
  propostaId: string;
  numero: string;
  status: StatusProposta;
  revisaoAnteriorId: string | null;
  validadeEncerrada: boolean;
  opcoes: { id: string; nome: string; totalFormatado: string }[];
  condicaoSemParcelas: boolean;
  qtdParcelas: number;
  hoje: string;
  motivos: { id: string; nome: string }[];
  linkWhatsApp: string | null;
  linkEmail: string | null;
};

const FORMAS = [
  { v: "WHATSAPP", r: "WhatsApp" },
  { v: "EMAIL", r: "E-mail" },
  { v: "ASSINATURA", r: "Assinatura" },
  { v: "VERBAL", r: "Verbal" },
] as const;

export function PainelCiclo(p: Props) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [dialogo, setDialogo] = useState<"enviar" | "aprovar" | "recusar" | "cancelar" | "revisao" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [opcaoId, setOpcaoId] = useState(p.opcoes[0]?.id ?? "");
  const [forma, setForma] = useState<(typeof FORMAS)[number]["v"]>("WHATSAPP");
  const [aceitaEm, setAceitaEm] = useState(p.hoje);
  const [observacao, setObservacao] = useState("");
  const [motivoId, setMotivoId] = useState("");
  const [detalhe, setDetalhe] = useState("");

  const rascunho = p.status === "RASCUNHO";
  const enviada = p.status === "ENVIADA";
  const aprovavel = rascunho || enviada || p.status === "EXPIRADA";

  function fechar() {
    setDialogo(null);
    setErro(null);
  }

  function rodar(fn: () => Promise<{ ok: boolean; erro?: string; mensagem?: string; dados?: unknown }>, aoSucesso?: (dados: unknown) => void) {
    setErro(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível concluir.");
        return;
      }
      toast.success(r.mensagem ?? "Pronto.");
      fechar();
      aoSucesso?.(r.dados);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="sec-ciclo" className="grid gap-3 rounded-xl border p-4">
      <h2 id="sec-ciclo" className="font-medium">
        Enviar e decidir
      </h2>
      <div className="flex flex-wrap gap-2">
        <a href={`/api/propostas/${p.propostaId}/pdf`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
          <FileDown aria-hidden /> Ver / baixar PDF
        </a>
        <a href={`/api/propostas/${p.propostaId}/producao`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
          <FileDown aria-hidden /> Folha de produção (sem valores)
        </a>
        {p.linkWhatsApp ? (
          <a href={p.linkWhatsApp} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
            <MessageCircle aria-hidden /> WhatsApp
          </a>
        ) : null}
        {p.linkEmail ? (
          <a href={p.linkEmail} className={buttonVariants({ variant: "outline" })}>
            <Mail aria-hidden /> E-mail
          </a>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">No WhatsApp e no e-mail, baixe o PDF e anexe à mensagem. Depois de enviar, marque a proposta como enviada.</p>

      <div className="flex flex-wrap gap-2 border-t pt-3">
        {rascunho ? (
          <Button type="button" onClick={() => setDialogo("enviar")}>
            <Send aria-hidden /> Marcar como enviada
          </Button>
        ) : null}
        {aprovavel ? (
          <Button type="button" variant={rascunho ? "outline" : "default"} onClick={() => setDialogo("aprovar")}>
            <CheckCircle2 aria-hidden /> Aprovar
          </Button>
        ) : null}
        {enviada ? (
          <Button type="button" variant="outline" onClick={() => setDialogo("recusar")}>
            <XCircle aria-hidden /> Recusar
          </Button>
        ) : null}
        {podeCriarRevisao(p.status) ? (
          <Button type="button" variant="outline" onClick={() => setDialogo("revisao")}>
            <Undo2 aria-hidden /> Nova revisão
          </Button>
        ) : null}
        {rascunho || enviada ? (
          <Button type="button" variant="ghost" onClick={() => setDialogo("cancelar")}>
            Cancelar proposta
          </Button>
        ) : null}
        {p.revisaoAnteriorId ? (
          <Link href={`/propostas/${p.propostaId}/comparar?com=${p.revisaoAnteriorId}`} className={buttonVariants({ variant: "ghost" })}>
            <GitCompare aria-hidden /> Comparar com a revisão anterior
          </Link>
        ) : null}
        {enviada && !p.validadeEncerrada ? (
          <Button type="button" variant="ghost" onClick={() => rodar(() => encerrarValidadePorReajuste(p.propostaId))}>
            Encerrar validade por reajuste
          </Button>
        ) : null}
      </div>

      <ConfirmarAcao
        aberto={dialogo === "enviar"}
        aoFechar={fechar}
        titulo={`Marcar a proposta ${p.numero} como enviada?`}
        descricao="O conteúdo é congelado (uma foto do que o cliente recebeu), o projeto vai para “Proposta enviada” e é criada a tarefa de acompanhamento. Depois disso, qualquer mudança vira uma nova revisão."
        botao="Marcar como enviada"
        pendente={pendente}
        aoConfirmar={() => rodar(() => marcarComoEnviada(p.propostaId))}
      />
      <ConfirmarAcao aberto={dialogo === "revisao"} aoFechar={fechar} titulo="Criar uma nova revisão?" descricao="A revisão usa o mesmo número (Rev. 1, 2…) e começa como rascunho, copiada desta. A atual só sai de vigor quando a nova for enviada." botao="Criar revisão" pendente={pendente} aoConfirmar={() => rodar(() => criarRevisao(p.propostaId), (d) => d && router.push(`/propostas/${(d as { id: string }).id}`))} />
      <ConfirmarAcao aberto={dialogo === "cancelar"} aoFechar={fechar} titulo={`Cancelar a proposta ${p.numero}?`} descricao="Ela deixa de poder ser aprovada. O histórico fica guardado." botao="Cancelar proposta" pendente={pendente} aoConfirmar={() => rodar(() => cancelarProposta(p.propostaId))} />

      <Dialog open={dialogo === "aprovar"} onOpenChange={(a) => !a && fechar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar a proposta {p.numero}</DialogTitle>
            <DialogDescription>
              Registra o aceite, leva o projeto para “Aprovado”, {p.condicaoSemParcelas ? "não gera parcelas (condição a combinar)" : `gera as ${p.qtdParcelas} parcela(s) a receber`} e cria as tarefas “Agendar medição exata” (e a do condomínio, se for prédio).
              {rascunho ? " Como ainda é rascunho, o conteúdo é congelado agora." : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {p.opcoes.length > 1 ? (
              <label className="grid gap-1 text-sm">
                Opção aprovada
                <Selecao value={opcaoId} onChange={(e) => setOpcaoId(e.target.value)} aria-label="Opção aprovada">
                  {p.opcoes.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nome} — {o.totalFormatado}
                    </option>
                  ))}
                </Selecao>
              </label>
            ) : (
              <p className="text-sm">
                Valor aprovado: <strong>{p.opcoes[0]?.totalFormatado}</strong>
              </p>
            )}
            <label className="grid gap-1 text-sm">
              Como o cliente aceitou
              <Selecao value={forma} onChange={(e) => setForma(e.target.value as typeof forma)} aria-label="Forma do aceite">
                {FORMAS.map((f) => (
                  <option key={f.v} value={f.v}>
                    {f.r}
                  </option>
                ))}
              </Selecao>
            </label>
            <label className="grid gap-1 text-sm">
              Data do aceite
              <Input type="date" value={aceitaEm} onChange={(e) => setAceitaEm(e.target.value)} aria-label="Data do aceite" />
            </label>
            <label className="grid gap-1 text-sm">
              Observação (opcional)
              <AreaTexto value={observacao} rows={2} maxLength={1000} onChange={(e) => setObservacao(e.target.value)} aria-label="Observação do aceite" />
            </label>
            <p className="text-muted-foreground text-xs">Outras propostas do mesmo projeto não são recusadas sozinhas (podem ser “partes” diferentes).</p>
            {erro ? <p role="alert" className="text-destructive text-sm">{erro}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pendente}
              onClick={() =>
                rodar(
                  () => aprovarPropostaAcao({ propostaId: p.propostaId, opcaoId, forma, aceitaEm, observacao }),
                  (d) => {
                    const r = d as { outrasEmAberto: number } | undefined;
                    if (r && r.outrasEmAberto > 0) toast.info(`O projeto tem mais ${r.outrasEmAberto} proposta(s) em aberto. Recuse ou cancele as que não valem mais.`);
                  },
                )
              }
            >
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Aprovar proposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogo === "recusar"} onOpenChange={(a) => !a && fechar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar a proposta {p.numero}</DialogTitle>
            <DialogDescription>O motivo alimenta o relatório de perdas. O projeto não é marcado como perdido sozinho.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              Motivo
              <Selecao value={motivoId} onChange={(e) => setMotivoId(e.target.value)} aria-label="Motivo da recusa">
                <option value="">Escolha o motivo…</option>
                {p.motivos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </Selecao>
            </label>
            <label className="grid gap-1 text-sm">
              Detalhe (opcional)
              <Input value={detalhe} maxLength={500} onChange={(e) => setDetalhe(e.target.value)} aria-label="Detalhe da recusa" />
            </label>
            {erro ? <p role="alert" className="text-destructive text-sm">{erro}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" disabled={pendente || !motivoId} onClick={() => rodar(() => recusarProposta({ propostaId: p.propostaId, motivoPerdaId: motivoId, detalhe }))}>
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Recusar proposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {erro && dialogo === null ? <p role="alert" className="text-destructive text-sm">{erro}</p> : null}
    </section>
  );
}
