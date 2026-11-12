"use client";

import { CalendarPlus, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { AreaTexto, CaixaMarcacao, Campo, Selecao } from "@/components/formulario";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROTULO_STATUS_CHAMADO, STATUS_DE_CHAMADO, STATUS_EM_ABERTO, transicaoDeChamadoPermitida, type StatusDoChamado } from "@/lib/dominio/chamados";
import { ROTULO_CLASSIFICACAO, type Classificacao } from "@/lib/dominio/garantia";
import { formatarMoeda } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

import { ajustarChamadoAcao, gerarCobranca, mudarSituacaoDoChamado } from "../actions/chamados";

type Props = {
  id: string;
  status: StatusDoChamado;
  classificacao: Classificacao;
  classificacaoSugerida: Classificacao;
  cobrarVisita: boolean;
  valorCobradoCentavos: number | null;
  temObra: boolean;
  /** A cobrança já virou conta a receber: valor e cobrança ficam travados. */
  cobrancaGerada: boolean;
  solucao: string | null;
  /** Hoje (aaaa-mm-dd), sugestão de vencimento da cobrança. */
  hoje: string;
};

const centavosParaTexto = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));

/** Andamento, classificação, cobrança da visita e agendamento de um chamado. */
export function PainelDoChamado({ id, status, classificacao, classificacaoSugerida, cobrarVisita, valorCobradoCentavos, temObra, cobrancaGerada, solucao, hoje }: Props) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [resolvendo, setResolvendo] = useState(false);
  const [textoSolucao, setTextoSolucao] = useState(solucao ?? "");
  const [classe, setClasse] = useState<Classificacao>(classificacao);
  const [cobrar, setCobrar] = useState(cobrarVisita);
  const [valor, setValor] = useState(centavosParaTexto(valorCobradoCentavos));
  const [vencimento, setVencimento] = useState(hoje);

  const emAberto = (STATUS_EM_ABERTO as readonly string[]).includes(status);
  const destinos = STATUS_DE_CHAMADO.filter((s) => s !== "RESOLVIDO" && s !== status && transicaoDeChamadoPermitida(status, s));
  const podeResolver = transicaoDeChamadoPermitida(status, "RESOLVIDO");

  function executar(acao: () => Promise<{ ok: boolean; mensagem?: string; erro?: string; campos?: Record<string, string> }>, depois?: () => void) {
    setErro(null);
    setErros({});
    iniciar(async () => {
      const r = await acao();
      if (r.ok) {
        toast.success(r.mensagem ?? "Feito.");
        depois?.();
        router.refresh();
      } else {
        setErro(r.erro ?? "Não foi possível concluir.");
        setErros(r.campos ?? {});
      }
    });
  }

  const mudar = (para: StatusDoChamado) => executar(() => mudarSituacaoDoChamado({ id, para }));
  const resolver = () => executar(() => mudarSituacaoDoChamado({ id, para: "RESOLVIDO", solucao: textoSolucao }), () => setResolvendo(false));
  const salvarAjuste = () => executar(() => ajustarChamadoAcao({ id, classificacao: classe, ...(cobrancaGerada ? {} : { cobrarVisita: cobrar, valorCobrado: cobrar ? valor : "" }) }));
  const gerar = () => executar(() => gerarCobranca({ id, vencimento }));

  const ajusteMudou = classe !== classificacao || (!cobrancaGerada && (cobrar !== cobrarVisita || (cobrar && valor.trim() !== centavosParaTexto(valorCobradoCentavos))));

  return (
    <div className="grid gap-5">
      <section aria-labelledby="sec-andamento" className="grid gap-3 rounded-xl border p-4">
        <h2 id="sec-andamento" className="font-medium">
          Andamento
        </h2>
        <p className="text-sm">
          Situação atual: <strong>{ROTULO_STATUS_CHAMADO[status]}</strong>
        </p>
        <div className="flex flex-wrap gap-2">
          {emAberto ? (
            <Link href={`/agenda/novo?chamado=${id}`} className={cn(buttonVariants({ variant: "outline" }))}>
              <CalendarPlus aria-hidden /> Agendar visita
            </Link>
          ) : null}
          {podeResolver ? (
            <Button type="button" onClick={() => setResolvendo((v) => !v)} disabled={pendente} aria-expanded={resolvendo}>
              Resolver
            </Button>
          ) : null}
          {destinos.map((s) => (
            <Button key={s} type="button" variant="outline" onClick={() => mudar(s)} disabled={pendente}>
              {s === "ABERTO" ? "Reabrir" : s === "CANCELADO" ? "Cancelar chamado" : ROTULO_STATUS_CHAMADO[s]}
            </Button>
          ))}
        </div>
        {resolvendo ? (
          <div className="grid gap-2 rounded-lg border p-3">
            <Campo id="solucao" rotulo="O que foi feito" erro={erros.solucao} obrigatorio>
              <AreaTexto id="solucao" value={textoSolucao} onChange={(e) => setTextoSolucao(e.target.value)} maxLength={2000} rows={3} aria-invalid={erros.solucao ? true : undefined} />
            </Campo>
            <div className="flex gap-2">
              <Button type="button" onClick={resolver} disabled={pendente}>
                {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Confirmar resolução
              </Button>
              <Button type="button" variant="ghost" onClick={() => setResolvendo(false)}>
                Voltar
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="sec-garantia" className="grid gap-3 rounded-xl border p-4">
        <h2 id="sec-garantia" className="font-medium">
          Garantia e cobrança
        </h2>
        <Campo id="classificacao" rotulo="Classificação" dica={classe !== classificacaoSugerida ? `O sistema sugeriu: ${ROTULO_CLASSIFICACAO[classificacaoSugerida].toLowerCase()}.` : undefined}>
          <Selecao id="classificacao" value={classe} onChange={(e) => setClasse(e.target.value as Classificacao)}>
            {(Object.keys(ROTULO_CLASSIFICACAO) as Classificacao[]).map((c) => (
              <option key={c} value={c}>
                {ROTULO_CLASSIFICACAO[c]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <CaixaMarcacao id="cobrarVisita" rotulo="Cobrar a visita" checked={cobrar} onChange={(e) => setCobrar(e.target.checked)} disabled={cobrancaGerada} />
        {cobrar ? (
          <Campo id="valorCobrado" rotulo="Valor da visita (R$)" erro={erros.valorCobradoCentavos} dica="Não há valor padrão: quem decide é o gestor.">
            <Input id="valorCobrado" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} disabled={cobrancaGerada} maxLength={20} className="max-w-48" aria-invalid={erros.valorCobradoCentavos ? true : undefined} />
          </Campo>
        ) : null}
        {cobrancaGerada ? <p className="text-muted-foreground text-sm">A cobrança já virou conta a receber da obra; ajuste o valor lá (Financeiro).</p> : null}
        <div>
          <Button type="button" variant="secondary" onClick={salvarAjuste} disabled={pendente || !ajusteMudou}>
            Salvar ajustes
          </Button>
        </div>

        {cobrar && !cobrancaGerada ? (
          <div className="grid gap-2 border-t pt-3">
            <p className="text-sm font-medium">Gerar cobrança</p>
            {!temObra ? (
              <p className="text-muted-foreground text-sm">A cobrança fica na conta a receber de uma obra. Este chamado não tem obra.</p>
            ) : !valorCobradoCentavos ? (
              <p className="text-muted-foreground text-sm">Salve o valor da visita para poder gerar a cobrança.</p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <Campo id="vencimento" rotulo={`Vencimento (${formatarMoeda(valorCobradoCentavos)})`} erro={erros.vencimento}>
                  <Input id="vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className="h-9" />
                </Campo>
                <Button type="button" onClick={gerar} disabled={pendente || !vencimento}>
                  {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Gerar conta a receber
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </section>

      {erro ? (
        <p role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
