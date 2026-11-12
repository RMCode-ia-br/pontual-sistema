"use client";

import { Ban, Banknote, CalendarClock, Copy, Loader2, MessageCircle, PencilLine, RotateCcw, Unlock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { AreaTexto, CaixaMarcacao, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ResultadoAcao } from "@/lib/acoes";
import { FORMAS_PAGAMENTO, ROTULO_FORMA } from "@/lib/dominio/parcelas";
import { formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { mascararMoeda } from "@/lib/formatadores/mascaras";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";

import { ajustarContaReceber, cancelarContaReceber, liberarParcela, prorrogarContaReceber, reabrirContaReceber, receber } from "../actions/receber";

import { CampoDinheiro } from "./dialogos-financeiros";

type Opcoes = {
  contas: { id: string; nome: string }[];
  categoriasDeReceita: { id: string; nome: string }[];
};

export type ResumoParaAcoes = {
  id: string;
  status: "AGUARDANDO_GATILHO" | "ABERTA" | "PARCIAL" | "PAGA" | "CANCELADA";
  descricao: string;
  valorCentavos: number;
  valorPagoCentavos: number;
  saldoCentavos: number;
  vencimento: string | null;
  dataPrometida: string | null;
  forma: string | null;
  comNotaFiscal: boolean;
  categoriaFinanceiraId: string | null;
};

type Cobranca = { texto: string | null; link: string | null; faltando: string[] };

type Dialogo = "receber" | "prorrogar" | "ajustar" | "liberar" | "cancelar" | "reabrir" | null;

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

function DialogoRecebimento({ conta, opcoes, hoje, aoFechar }: { conta: ResumoParaAcoes; opcoes: Opcoes; hoje: string; aoFechar: () => void }) {
  const { estado, pendente, aoEnviar, erros } = useDialogo((fd) => receber(null, fd), aoFechar);
  const [valor, setValor] = useState(mascararMoeda(String(conta.saldoCentavos)));
  const [chave, setChave] = useState(0);

  return (
    <Dialog open onOpenChange={(a) => !a && !pendente && aoFechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Registrar recebimento</DialogTitle>
            <DialogDescription>
              {conta.descricao}. Saldo a receber: <strong>{formatarMoeda(conta.saldoCentavos)}</strong>. Pode ser parcial; não pode passar do saldo.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="contaReceberId" value={conta.id} />
          {opcoes.contas.length === 0 ? (
            <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Não há conta financeira ativa. <Link href="/financeiro/contas" className="underline">Cadastre uma conta</Link> para registrar onde o dinheiro entrou.
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="rec-data" rotulo="Data do recebimento" erro={erros.data} obrigatorio>
              <Input id="rec-data" name="data" type="date" required defaultValue={hoje} max={hoje} {...ariaDoCampo("rec-data", erros.data)} />
            </Campo>
            <Campo id="rec-valor" rotulo="Valor recebido" erro={erros.valor} obrigatorio>
              <CampoDinheiro key={chave} id="rec-valor" nome="valor" erro={erros.valor} defaultValue={valor} />
            </Campo>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setValor(mascararMoeda(String(conta.saldoCentavos)));
                setChave((c) => c + 1);
              }}
            >
              Receber o saldo todo ({formatarMoeda(conta.saldoCentavos)})
            </Button>
          </div>
          <Campo id="rec-conta" rotulo="Conta onde entrou" erro={erros.contaFinanceiraId} obrigatorio>
            <Selecao id="rec-conta" name="contaFinanceiraId" required defaultValue={opcoes.contas.length === 1 ? opcoes.contas[0].id : ""} {...ariaDoCampo("rec-conta", erros.contaFinanceiraId)}>
              <option value="">Escolha a conta...</option>
              {opcoes.contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="rec-categoria" rotulo="Categoria da receita" erro={erros.categoriaId} obrigatorio>
              <Selecao id="rec-categoria" name="categoriaId" required defaultValue={conta.categoriaFinanceiraId ?? ""} {...ariaDoCampo("rec-categoria", erros.categoriaId)}>
                <option value="">Escolha a categoria...</option>
                {opcoes.categoriasDeReceita.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo id="rec-forma" rotulo="Forma" erro={erros.forma}>
              <Selecao id="rec-forma" name="forma" defaultValue={conta.forma ?? ""}>
                <option value="">—</option>
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f} value={f}>
                    {ROTULO_FORMA[f]}
                  </option>
                ))}
              </Selecao>
            </Campo>
          </div>
          <CaixaMarcacao id="rec-nota" name="comNotaFiscal" rotulo="Recebimento com nota fiscal (só a marca)" defaultChecked={conta.comNotaFiscal} />
          <p className="text-muted-foreground -mt-2 text-xs">Mudar essa marca não recalcula o valor: se a venda passou a ser com nota, ajuste o valor da conta (o acréscimo de 5% é separado).</p>
          <Campo id="rec-obs" rotulo="Observação (opcional)" erro={erros.observacao}>
            <AreaTexto id="rec-obs" name="observacao" rows={2} maxLength={500} />
          </Campo>
          <ErroGeral estado={estado} />
          <Rodape pendente={pendente} aoFechar={aoFechar} rotulo="Registrar recebimento" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoProrrogar({ conta, hoje, aoFechar }: { conta: ResumoParaAcoes; hoje: string; aoFechar: () => void }) {
  const { estado, pendente, aoEnviar, erros } = useDialogo((fd) => prorrogarContaReceber(null, fd), aoFechar);
  // Só vale depois do vencimento original e de hoje em diante.
  const minimo = conta.vencimento && conta.vencimento >= hoje ? conta.vencimento : hoje;
  return (
    <Dialog open onOpenChange={(a) => !a && !pendente && aoFechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Cliente pediu mais prazo</DialogTitle>
            <DialogDescription>
              Registre até que dia o cliente prometeu pagar. O <strong>vencimento original{conta.vencimento ? ` (${formatarDataCalendario(conta.vencimento)})` : ""} não muda</strong>: ele continua valendo para o atraso e a inadimplência. A data prometida só ajusta quando o dinheiro entra no fluxo de caixa projetado.
              {conta.dataPrometida ? ` Promessa atual: ${formatarDataCalendario(conta.dataPrometida)}.` : ""}
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="contaReceberId" value={conta.id} />
          <Campo id="pro-data" rotulo="Cliente prometeu pagar até" erro={erros.dataPrometida} obrigatorio>
            <Input id="pro-data" name="dataPrometida" type="date" required min={minimo} defaultValue={conta.dataPrometida && conta.dataPrometida >= hoje ? conta.dataPrometida : ""} {...ariaDoCampo("pro-data", erros.dataPrometida)} />
          </Campo>
          <Campo id="pro-obs" rotulo="Observação (opcional)" erro={erros.observacao}>
            <AreaTexto id="pro-obs" name="observacao" rows={2} maxLength={300} placeholder="Ex.: disse que recebe do cliente dele na sexta." />
          </Campo>
          <ErroGeral estado={estado} />
          <Rodape pendente={pendente} aoFechar={aoFechar} rotulo="Registrar prazo" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoAjuste({ conta, aoFechar }: { conta: ResumoParaAcoes; aoFechar: () => void }) {
  const { estado, pendente, aoEnviar, erros } = useDialogo((fd) => ajustarContaReceber(null, fd), aoFechar);
  const podeVencimento = conta.status === "ABERTA" || conta.status === "PARCIAL";
  return (
    <Dialog open onOpenChange={(a) => !a && !pendente && aoFechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Corrigir valor ou vencimento</DialogTitle>
            <DialogDescription>
              Valor atual {formatarMoeda(conta.valorCentavos)}
              {conta.valorPagoCentavos > 0 ? `, já recebido ${formatarMoeda(conta.valorPagoCentavos)} (o novo valor não pode ser menor)` : ""}. Deixe em branco o que não quer mudar. O ajuste fica na auditoria com o motivo. Se o cliente pediu mais prazo, use “Cliente pediu mais prazo”: ela não apaga o atraso.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="contaReceberId" value={conta.id} />
          <Campo id="aj-valor" rotulo="Novo valor (opcional)" erro={erros.valor} dica="Use para desconto ou correção.">
            <CampoDinheiro id="aj-valor" nome="valor" erro={erros.valor} obrigatorio={false} />
          </Campo>
          {podeVencimento ? (
            <Campo id="aj-venc" rotulo="Novo vencimento (opcional)" erro={erros.vencimento}>
              <Input id="aj-venc" name="vencimento" type="date" defaultValue="" {...ariaDoCampo("aj-venc", erros.vencimento)} />
            </Campo>
          ) : null}
          <Campo id="aj-motivo" rotulo="Motivo" erro={erros.motivo} obrigatorio>
            <AreaTexto id="aj-motivo" name="motivo" rows={2} maxLength={300} required {...ariaDoCampo("aj-motivo", erros.motivo)} />
          </Campo>
          <ErroGeral estado={estado} />
          <Rodape pendente={pendente} aoFechar={aoFechar} rotulo="Corrigir" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoLiberar({ conta, hoje, aoFechar }: { conta: ResumoParaAcoes; hoje: string; aoFechar: () => void }) {
  const { estado, pendente, aoEnviar, erros } = useDialogo((fd) => liberarParcela(null, fd), aoFechar);
  return (
    <Dialog open onOpenChange={(a) => !a && !pendente && aoFechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Liberar a parcela agora</DialogTitle>
            <DialogDescription>
              Esta parcela aguarda a conclusão de uma etapa da obra. Libere-a só se o cliente vai pagar antes disso (ela vira “em aberto” e ganha a tarefa de cobrança).
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="contaReceberId" value={conta.id} />
          <Campo id="lib-venc" rotulo="Vencimento" erro={erros.vencimento} obrigatorio>
            <Input id="lib-venc" name="vencimento" type="date" required defaultValue={hoje} {...ariaDoCampo("lib-venc", erros.vencimento)} />
          </Campo>
          <ErroGeral estado={estado} />
          <Rodape pendente={pendente} aoFechar={aoFechar} rotulo="Liberar" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoCancelar({ conta, aoFechar }: { conta: ResumoParaAcoes; aoFechar: () => void }) {
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
              const r = await cancelarContaReceber({ contaReceberId: conta.id, motivo });
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
            <DialogDescription>
              {conta.descricao}. Nada é apagado: a conta fica cancelada, com o motivo, e a tarefa de cobrança também. Só se cancela conta sem recebimento (com recebimento, estorne antes).
            </DialogDescription>
          </DialogHeader>
          <Campo id="can-motivo" rotulo="Motivo" erro={campos.motivo} obrigatorio>
            <AreaTexto id="can-motivo" rows={2} maxLength={300} required value={motivo} onChange={(e) => setMotivo(e.target.value)} {...ariaDoCampo("can-motivo", campos.motivo)} />
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

/** Botões da página da conta a receber: receber, cobrar por WhatsApp, ajustar, liberar, cancelar e reabrir. */
export function AcoesDeReceber({ conta, opcoes, hoje, cobranca }: { conta: ResumoParaAcoes; opcoes: Opcoes; hoje: string; cobranca: Cobranca }) {
  const router = useRouter();
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [pendente, iniciar] = useTransition();
  const aberta = conta.status === "ABERTA" || conta.status === "PARCIAL";
  const fechar = () => setDialogo(null);

  function reabrir() {
    iniciar(async () => {
      const r = await reabrirContaReceber({ contaReceberId: conta.id });
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
          <Button type="button" onClick={() => setDialogo("receber")}>
            <Banknote aria-hidden /> Registrar recebimento
          </Button>
        ) : null}
        {aberta ? (
          <Button type="button" variant="outline" onClick={() => setDialogo("prorrogar")}>
            <CalendarClock aria-hidden /> Cliente pediu mais prazo
          </Button>
        ) : null}
        {aberta ? (
          cobranca.link ? (
            <a href={cobranca.link} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
              <MessageCircle aria-hidden /> Cobrar no WhatsApp
            </a>
          ) : (
            <Button type="button" variant="outline" disabled title={cobranca.faltando.length ? `Falta: ${cobranca.faltando.join(", ")}` : undefined}>
              <MessageCircle aria-hidden /> Cobrar no WhatsApp
            </Button>
          )
        ) : null}
        {conta.status === "AGUARDANDO_GATILHO" ? (
          <Button type="button" variant="outline" onClick={() => setDialogo("liberar")}>
            <Unlock aria-hidden /> Liberar antes da etapa
          </Button>
        ) : null}
        {conta.status !== "CANCELADA" && conta.status !== "PAGA" ? (
          <Button type="button" variant="outline" onClick={() => setDialogo("ajustar")}>
            <PencilLine aria-hidden /> {aberta ? "Corrigir valor ou vencimento" : "Ajustar valor"}
          </Button>
        ) : null}
        {conta.status === "PAGA" ? (
          <Button type="button" variant="outline" onClick={() => setDialogo("ajustar")}>
            <PencilLine aria-hidden /> Ajustar valor
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

      {aberta && cobranca.texto ? (
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer">Ver a mensagem de cobrança</summary>
          <div className="mt-2 grid gap-2 rounded-lg border p-3">
            <p className="whitespace-pre-line">{cobranca.texto}</p>
            {cobranca.faltando.length > 0 ? (
              <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
                Para gerar o link do WhatsApp falta: {cobranca.faltando.join(", ")}.
              </p>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => {
                void navigator.clipboard?.writeText(cobranca.texto ?? "").then(
                  () => toast.success("Mensagem copiada."),
                  () => toast.error("Não foi possível copiar."),
                );
              }}
            >
              <Copy aria-hidden /> Copiar mensagem
            </Button>
          </div>
        </details>
      ) : null}

      {dialogo === "receber" ? <DialogoRecebimento conta={conta} opcoes={opcoes} hoje={hoje} aoFechar={fechar} /> : null}
      {dialogo === "prorrogar" ? <DialogoProrrogar conta={conta} hoje={hoje} aoFechar={fechar} /> : null}
      {dialogo === "ajustar" ? <DialogoAjuste conta={conta} aoFechar={fechar} /> : null}
      {dialogo === "liberar" ? <DialogoLiberar conta={conta} hoje={hoje} aoFechar={fechar} /> : null}
      {dialogo === "cancelar" ? <DialogoCancelar conta={conta} aoFechar={fechar} /> : null}
      <ConfirmarAcao aberto={dialogo === "reabrir"} aoFechar={fechar} titulo="Reabrir a conta?" descricao="Ela volta a ficar em aberto (ou aguardando a etapa, se não tem vencimento) e a tarefa de cobrança reabre." botao="Reabrir" pendente={pendente} aoConfirmar={reabrir} />
    </>
  );
}
