import { AlertTriangle } from "lucide-react";

import { analisarMargem, calcularTotais, pontosBaseParaPercentual, type Medida } from "@/lib/dominio/preco";
import { formatarMoeda } from "@/lib/formatadores";

type Item = { opcaoId: string; precoTotalCentavos: number; custoEstimadoCentavos: number | null; medidas: Medida[]; avisoPreco: string | null };

type Props = {
  opcoes: { id: string; nome: string; descontoCentavos: number }[];
  itens: Item[];
  comNotaFiscal: boolean;
  acrescimoNotaPb: number;
  comissaoArquitetoPb: number;
  comissaoIndicacaoPb: number;
  /** Margem real mínima (%) de Configurações; vazio = sem alerta. */
  margemMinimaAlerta: number | null;
  /** Mostra custo e margem (tela interna). Nunca vai ao PDF. */
  interno?: boolean;
};

/** Painel lateral: total por opção (sempre calculado, nunca digitado), nota fiscal em linha separada e, só internamente, custo e margem. */
export function PainelTotais({ opcoes, itens, comNotaFiscal, acrescimoNotaPb, comissaoArquitetoPb, comissaoIndicacaoPb, margemMinimaAlerta, interno = true }: Props) {
  const totais = calcularTotais(itens, opcoes, comNotaFiscal, acrescimoNotaPb);
  const semValor = itens.filter((i) => i.precoTotalCentavos <= 0).length;
  const comAviso = itens.filter((i) => i.avisoPreco).length;

  return (
    <aside aria-label="Totais da proposta" className="grid gap-4 rounded-xl border p-4">
      <h2 className="font-medium">Totais</h2>
      {totais.map((t) => {
        const opcao = opcoes.find((o) => o.id === t.opcaoId);
        const medidasDaOpcao = itens.filter((i) => i.opcaoId === t.opcaoId).flatMap((i) => i.medidas);
        const margem = interno ? analisarMargem(t.baseCentavos, t.custoCentavos, medidasDaOpcao) : null;
        const abaixo = margem?.margemPb != null && margemMinimaAlerta !== null && margem.margemPb < margemMinimaAlerta * 100;
        const comissoes = t.baseCentavos > 0 ? Math.round((t.baseCentavos * (comissaoArquitetoPb + comissaoIndicacaoPb)) / 10000) : 0;
        return (
          <div key={t.opcaoId} className="grid gap-1 border-b pb-3 text-sm last:border-0 last:pb-0">
            {opcoes.length > 1 ? <p className="font-medium">{opcao?.nome}</p> : null}
            <Linha rotulo="Itens" valor={formatarMoeda(t.itensCentavos)} />
            {t.descontoCentavos > 0 ? <Linha rotulo="Desconto" valor={`− ${formatarMoeda(t.descontoCentavos)}`} /> : null}
            {comNotaFiscal ? <Linha rotulo={`Acréscimo da nota fiscal (${pontosBaseParaPercentual(acrescimoNotaPb)}%)`} valor={formatarMoeda(t.acrescimoNotaCentavos)} /> : null}
            <p className="flex items-baseline justify-between gap-2 pt-1 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatarMoeda(t.totalCentavos)}</span>
            </p>
            <p className="text-muted-foreground text-xs">{t.areaM2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m² · {comNotaFiscal ? "com nota fiscal" : "sem nota fiscal"}</p>
            {interno ? (
              <div className="bg-muted/50 mt-2 grid gap-0.5 rounded-lg p-2 text-xs" aria-label="Uso interno: não aparece no PDF">
                <p className="text-muted-foreground font-medium">Só para você (não vai ao PDF)</p>
                {t.custoCentavos !== null ? (
                  <>
                    <Linha rotulo="Custo estimado" valor={formatarMoeda(t.custoCentavos)} />
                    <Linha rotulo="Lucro sobre o preço (sem nota)" valor={`${formatarMoeda(margem?.margemCentavos ?? 0)}${margem?.margemPb != null ? ` (${(margem.margemPb / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)` : ""}`} />
                  </>
                ) : (
                  <p className="text-muted-foreground">Custo indisponível: {t.itensSemCusto} item(ns) sem composição completa.</p>
                )}
                {margem?.precoPorM2Centavos ? <Linha rotulo="Preço por m²" valor={formatarMoeda(margem.precoPorM2Centavos)} /> : null}
                {comissoes > 0 ? <Linha rotulo="Comissões (informativo)" valor={formatarMoeda(comissoes)} /> : null}
                {abaixo ? (
                  <p role="status" className="mt-1 flex items-start gap-1 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Margem abaixo do mínimo de alerta ({margemMinimaAlerta}%).
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {semValor > 0 ? (
        <p role="status" className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {semValor} item(ns) sem valor. Informe o preço antes de enviar.
        </p>
      ) : null}
      {comAviso > 0 ? <p className="text-muted-foreground text-xs">{comAviso} item(ns) com aviso de preço (veja os cartões).</p> : null}
    </aside>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <p className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="tabular-nums">{valor}</span>
    </p>
  );
}
