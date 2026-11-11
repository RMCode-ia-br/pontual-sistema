/** Listas que aceitam filtros salvos (o nome é o caminho da lista, sem a barra). */
export const TELAS_COM_FILTRO_SALVO = ["clientes", "parceiros", "fornecedores", "funcionarios", "produtos"] as const;
export type TelaComFiltroSalvo = (typeof TELAS_COM_FILTRO_SALVO)[number];

/** Parâmetros que descrevem o FILTRO (a página e o tamanho não entram: valem para a visita, não para o filtro). */
const PARAMETROS_DE_FILTRO = new Set(["busca", "tipo", "marcacao", "origem", "situacao", "categoria", "linha", "fornecedor", "funcao", "custo", "parado", "ordem", "direcao"]);

/** Deixa só parâmetros conhecidos, sem repetição e sem valores vazios. */
export function limparConsulta(consulta: string): string {
  const origem = new URLSearchParams(consulta.replace(/^\?/, ""));
  const limpa = new URLSearchParams();
  for (const [chave, valor] of origem) {
    if (PARAMETROS_DE_FILTRO.has(chave) && valor.trim() !== "" && !limpa.has(chave)) limpa.set(chave, valor.slice(0, 80));
  }
  return limpa.toString();
}
