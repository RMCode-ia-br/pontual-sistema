/**
 * Interpretador seguro de fórmulas de quantidade (R2). Parser próprio (descida recursiva): NUNCA usa
 * `eval`, `Function` nem acesso a objetos. Só entende números, as variáveis permitidas, operadores
 * aritméticos e de comparação, parênteses e uma lista fechada de funções.
 *
 * Variáveis: L (largura, mm), A (altura, mm), F (nº de folhas), Q (quantidade).
 * Funções: min, max, ceil, floor, round, abs, sqrt, se(condição; então; senão).
 * Ex.: `(L/1000)*2 + (A/1000)*2`, `se(F>2; 4; 2) * Q`.
 */

export const VARIAVEIS_FORMULA = ["L", "A", "F", "Q"] as const;
export type VariavelFormula = (typeof VARIAVEIS_FORMULA)[number];
export type ValoresFormula = Record<VariavelFormula, number>;

export const TAMANHO_MAXIMO_FORMULA = 300;
const PROFUNDIDADE_MAXIMA = 24;
const NOS_MAXIMOS = 200;

type Token =
  | { tipo: "numero"; valor: number }
  | { tipo: "id"; nome: string }
  | { tipo: "op"; op: string }
  | { tipo: "fim" };

type No =
  | { tipo: "numero"; valor: number }
  | { tipo: "var"; nome: VariavelFormula }
  | { tipo: "unario"; op: "-" | "+"; arg: No }
  | { tipo: "binario"; op: string; esq: No; dir: No }
  | { tipo: "chamada"; nome: string; args: No[] };

/** Funções permitidas e o número de argumentos aceito (min..max). */
const FUNCOES: Record<string, { min: number; max: number; fn: (...a: number[]) => number }> = {
  min: { min: 2, max: 8, fn: (...a) => Math.min(...a) },
  max: { min: 2, max: 8, fn: (...a) => Math.max(...a) },
  ceil: { min: 1, max: 1, fn: (a) => Math.ceil(a) },
  floor: { min: 1, max: 1, fn: (a) => Math.floor(a) },
  round: { min: 1, max: 1, fn: (a) => Math.round(a) },
  abs: { min: 1, max: 1, fn: (a) => Math.abs(a) },
  sqrt: { min: 1, max: 1, fn: (a) => Math.sqrt(a) },
  se: { min: 3, max: 3, fn: (c, a, b) => (c !== 0 ? a : b) },
};

export class ErroFormula extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroFormula";
  }
}

function tokenizar(texto: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(texto[i + 1] ?? ""))) {
      // Decimal só com ponto (a vírgula separa argumentos de funções).
      let j = i;
      let pontos = 0;
      while (j < texto.length && /[0-9.]/.test(texto[j])) {
        if (texto[j] === ".") pontos++;
        j++;
      }
      if (pontos > 1) throw new ErroFormula(`Número inválido: "${texto.slice(i, j)}".`);
      const valor = Number(texto.slice(i, j));
      if (!Number.isFinite(valor)) throw new ErroFormula(`Número inválido: "${texto.slice(i, j)}".`);
      tokens.push({ tipo: "numero", valor });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < texto.length && /[A-Za-z0-9_]/.test(texto[j])) j++;
      tokens.push({ tipo: "id", nome: texto.slice(i, j) });
      i = j;
      continue;
    }
    const dois = texto.slice(i, i + 2);
    if (["<=", ">=", "==", "!="].includes(dois)) {
      tokens.push({ tipo: "op", op: dois });
      i += 2;
      continue;
    }
    if ("+-*/(),;<>".includes(c)) {
      tokens.push({ tipo: "op", op: c });
      i++;
      continue;
    }
    throw new ErroFormula(`Caractere não permitido: "${c}".`);
  }
  tokens.push({ tipo: "fim" });
  return tokens;
}

class Analisador {
  private pos = 0;
  private nos = 0;
  constructor(private readonly tokens: Token[]) {}

  private atual(): Token {
    return this.tokens[this.pos];
  }
  private ehOp(op: string): boolean {
    const t = this.atual();
    return t.tipo === "op" && t.op === op;
  }
  private no<T extends No>(no: T): T {
    if (++this.nos > NOS_MAXIMOS) throw new ErroFormula("Fórmula muito complexa.");
    return no;
  }

  analisar(): No {
    const no = this.comparacao(0);
    if (this.atual().tipo !== "fim") throw new ErroFormula("Fórmula incompleta ou com símbolo sobrando.");
    return no;
  }

  private comparacao(prof: number): No {
    this.checarProfundidade(prof);
    let esq = this.soma(prof + 1);
    while (["<", ">", "<=", ">=", "==", "!="].some((op) => this.ehOp(op))) {
      const op = (this.atual() as { op: string }).op;
      this.pos++;
      esq = this.no({ tipo: "binario", op, esq, dir: this.soma(prof + 1) });
    }
    return esq;
  }

  private soma(prof: number): No {
    let esq = this.produto(prof + 1);
    while (this.ehOp("+") || this.ehOp("-")) {
      const op = (this.atual() as { op: string }).op;
      this.pos++;
      esq = this.no({ tipo: "binario", op, esq, dir: this.produto(prof + 1) });
    }
    return esq;
  }

  private produto(prof: number): No {
    let esq = this.unario(prof + 1);
    while (this.ehOp("*") || this.ehOp("/")) {
      const op = (this.atual() as { op: string }).op;
      this.pos++;
      esq = this.no({ tipo: "binario", op, esq, dir: this.unario(prof + 1) });
    }
    return esq;
  }

