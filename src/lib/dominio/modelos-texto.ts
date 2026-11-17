/**
 * Modelos de texto com variáveis `{{nome}}` (mensagens de WhatsApp, textos de proposta).
 * Código puro; quem chama decide de onde vêm os valores.
 */

const VARIAVEL = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

/** Nomes das variáveis que o modelo usa, sem repetição e na ordem em que aparecem. */
export function variaveisDoModelo(texto: string): string[] {
  const nomes: string[] = [];
  for (const m of texto.matchAll(VARIAVEL)) if (!nomes.includes(m[1])) nomes.push(m[1]);
  return nomes;
}

/**
 * Troca as variáveis pelos valores. Variável sem valor NÃO é apagada em silêncio: fica no texto e
 * é devolvida em `faltando`, para a tela avisar (nunca sai "Olá, !" nem "proposta {{numero}}").
 */
export function preencherModelo(texto: string, valores: Record<string, string | undefined>): { texto: string; faltando: string[] } {
  const faltando: string[] = [];
  const preenchido = texto.replace(VARIAVEL, (original, nome: string) => {
    const valor = valores[nome];
    if (valor === undefined || valor.trim() === "") {
      if (!faltando.includes(nome)) faltando.push(nome);
      return original;
    }
    return valor;
  });
  return { texto: preenchido, faltando };
}

/** Link do WhatsApp (wa.me) para um telefone em qualquer formato, com mensagem opcional. */
export function linkWhatsApp(telefone: string, mensagem?: string): string | null {
  let digitos = telefone.replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
  if (!/^55\d{10,11}$/.test(digitos)) return null;
  return `https://wa.me/${digitos}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ""}`;
}

/**
 * Link do WhatsApp com a mensagem de um modelo já preenchida (ex.: lembrete de visita no painel). Devolve `null` quando
 * falta o modelo, o telefone (ou ele não é válido) ou algum valor que o modelo pede: nunca manda mensagem com
 * "{{variável}}" sobrando.
 */
export function linkDaMensagemDoModelo(modelo: string | null | undefined, telefone: string | null | undefined, valores: Record<string, string | undefined>): string | null {
  if (!modelo || !telefone) return null;
  const { texto, faltando } = preencherModelo(modelo, valores);
  return faltando.length === 0 ? linkWhatsApp(telefone, texto) : null;
}

/** Primeiro nome para cumprimentar ("Maria da Silva" → "Maria"). */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}
