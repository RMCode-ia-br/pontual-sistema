// Mensagem de cobrança por WhatsApp (modelo editável `whatsapp.cobranca`, variáveis: cliente, nomeFantasia,
// valorParcela, vencimento, obra). O valor é o SALDO devedor (não o valor cheio, se já houve pagamento parcial).
// Variável sem valor não é apagada em silêncio: fica no texto e volta em `faltando` (a tela avisa).

import { formatarMoeda } from "../formatadores";

import { somarDias } from "./calendario";
import { linkWhatsApp, preencherModelo, primeiroNome } from "./modelos-texto";

export type DadosDaCobranca = {
  clienteNome: string;
  nomeFantasia: string | null;
  saldoCentavos: number;
  /** "aaaa-mm-dd" ou null (parcela ainda sem vencimento). */
  vencimento: string | null;
  obra: string | null;
  telefone: string | null;
};

/** "2026-11-30" → "30/11/2026". */
export function dataBrasileira(data: string): string {
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

export function montarCobranca(modelo: string, d: DadosDaCobranca): { texto: string; link: string | null; faltando: string[] } {
  const { texto, faltando } = preencherModelo(modelo, {
    cliente: primeiroNome(d.clienteNome),
    nomeFantasia: d.nomeFantasia ?? undefined,
    valorParcela: d.saldoCentavos > 0 ? formatarMoeda(d.saldoCentavos) : undefined,
    vencimento: d.vencimento ? dataBrasileira(d.vencimento) : undefined,
    obra: d.obra ?? undefined,
  });
  const pendencias = [...faltando];
  if (!d.telefone) pendencias.push("telefone do cliente");
  const link = pendencias.length === 0 && d.telefone ? linkWhatsApp(d.telefone, texto) : null;
  return { texto, link, faltando: pendencias };
}

/**
 * Data em que a tarefa "Cobrar parcela" vence: `dias` antes do vencimento (0 = no próprio dia), mas nunca antes de
 * hoje. Parcela que já venceu mantém o vencimento (a cobrança nasce atrasada, como a parcela). Datas "aaaa-mm-dd".
 */
export function dataDoLembreteDeCobranca(vencimento: string, dias: number, hoje: string): string {
  if (!Number.isInteger(dias) || dias < 0) throw new RangeError("Dias do lembrete inválidos.");
  if (vencimento < hoje) return vencimento;
  const lembrete = somarDias(vencimento, -dias);
  return lembrete < hoje ? hoje : lembrete;
}
