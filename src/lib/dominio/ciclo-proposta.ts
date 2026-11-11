/**
 * Ciclo de vida da proposta (R4/R5): o que precisa estar pronto para enviar, quais transições são válidas e a
 * comparação simples entre revisões. Código puro e testável.
 */

export type StatusProposta = "RASCUNHO" | "ENVIADA" | "APROVADA" | "RECUSADA" | "EXPIRADA" | "SUBSTITUIDA" | "CANCELADA";

/** Quem pode virar o quê. Aprovar a partir de rascunho congela antes (mesma transação). */
export const TRANSICOES: Record<StatusProposta, StatusProposta[]> = {
  RASCUNHO: ["ENVIADA", "APROVADA", "CANCELADA"],
  ENVIADA: ["APROVADA", "RECUSADA", "EXPIRADA", "SUBSTITUIDA", "CANCELADA"],
  APROVADA: [],
  RECUSADA: [],
  EXPIRADA: ["APROVADA"],
  SUBSTITUIDA: [],
  CANCELADA: [],
};

export function podeTransitar(de: StatusProposta, para: StatusProposta): boolean {
  return TRANSICOES[de].includes(para);
}

/** Nova revisão só de proposta já enviada que não está mais em vigor para edição. */
export function podeCriarRevisao(status: StatusProposta): boolean {
  return status === "ENVIADA" || status === "RECUSADA" || status === "EXPIRADA";
}

export type DadosParaEnvio = {
  clienteNome: string;
  condicao: { temParcelas: boolean; textoLivre: string | null };
  opcoes: { nome: string; itens: { descricao: string; precoTotalCentavos: number; medidas: number }[] }[];
};

/** Lista (em português) o que falta para a proposta poder ser enviada. Vazia = pronta. */
export function problemasParaEnviar(d: DadosParaEnvio): string[] {
  const p: string[] = [];
  if (d.clienteNome.trim() === "") p.push("Informe o nome do cliente.");
  if (d.opcoes.length === 0) p.push("A proposta não tem nenhuma opção.");
  for (const o of d.opcoes) {
    const nome = d.opcoes.length > 1 ? ` da opção "${o.nome}"` : "";
    if (o.itens.length === 0) p.push(`Adicione ao menos um item${nome}.`);
    const semValor = o.itens.filter((i) => i.precoTotalCentavos <= 0).length;
    if (semValor > 0) p.push(`${semValor} ${semValor === 1 ? "item está sem valor" : "itens estão sem valor"}${nome}.`);
    const semMedida = o.itens.filter((i) => i.medidas === 0).length;
    if (semMedida > 0) p.push(`${semMedida} ${semMedida === 1 ? "item está sem medida" : "itens estão sem medida"}${nome}.`);
    const semDescricao = o.itens.filter((i) => i.descricao.trim() === "").length;
    if (semDescricao > 0) p.push(`${semDescricao} ${semDescricao === 1 ? "item está sem descrição" : "itens estão sem descrição"}${nome}.`);
  }
  if (!d.condicao.temParcelas && !(d.condicao.textoLivre ?? "").trim()) p.push("Escolha a condição de pagamento (ou escreva o texto livre).");
  return p;
}

// ----- Comparação entre revisões -----

export type ItemComparavel = { descricao: string; medidas: string; precoTotalCentavos: number };
export type OpcaoComparavel = { nome: string; totalCentavos: number; itens: ItemComparavel[] };
export type ConteudoComparavel = { numero: string; revisao: number; comNotaFiscal: boolean; opcoes: OpcaoComparavel[] };

export type DiferencaItem = { tipo: "ADICIONADO" | "REMOVIDO" | "ALTERADO"; descricao: string; medidas: string; antesCentavos: number | null; depoisCentavos: number | null };
export type DiferencaOpcao = { nome: string; situacao: "NOVA" | "REMOVIDA" | "MANTIDA"; totalAntesCentavos: number | null; totalDepoisCentavos: number | null; itens: DiferencaItem[] };
export type ResultadoComparacao = { notaFiscalMudou: boolean; opcoes: DiferencaOpcao[]; semMudancas: boolean };

const chaveDoItem = (i: ItemComparavel) => `${i.descricao.trim().toLowerCase()}|${i.medidas}`;

/** Compara duas revisões: opções por nome; itens pela descrição + medidas (preço diferente = alterado). */
export function compararRevisoes(antes: ConteudoComparavel, depois: ConteudoComparavel): ResultadoComparacao {
  const opcoes: DiferencaOpcao[] = [];
  const nomes = new Set([...antes.opcoes.map((o) => o.nome), ...depois.opcoes.map((o) => o.nome)]);
  for (const nome of nomes) {
    const a = antes.opcoes.find((o) => o.nome === nome);
    const d = depois.opcoes.find((o) => o.nome === nome);
    const itens: DiferencaItem[] = [];
    if (a && d) {
      const restantes = [...d.itens];
      for (const ia of a.itens) {
        const idx = restantes.findIndex((x) => chaveDoItem(x) === chaveDoItem(ia));
        if (idx < 0) {
          itens.push({ tipo: "REMOVIDO", descricao: ia.descricao, medidas: ia.medidas, antesCentavos: ia.precoTotalCentavos, depoisCentavos: null });
          continue;
        }
        const [id] = restantes.splice(idx, 1);
        if (id.precoTotalCentavos !== ia.precoTotalCentavos) itens.push({ tipo: "ALTERADO", descricao: ia.descricao, medidas: ia.medidas, antesCentavos: ia.precoTotalCentavos, depoisCentavos: id.precoTotalCentavos });
      }
      for (const id of restantes) itens.push({ tipo: "ADICIONADO", descricao: id.descricao, medidas: id.medidas, antesCentavos: null, depoisCentavos: id.precoTotalCentavos });
    } else if (d) {
      for (const id of d.itens) itens.push({ tipo: "ADICIONADO", descricao: id.descricao, medidas: id.medidas, antesCentavos: null, depoisCentavos: id.precoTotalCentavos });
    } else if (a) {
      for (const ia of a.itens) itens.push({ tipo: "REMOVIDO", descricao: ia.descricao, medidas: ia.medidas, antesCentavos: ia.precoTotalCentavos, depoisCentavos: null });
    }
    opcoes.push({ nome, situacao: a && d ? "MANTIDA" : d ? "NOVA" : "REMOVIDA", totalAntesCentavos: a?.totalCentavos ?? null, totalDepoisCentavos: d?.totalCentavos ?? null, itens });
  }
  const notaFiscalMudou = antes.comNotaFiscal !== depois.comNotaFiscal;
  const semMudancas = !notaFiscalMudou && opcoes.every((o) => o.situacao === "MANTIDA" && o.itens.length === 0 && o.totalAntesCentavos === o.totalDepoisCentavos);
  return { notaFiscalMudou, opcoes, semMudancas };
}
