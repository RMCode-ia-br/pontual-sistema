/**
 * Tokens secretos de acesso (feed da agenda agora; chaves de API na Fase 8). Bloco genérico, só para o servidor.
 * O token em claro é mostrado UMA vez; no banco fica apenas o hash SHA-256, e a busca é pelo hash
 * (índice único), então não há comparação de texto secreto que possa vazar por tempo de resposta.
 */
import { createHash, randomBytes } from "node:crypto";

/** 32 bytes aleatórios (256 bits) em base64url: ~43 caracteres, seguros para ir em uma URL. */
export function gerarToken(bytes = 32): string {
  if (!Number.isInteger(bytes) || bytes < 16) throw new RangeError("O token precisa de ao menos 16 bytes.");
  return randomBytes(bytes).toString("base64url");
}

export function hashDoToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Formato esperado de um token gerado por `gerarToken()` (rejeita lixo antes de consultar o banco). */
export function tokenComFormatoValido(token: string): boolean {
  return /^[A-Za-z0-9_-]{22,128}$/.test(token);
}
