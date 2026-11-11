/**
 * Parâmetros de listas (busca, ordenação e paginação no servidor) lidos da URL.
 * Tudo que vem da URL é dado não confiável: cada valor é validado contra o que a lista aceita.
 */

export type ParametrosBrutos = Record<string, string | string[] | undefined>;

export type ConfigLista = {
  /** Colunas pelas quais a lista pode ser ordenada (nomes internos). */
  ordenaveis: readonly string[];
  ordemPadrao: string;
  direcaoPadrao?: "asc" | "desc";
  tamanhoPadrao?: number;
};

export type ParametrosLista = {
  pagina: number;
  tamanho: number;
  busca: string;
  ordem: string;
  direcao: "asc" | "desc";
};

export const TAMANHOS_DE_PAGINA = [25, 50, 100] as const;
const TAMANHO_MAXIMO_BUSCA = 80;

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/** Texto de busca limpo: sem espaços nas pontas e com tamanho máximo. */
export function termoDeBusca(bruto: string | undefined): string {
  return (bruto ?? "").trim().slice(0, TAMANHO_MAXIMO_BUSCA);
}

export function lerParametrosLista(brutos: ParametrosBrutos, config: ConfigLista): ParametrosLista {
  const paginaLida = Number.parseInt(primeiro(brutos.pagina) ?? "", 10);
  const tamanhoLido = Number.parseInt(primeiro(brutos.tamanho) ?? "", 10);
  const ordemLida = primeiro(brutos.ordem);
  const direcaoLida = primeiro(brutos.direcao);
  const tamanhoPadrao = config.tamanhoPadrao ?? 25;

  return {
    pagina: Number.isSafeInteger(paginaLida) && paginaLida >= 1 ? paginaLida : 1,
    tamanho: (TAMANHOS_DE_PAGINA as readonly number[]).includes(tamanhoLido) ? tamanhoLido : tamanhoPadrao,
    busca: termoDeBusca(primeiro(brutos.busca)),
    ordem: ordemLida && config.ordenaveis.includes(ordemLida) ? ordemLida : config.ordemPadrao,
    direcao: direcaoLida === "asc" || direcaoLida === "desc" ? direcaoLida : (config.direcaoPadrao ?? "asc"),
  };
}

export type Paginacao = {
  pagina: number;
  paginas: number;
  total: number;
  /** Primeiro e último item mostrados (1-based; 0 quando a lista está vazia). */
  de: number;
  ate: number;
  skip: number;
  take: number;
};

/** Ajusta a página pedida ao total (página além do fim volta para a última). */
export function calcularPaginacao(total: number, paginaPedida: number, tamanho: number): Paginacao {
  const paginas = Math.max(1, Math.ceil(total / tamanho));
  const pagina = Math.min(Math.max(1, paginaPedida), paginas);
  const skip = (pagina - 1) * tamanho;
  return {
    pagina,
    paginas,
    total,
    de: total === 0 ? 0 : skip + 1,
    ate: Math.min(total, skip + tamanho),
    skip,
    take: tamanho,
  };
}

type ValorDeConsulta = string | number | boolean | null | undefined;

/** Monta "?a=1&b=2" ignorando o que está vazio. Devolve "" quando não sobra nada. */
export function montarConsulta(valores: Record<string, ValorDeConsulta>): string {
  const partes = new URLSearchParams();
  for (const [chave, valor] of Object.entries(valores)) {
    if (valor === undefined || valor === null || valor === "" || valor === false) continue;
    partes.set(chave, valor === true ? "1" : String(valor));
  }
  const texto = partes.toString();
  return texto ? `?${texto}` : "";
}

/** Endereço da mesma lista com algumas mudanças (por exemplo, outra página ou outra ordenação). */
export function hrefDaLista(base: string, atuais: Record<string, ValorDeConsulta>, mudancas: Record<string, ValorDeConsulta>): string {
  return `${base}${montarConsulta({ ...atuais, ...mudancas })}`;
}

/** Escapa os curingas do LIKE para o texto digitado valer literalmente, e envolve em %...%. */
export function padraoLike(termo: string): string {
  return `%${termo.replace(/[\\%_]/g, "\\$&")}%`;
}
