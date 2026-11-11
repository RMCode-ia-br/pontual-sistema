/**
 * Detecção de duplicidade de cadastros (spec seção 4): mesmo telefone ou mesmo CPF/CNPJ.
 * Tudo é comparado depois de normalizado (só dígitos; telefone em E.164).
 */
import { normalizarTelefone } from "../formatadores";
import { somenteDigitos } from "../validadores";

/** CPF (11) ou CNPJ (14) só com dígitos; qualquer outra coisa não serve de chave. */
export function normalizarDocumento(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const d = somenteDigitos(texto);
  return d.length === 11 || d.length === 14 ? d : null;
}

export type DadosDeContato = {
  cpfCnpj?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
};

export type ChavesDeDuplicidade = {
  documento: string | null;
  /** Telefone e WhatsApp normalizados, sem repetição. */
  telefones: string[];
};

export function chavesDeDuplicidade(dados: DadosDeContato): ChavesDeDuplicidade {
  const telefones = [dados.telefone, dados.whatsapp]
    .map((t) => (t ? normalizarTelefone(t) : null))
    .filter((t): t is string => t !== null);
  return { documento: normalizarDocumento(dados.cpfCnpj), telefones: Array.from(new Set(telefones)) };
}

export type DuplicadaNoArquivo = {
  /** Índice (0 = primeira linha de dados) da linha repetida. */
  indice: number;
  /** Índice da primeira linha que já trazia a mesma chave. */
  duplicadaDe: number;
  /** O que se repete, em palavras ("CPF/CNPJ", "telefone", "código"). */
  motivo: string;
};

/**
 * Procura repetições DENTRO do próprio arquivo. A primeira ocorrência vale; as seguintes são
 * marcadas. Cada linha informa suas chaves já normalizadas, com o rótulo de cada uma.
 */
export function duplicadasNoArquivo(linhas: { chave: string; rotulo: string }[][]): DuplicadaNoArquivo[] {
  const vistas = new Map<string, number>();
  const repetidas: DuplicadaNoArquivo[] = [];
  linhas.forEach((chaves, indice) => {
    let marcada = false;
    for (const { chave, rotulo } of chaves) {
      const existente = vistas.get(chave);
      if (existente !== undefined && existente !== indice) {
        if (!marcada) repetidas.push({ indice, duplicadaDe: existente, motivo: rotulo });
        marcada = true;
      } else if (existente === undefined) {
        vistas.set(chave, indice);
      }
    }
  });
  return repetidas;
}
