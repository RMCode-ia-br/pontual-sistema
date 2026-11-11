/**
 * Leitura de planilhas CSV (e do que vem do XLSX) para a importação. Código puro: roda no navegador
 * e nos testes. O arquivo enviado é tratado como dado não confiável: há limites de tamanho, de linhas
 * e de colunas, e nada aqui interpreta o conteúdo das células.
 */

export const LIMITES_PLANILHA = {
  bytes: 2 * 1024 * 1024,
  linhas: 2000,
  colunas: 60,
  caracteresPorCelula: 500,
} as const;

/** Erro com mensagem segura para mostrar à pessoa. */
export class ErroPlanilha extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroPlanilha";
  }
}

export type Planilha = {
  /** Nomes das colunas (a primeira linha não vazia). */
  cabecalho: string[];
  /** Linhas de dados, todas com o mesmo número de colunas do cabeçalho. */
  linhas: string[][];
};

type Separador = ";" | "," | "\t";

/** Excel em português salva com ";", planilhas em inglês com ","; também aceita TAB. */
export function detectarSeparador(texto: string): Separador {
  let primeira = "";
  let emAspas = false;
  for (const c of texto) {
    if (c === '"') emAspas = !emAspas;
    if (!emAspas && (c === "\n" || c === "\r")) {
      if (primeira.trim() !== "") break;
      primeira = "";
      continue;
    }
    primeira += c;
  }
  const contar = (sep: string) => {
    let n = 0;
    let aspas = false;
    for (const c of primeira) {
      if (c === '"') aspas = !aspas;
      else if (!aspas && c === sep) n++;
    }
    return n;
  };
  const candidatos: Separador[] = [";", ",", "\t"];
  let melhor: Separador = ";";
  let maior = 0;
  for (const sep of candidatos) {
    const n = contar(sep);
    if (n > maior) {
      melhor = sep;
      maior = n;
    }
  }
  return melhor;
}

/** Bytes de um arquivo de texto → string: UTF-8 e, se não for válido, Windows-1252 (Excel antigo). */
export function decodificarTexto(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Divide o texto em registros e campos (RFC 4180 com separador configurável). */
function dividirRegistros(texto: string, separador: Separador): string[][] {
  const registros: string[][] = [];
  let campo = "";
  let registro: string[] = [];
  let emAspas = false;
  let campoComAspas = false;
  let numeroDaLinha = 1;

  const fecharCampo = () => {
    registro.push(campo);
    campo = "";
    campoComAspas = false;
  };
  const fecharRegistro = () => {
    fecharCampo();
    registros.push(registro);
    registro = [];
  };

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (emAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          emAspas = false;
        }
      } else {
        if (c === "\n") numeroDaLinha++;
        campo += c;
      }
      continue;
    }
    if (c === '"' && campo === "" && !campoComAspas) {
      emAspas = true;
      campoComAspas = true;
    } else if (c === separador) {
      fecharCampo();
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      numeroDaLinha++;
      fecharRegistro();
    } else {
      campo += c;
    }
  }
  if (emAspas) throw new ErroPlanilha(`Há aspas sem fechar perto da linha ${numeroDaLinha}. Confira o arquivo.`);
  if (campo !== "" || registro.length > 0 || campoComAspas) fecharRegistro();
  return registros;
}

const vazia = (linha: string[]) => linha.every((c) => c.trim() === "");

/**
 * Monta a planilha (cabeçalho + linhas) a partir de uma matriz de textos, já aplicando os limites.
 * Usada pelo CSV e pelo XLSX.
 */
export function planilhaDeMatriz(matriz: string[][]): Planilha {
  const linhasNaoVazias = matriz.filter((l) => !vazia(l));
  if (linhasNaoVazias.length === 0) throw new ErroPlanilha("O arquivo está vazio.");

  const [primeira, ...dados] = linhasNaoVazias;
  if (primeira.length > LIMITES_PLANILHA.colunas) {
    throw new ErroPlanilha(`A planilha passa de ${LIMITES_PLANILHA.colunas} colunas.`);
  }
  if (dados.length === 0) throw new ErroPlanilha("O arquivo só tem o cabeçalho, sem nenhuma linha de dados.");
  if (dados.length > LIMITES_PLANILHA.linhas) {
    throw new ErroPlanilha(
      `A planilha tem ${dados.length} linhas de dados; o limite é ${LIMITES_PLANILHA.linhas}. Divida o arquivo em partes.`,
    );
  }

  const cabecalho = primeira.map((c, i) => c.trim() || `Coluna ${i + 1}`);
  const largura = cabecalho.length;
  const linhas = dados.map((linha) => {
    const normalizada = Array.from({ length: largura }, (_, i) => (linha[i] ?? "").trim());
    for (const celula of normalizada) {
      if (celula.length > LIMITES_PLANILHA.caracteresPorCelula) {
        throw new ErroPlanilha(`Há uma célula com mais de ${LIMITES_PLANILHA.caracteresPorCelula} caracteres. Confira o arquivo.`);
      }
    }
    return normalizada;
  });
  return { cabecalho, linhas };
}

/** Texto CSV → planilha. Detecta o separador, ignora o BOM e as linhas em branco. */
export function lerCsv(texto: string): Planilha {
  const semBom = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  return planilhaDeMatriz(dividirRegistros(semBom, detectarSeparador(semBom)));
}
