/**
 * Lê o arquivo escolhido pela pessoa (CSV, TXT ou XLSX) no NAVEGADOR e devolve a planilha.
 * A leitura acontece aqui, e não no servidor, de propósito: um .xlsx é um arquivo compactado e
 * interpretá-lo no servidor abriria espaço para arquivos "bomba". O servidor só recebe as linhas já
 * lidas, e valida tudo de novo.
 */
import { decodificarTexto, ErroPlanilha, LIMITES_PLANILHA, lerCsv, planilhaDeMatriz, type Planilha } from "./ler";

/** O valor de uma célula do XLSX: texto, número, lógico, data ou vazio (a tipagem da biblioteca é mais frouxa). */
function celulaParaTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? "" : valor.toISOString().slice(0, 10);
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return "";
    // Evita o ruído de ponto flutuante (0.1 + 0.2) sem perder casas decimais reais.
    return Number.isInteger(valor) ? String(valor) : String(Number(valor.toFixed(6)));
  }
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  return String(valor);
}

export async function lerArquivoDePlanilha(arquivo: File): Promise<Planilha> {
  if (arquivo.size === 0) throw new ErroPlanilha("O arquivo está vazio.");
  if (arquivo.size > LIMITES_PLANILHA.bytes) {
    throw new ErroPlanilha(`O arquivo passa de ${LIMITES_PLANILHA.bytes / 1024 / 1024} MB.`);
  }

  const nome = arquivo.name.toLowerCase();
  if (nome.endsWith(".xlsx")) {
    try {
      // Versão "universal": roda no thread principal (a política de segurança do site não libera Web Workers).
      const { readSheet } = await import("read-excel-file/universal");
      const matriz = await readSheet(arquivo);
      return planilhaDeMatriz(matriz.map((linha) => linha.map(celulaParaTexto)));
    } catch (erro) {
      if (erro instanceof ErroPlanilha) throw erro;
      throw new ErroPlanilha("Não consegui ler a planilha. Confira se é um arquivo .xlsx válido ou salve como CSV.");
    }
  }
  if (nome.endsWith(".xls")) {
    throw new ErroPlanilha("O formato .xls (Excel antigo) não é aceito. No Excel, use Salvar como e escolha .xlsx ou CSV.");
  }
  if (nome.endsWith(".csv") || nome.endsWith(".txt")) {
    return lerCsv(decodificarTexto(new Uint8Array(await arquivo.arrayBuffer())));
  }
  throw new ErroPlanilha("Envie um arquivo .csv ou .xlsx.");
}
