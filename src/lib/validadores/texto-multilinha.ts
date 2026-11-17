/**
 * Texto de várias linhas (um campo `textarea`): troca o fim de linha do navegador (CRLF, o formulário multipart manda
 * assim) por LF, tira o espaço do fim de cada linha e limita a sequência de linhas em branco a uma. O início e o fim
 * do texto são aparados por quem chama (`trim` do schema). As quebras do meio são preservadas.
 */
export function normalizarQuebrasDeLinha(valor: string): string {
  return valor
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

/** Divide o texto normalizado em linhas, para quem desenha o texto linha a linha (PDF). */
export function linhasDoTexto(valor: string): string[] {
  return normalizarQuebrasDeLinha(valor).split("\n");
}
