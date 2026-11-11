export function somenteDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

function digitoVerificador(base: string, pesos: number[]): number {
  const soma = base.split("").reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCpf(texto: string): boolean {
  const cpf = somenteDigitos(texto);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const d1 = digitoVerificador(cpf.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(cpf.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cpf.endsWith(`${d1}${d2}`);
}

export function validarCnpj(texto: string): boolean {
  const cnpj = somenteDigitos(texto);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const d1 = digitoVerificador(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${d1}${d2}`);
}

export function formatarCnpj(texto: string): string {
  const c = somenteDigitos(texto);
  return c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : texto;
}

export function formatarCpf(texto: string): string {
  const c = somenteDigitos(texto);
  return c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : texto;
}

export function formatarCep(texto: string): string {
  const c = somenteDigitos(texto);
  return c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : texto;
}

/** Endereço de e-mail simples e permissivo (a confirmação real é entregar a mensagem). */
export function emailValido(texto: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texto) && texto.length <= 254;
}

/** Só aceita URLs http(s), para links vindos de formulários (nunca `javascript:`). */
export function urlHttpValida(texto: string): boolean {
  try {
    const u = new URL(texto);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
