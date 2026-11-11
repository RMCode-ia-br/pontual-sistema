/**
 * Textos de impressão da proposta (termos comerciais): linhas de pagamento, prazo e numeração das notas.
 * Puro e testável; o PDF só desenha o que sai daqui.
 */
import { ROTULO_FORMA, ROTULO_GATILHO, type FormaPagamento, type Gatilho } from "./parcelas";
import { dividirArredondando, PONTOS_BASE_100 } from "./preco";

export type ParcelaTexto = { descricao: string; percentualPb: number; gatilho: string; forma: string | null; diasApos: number | null; dataFixa: string | null; parcelasCartao: number | null };

const moeda = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const percentual = (pb: number) => `${(pb / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Divide o total pelo cronograma com a MESMA regra de `gerarParcelas` (última absorve a diferença). */
function valoresDasParcelas(totalCentavos: number, parcelas: ParcelaTexto[]): number[] {
  let acumulado = 0;
  return parcelas.map((p, i) => {
    const v = i === parcelas.length - 1 ? totalCentavos - acumulado : Number(dividirArredondando(BigInt(totalCentavos) * BigInt(p.percentualPb), BigInt(PONTOS_BASE_100)));
    acumulado += v;
    return v;
  });
}

/** "50% (R$ 9.915,00) — Sinal na confirmação do pedido — PIX". */
export function linhasDePagamento(totalCentavos: number, parcelas: ParcelaTexto[], textoLivre: string | null): string[] {
  if (parcelas.length === 0) return textoLivre ? [textoLivre] : [];
  const valores = valoresDasParcelas(totalCentavos, parcelas);
  return parcelas.map((p, i) => {
    const quando =
      p.gatilho === "DATA_FIXA" && p.dataFixa
        ? `em ${dataBr(p.dataFixa)}`
        : p.gatilho === "DIAS_APOS_APROVACAO" && p.diasApos !== null
          ? `${p.diasApos} dia${p.diasApos === 1 ? "" : "s"} após a aprovação`
          : (ROTULO_GATILHO[p.gatilho as Gatilho] ?? "").toLowerCase();
    const forma = p.forma ? `${ROTULO_FORMA[p.forma as FormaPagamento] ?? p.forma}${p.parcelasCartao ? ` em até ${p.parcelasCartao}x` : ""}` : null;
    const descricao = p.descricao.trim();
    // Quando há descrição, ela já diz o gatilho (entrega, sinal…); a data e os dias, não: entram sempre.
    const explicitaQuando = p.gatilho === "DATA_FIXA" || p.gatilho === "DIAS_APOS_APROVACAO" || descricao === "";
    return [`${percentual(p.percentualPb)} (${moeda(valores[i])})`, descricao, explicitaQuando ? quando : null, forma].filter(Boolean).join(" — ");
  });
}

export type PrazoTexto = { modo: "NENHUM" | "TOTAL" | "POR_ETAPA"; totalMinDias: number | null; totalMaxDias: number | null; materialDias: number | null; execucaoDias: number | null; vidrosDias: number | null; tipoDias?: "UTEIS" | "CORRIDOS" };

/** Prazos como nas propostas reais: por grupo de etapas ou total simples ("20 a 35 dias úteis"). */
export function linhasDePrazo(p: PrazoTexto): string[] {
  const unidade = p.tipoDias === "CORRIDOS" ? "dias corridos" : "dias úteis";
  const dias = (n: number) => `${n} ${n === 1 ? (p.tipoDias === "CORRIDOS" ? "dia corrido" : "dia útil") : unidade}`;
  if (p.modo === "TOTAL") {
    if (p.totalMaxDias === null) return [];
    if (p.totalMinDias !== null && p.totalMinDias !== p.totalMaxDias) return [`Prazo total de ${p.totalMinDias} a ${dias(p.totalMaxDias)}`];
    return [`Prazo total de ${dias(p.totalMaxDias)}`];
  }
  if (p.modo === "POR_ETAPA") {
    return [
      p.materialDias !== null ? `Material: ${dias(p.materialDias)}` : null,
      p.execucaoDias !== null ? `Execução: ${dias(p.execucaoDias)}` : null,
      p.vidrosDias !== null ? `Vidros e finalização: ${dias(p.vidrosDias)}` : null,
    ].filter((x): x is string => x !== null);
  }
  return [];
}

/** Notas numeradas ("1. …"), ignorando linhas vazias. */
export function notasNumeradas(notas: string[]): string[] {
  return notas.map((n) => n.trim()).filter((n) => n !== "").map((n, i) => `${i + 1}. ${n}`);
}

/** "2000 X 3600 / 2000 X 2600" (a quantidade do item é a soma das quantidades). */
export function textoDasMedidas(medidas: { larguraMm: number; alturaMm: number }[]): string {
  return medidas.map((m) => `${m.larguraMm} X ${m.alturaMm}`).join(" / ");
}

/** Endereço do rodapé: "{endereço} — CNPJ {cnpj} — Tel: {telefone} — E-mail: {email}", omitindo o que está vazio. */
export function textoDoRodape(e: { endereco: string | null; cidade: string | null; uf: string | null; cep: string | null; cnpj: string | null; telefone: string | null; email: string | null }): string {
  const local = [e.endereco, [e.cidade, e.uf].filter(Boolean).join("-"), e.cep].filter(Boolean).join(", ");
  return [local, e.cnpj ? `CNPJ ${e.cnpj}` : null, e.telefone ? `Tel: ${e.telefone}` : null, e.email ? `E-mail: ${e.email}` : null].filter(Boolean).join(" — ");
}
