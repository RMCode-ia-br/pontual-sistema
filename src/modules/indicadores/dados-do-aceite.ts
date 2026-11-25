/**
 * Valores gravados no aceite (Fase 3.6a): referência, ajuste, acréscimo da nota e repasse de cartão. São a fonte única do
 * "repasse" nos relatórios e na margem. Se uma proposta APROVADA vier com alguma dessas colunas nula, o número NÃO pode ser
 * calculado: somar zero em silêncio esconderia o erro (a margem ficaria maior do que é). Os relatórios recusam, com este erro.
 */
export class DadosDoAceiteIncompletos extends Error {
  constructor(public readonly numeros: string[]) {
    const lista = numeros.slice(0, 5).join(", ") + (numeros.length > 5 ? ` e mais ${numeros.length - 5}` : "");
    super(`Há proposta(s) aprovada(s) sem os valores gravados no aceite (${lista}). Os números ficam bloqueados em vez de somar zero em silêncio: peça o preenchimento dessas propostas (referência, ajuste, nota e repasse de cartão).`);
    this.name = "DadosDoAceiteIncompletos";
  }
}

/**
 * Roda o carregador e, se o número foi BLOQUEADO por falta dos valores do aceite, devolve a mensagem em vez de deixar o erro
 * chegar ao limite de erro da página (que em produção mostra só um código genérico e esconderia o que fazer). O número continua
 * sem ser calculado: quem chama mostra o aviso no lugar dele. Qualquer outro erro segue subindo.
 */
export async function ouAviso<T>(carregar: () => Promise<T>): Promise<{ ok: true; dado: T } | { ok: false; mensagem: string }> {
  try {
    return { ok: true, dado: await carregar() };
  } catch (e) {
    if (e instanceof DadosDoAceiteIncompletos) return { ok: false, mensagem: e.message };
    throw e;
  }
}

/** Lança `DadosDoAceiteIncompletos` se houver ao menos um número de proposta aprovada com valores do aceite faltando. */
export function exigirDadosDoAceite(numeros: readonly string[]): void {
  if (numeros.length > 0) throw new DadosDoAceiteIncompletos([...numeros]);
}

/** Uma proposta aprovada tem os quatro valores do aceite preenchidos? */
export function temDadosDoAceite(p: { valorReferenciaAprovadoCentavos: number | null; ajusteAprovadoCentavos: number | null; acrescimoNotaAprovadoCentavos: number | null; repasseCartaoAprovadoCentavos: number | null }): boolean {
  return p.valorReferenciaAprovadoCentavos !== null && p.ajusteAprovadoCentavos !== null && p.acrescimoNotaAprovadoCentavos !== null && p.repasseCartaoAprovadoCentavos !== null;
}
