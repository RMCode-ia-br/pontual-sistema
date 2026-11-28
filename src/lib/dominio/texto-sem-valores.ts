/**
 * Esconde valores em dinheiro de um texto para quem não pode ver valores (Fase 7C, camada 4).
 *
 * A linha do tempo de obra, projeto e cliente guarda textos gerados pelo sistema que levam o valor ("Recebido R$ 1.500,00.
 * Restam R$ 500,00.", "Proposta aprovada por R$ 12.000,00"). O texto fica como está no banco; só a TELA troca o valor,
 * para quem não tem "ver valores". Reconhece o formato do \`formatarMoeda\` ("R$ 1.234,56", com espaço comum ou
 * inseparável) e o digitado à mão ("R$ 500", "R$500,5"). Nunca altera dinheiro sem o "R$".
 */
export const VALOR_OCULTO = "valor oculto";

const DINHEIRO = /R\$[\s ]*-?\d[\d.]*(?:,\d+)?/g;

export function ocultarValoresDoTexto(texto: string): string {
  return texto.replace(DINHEIRO, VALOR_OCULTO);
}

/** Aplica o mascaramento aos itens de uma linha do tempo (o campo `texto`), sem mexer no resto. */
export function semValoresNaLinhaDoTempo<T extends { texto: string }>(itens: readonly T[], podeVerValores: boolean): T[] {
  return podeVerValores ? [...itens] : itens.map((i) => ({ ...i, texto: ocultarValoresDoTexto(i.texto) }));
}
