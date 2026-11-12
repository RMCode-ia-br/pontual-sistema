// Texto do pedido de compra para o fornecedor (WhatsApp e PDF). Puro: recebe dados prontos e devolve texto. Nada fixo da empresa:
// o nome vem de Configurações. Preço só aparece quando foi informado (nunca "R$ 0,00" para o que não tem preço).

export type ItemDoPedido = {
  descricao: string;
  quantidade: string;
  unidade: string;
  /** "1180 × 980 mm · 8 mm · Temperado" para vidro; vazio nos demais. */
  detalhe: string | null;
  /** Preço por unidade já formatado ("R$ 12,50"); null = sem preço informado. */
  preco: string | null;
};

export type DadosDoPedido = {
  empresa: string | null;
  fornecedor: string;
  numero: string;
  itens: ItemDoPedido[];
  previsaoEntrega: string | null;
  condicoes: string | null;
  observacao: string | null;
};

/** Mensagem curta de pedido, pronta para colar no WhatsApp. */
export function montarTextoDoPedido(d: DadosDoPedido): string {
  const linhas: string[] = [];
  linhas.push(`Olá! Segue o pedido ${d.numero}${d.empresa ? ` da ${d.empresa}` : ""}:`);
  linhas.push("");
  d.itens.forEach((i, n) => {
    const base = `${n + 1}. ${i.descricao} — ${i.quantidade} ${i.unidade}`;
    const extras = [i.detalhe, i.preco ? `${i.preco} por ${i.unidade}` : null].filter(Boolean).join(" · ");
    linhas.push(extras ? `${base} (${extras})` : base);
  });
  if (d.previsaoEntrega) {
    linhas.push("");
    linhas.push(`Previsão de entrega: ${d.previsaoEntrega}`);
  }
  if (d.condicoes) linhas.push(`Condições: ${d.condicoes}`);
  if (d.observacao) linhas.push(`Obs.: ${d.observacao}`);
  linhas.push("");
  linhas.push("Pode confirmar o recebimento e o prazo? Obrigado!");
  return linhas.join("\n");
}
