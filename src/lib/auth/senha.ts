import bcrypt from "bcryptjs";

/** Custo do bcrypt exigido pela especificação (>= 12). */
export const CUSTO_BCRYPT = 12;

/** Senha inicial do seed; é a única exceção à política e nunca pode ser escolhida pelo usuário. */
export const SENHA_INICIAL_PROIBIDA = "admin";

export const TAMANHO_MINIMO_SENHA = 8;

/** O bcrypt só considera os primeiros 72 BYTES: acima disso senhas diferentes seriam equivalentes. */
export const TAMANHO_MAXIMO_SENHA_BYTES = 72;

export type ResultadoPoliticaSenha = { valida: true } | { valida: false; motivo: string };

/** Política mínima da seção 10: 8+ caracteres, e nunca a senha inicial do seed. */
export function validarPoliticaSenha(senha: string): ResultadoPoliticaSenha {
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    return { valida: false, motivo: `A senha deve ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.` };
  }
  if (new TextEncoder().encode(senha).length > TAMANHO_MAXIMO_SENHA_BYTES) {
    return { valida: false, motivo: `A senha pode ter no máximo ${TAMANHO_MAXIMO_SENHA_BYTES} caracteres.` };
  }
  if (senha.trim().toLowerCase() === SENHA_INICIAL_PROIBIDA) {
    return { valida: false, motivo: "Escolha uma senha diferente da senha inicial." };
  }
  if (senha.trim().length === 0) {
    return { valida: false, motivo: "A senha não pode ser só espaços." };
  }
  return { valida: true };
}

export function gerarHashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_BCRYPT);
}

export function conferirSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

// Hash descartável para igualar o tempo de resposta quando o usuário não existe
// (evita descobrir logins válidos pela diferença de tempo).
let hashFalso: Promise<string> | undefined;
export function conferirSenhaFalsa(senha: string): Promise<boolean> {
  hashFalso ??= bcrypt.hash("senha-inexistente-para-igualar-tempo", CUSTO_BCRYPT);
  return hashFalso.then((h) => bcrypt.compare(senha, h)).then(() => false);
}

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Senha temporária legível (sem caracteres ambíguos), exibida uma única vez ao administrador. */
export function gerarSenhaTemporaria(tamanho = 10): string {
  const bytes = new Uint8Array(tamanho);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}