  private unario(prof: number): No {
    this.checarProfundidade(prof);
    if (this.ehOp("-") || this.ehOp("+")) {
      const op = (this.atual() as { op: "-" | "+" }).op;
      this.pos++;
      return this.no({ tipo: "unario", op, arg: this.unario(prof + 1) });
    }
    return this.primario(prof + 1);
  }

  private primario(prof: number): No {
    this.checarProfundidade(prof);
    const t = this.atual();
    if (t.tipo === "numero") {
      this.pos++;
      return this.no({ tipo: "numero", valor: t.valor });
    }
    if (t.tipo === "id") {
      this.pos++;
      if (this.ehOp("(")) {
        const nome = t.nome.toLowerCase();
        const def = Object.hasOwn(FUNCOES, nome) ? FUNCOES[nome] : undefined;
        if (!def) throw new ErroFormula(`Função não permitida: "${t.nome}".`);
        this.pos++;
        const args: No[] = [];
        if (!this.ehOp(")")) {
          args.push(this.comparacao(prof + 1));
          while (this.ehOp(",") || this.ehOp(";")) {
            this.pos++;
            args.push(this.comparacao(prof + 1));
          }
        }
        if (!this.ehOp(")")) throw new ErroFormula("Falta fechar um parêntese.");
        this.pos++;
        if (args.length < def.min || args.length > def.max) {
          throw new ErroFormula(`A função "${nome}" recebe ${def.min === def.max ? def.min : `de ${def.min} a ${def.max}`} valor(es).`);
        }
        return this.no({ tipo: "chamada", nome, args });
      }
      const nome = t.nome.toUpperCase();
      if (!(VARIAVEIS_FORMULA as readonly string[]).includes(nome) || t.nome !== nome) {
        throw new ErroFormula(`Variável desconhecida: "${t.nome}". Use L, A, F ou Q (maiúsculas).`);
      }
      return this.no({ tipo: "var", nome: nome as VariavelFormula });
    }
    if (this.ehOp("(")) {
      this.pos++;
      const interno = this.comparacao(prof + 1);
      if (!this.ehOp(")")) throw new ErroFormula("Falta fechar um parêntese.");
      this.pos++;
      return interno;
    }
    throw new ErroFormula("Fórmula incompleta: esperava um número, variável ou parêntese.");
  }

  private checarProfundidade(prof: number) {
    if (prof > PROFUNDIDADE_MAXIMA * 4) throw new ErroFormula("Fórmula com parênteses demais.");
  }
}

function compilar(texto: string): No {
  if (typeof texto !== "string" || texto.trim() === "") throw new ErroFormula("Informe a fórmula.");
  if (texto.length > TAMANHO_MAXIMO_FORMULA) throw new ErroFormula(`A fórmula pode ter no máximo ${TAMANHO_MAXIMO_FORMULA} caracteres.`);
  return new Analisador(tokenizar(texto)).analisar();
}

function executar(no: No, v: ValoresFormula): number {
  switch (no.tipo) {
    case "numero":
      return no.valor;
    case "var":
      return v[no.nome];
    case "unario":
      return no.op === "-" ? -executar(no.arg, v) : executar(no.arg, v);
    case "chamada": {
      // `se` é preguiçoso: o ramo não escolhido não roda (permite se(F>0; X/F; 0) sem dividir por zero).
      if (no.nome === "se") return executar(executar(no.args[0], v) !== 0 ? no.args[1] : no.args[2], v);
      const def = FUNCOES[no.nome];
      return def.fn(...no.args.map((a) => executar(a, v)));
    }
    case "binario": {
      const a = executar(no.esq, v);
      const b = executar(no.dir, v);
      switch (no.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          if (b === 0) throw new ErroFormula("Divisão por zero.");
          return a / b;
        case "<":
          return a < b ? 1 : 0;
        case ">":
          return a > b ? 1 : 0;
        case "<=":
          return a <= b ? 1 : 0;
        case ">=":
          return a >= b ? 1 : 0;
        case "==":
          return a === b ? 1 : 0;
        default:
          return a !== b ? 1 : 0;
      }
    }
  }
}

/** Avalia a fórmula. Lança `ErroFormula` (mensagem segura) se for inválida ou o resultado não for um número finito ≥ 0. */
export function avaliarFormula(texto: string, valores: ValoresFormula): number {
  const resultado = executar(compilar(texto), valores);
  if (!Number.isFinite(resultado)) throw new ErroFormula("O resultado da fórmula não é um número válido.");
  if (resultado < 0) throw new ErroFormula("O resultado da fórmula ficou negativo.");
  return resultado;
}

/** Valida ao salvar: sintaxe + uma execução de teste com medidas de exemplo (pega divisão por zero evidente). */
export function validarFormula(texto: string): { ok: true } | { ok: false; erro: string } {
  try {
    const no = compilar(texto);
    executar(no, { L: 1000, A: 1000, F: 2, Q: 1 });
    return { ok: true };
  } catch (erro) {
    if (erro instanceof ErroFormula) return { ok: false, erro: erro.message };
    return { ok: false, erro: "Fórmula inválida." };
  }
}

/** Testa a fórmula com valores de exemplo (editor de composição). */
export function testarFormula(texto: string, valores: ValoresFormula): { ok: true; valor: number } | { ok: false; erro: string } {
  try {
    return { ok: true, valor: avaliarFormula(texto, valores) };
  } catch (erro) {
    return { ok: false, erro: erro instanceof ErroFormula ? erro.message : "Fórmula inválida." };
  }
}
