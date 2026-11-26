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

/** `desenho`: "automatico" ou "personalizado:<sha256>" (ver `marcaDoDesenho`); ausente = automático (revisões antigas e sem imagem). */
export type ItemComparavel = { descricao: string; medidas: string; precoTotalCentavos: number; desenho?: string };
export type OpcaoComparavel = { nome: string; totalCentavos: number; itens: ItemComparavel[] };
/** Forma de pagamento para comparar: o total dela em cada opção (pelo nome da opção). */
export type FormaComparavel = { nome: string; totais: { opcaoNome: string; totalCentavos: number }[] };
export type ConteudoComparavel = { numero: string; revisao: number; comNotaFiscal: boolean; opcoes: OpcaoComparavel[]; formas?: FormaComparavel[] };

/** Mudança do desenho do item entre as revisões (só aparece quando o desenho mudou de verdade). */
export type MudancaDeDesenho = "ADICIONADO" | "TROCADO" | "REMOVIDO";
export type DiferencaItem = { tipo: "ADICIONADO" | "REMOVIDO" | "ALTERADO"; descricao: string; medidas: string; antesCentavos: number | null; depoisCentavos: number | null; desenho?: MudancaDeDesenho };
export type DiferencaOpcao = { nome: string; situacao: "NOVA" | "REMOVIDA" | "MANTIDA"; totalAntesCentavos: number | null; totalDepoisCentavos: number | null; itens: DiferencaItem[] };
export type MudancaDeTotalDaForma = { opcaoNome: string; antesCentavos: number | null; depoisCentavos: number | null };
export type DiferencaForma = { nome: string; situacao: "NOVA" | "REMOVIDA" | "MANTIDA"; mudancas: MudancaDeTotalDaForma[] };
export type ResultadoComparacao = { notaFiscalMudou: boolean; opcoes: DiferencaOpcao[]; formas: DiferencaForma[]; semMudancas: boolean };

const chaveDoItem = (i: ItemComparavel) => `${i.descricao.trim().toLowerCase()}|${i.medidas}`;
const AUTOMATICO = "automatico";
const desenhoDe = (i: ItemComparavel) => i.desenho ?? AUTOMATICO;

function mudancaDoDesenho(antes: ItemComparavel, depois: ItemComparavel): MudancaDeDesenho | null {
  const a = desenhoDe(antes);
  const d = desenhoDe(depois);
  if (a === d) return null;
  return a === AUTOMATICO ? "ADICIONADO" : d === AUTOMATICO ? "REMOVIDO" : "TROCADO";
}

/** Compara duas revisões: opções por nome; itens pela descrição + medidas (preço ou desenho personalizado diferente = alterado). */
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
        const desenho = mudancaDoDesenho(ia, id);
        if (id.precoTotalCentavos !== ia.precoTotalCentavos || desenho) {
          itens.push({ tipo: "ALTERADO", descricao: ia.descricao, medidas: ia.medidas, antesCentavos: ia.precoTotalCentavos, depoisCentavos: id.precoTotalCentavos, ...(desenho ? { desenho } : {}) });
        }
      }
      for (const id of restantes) itens.push({ tipo: "ADICIONADO", descricao: id.descricao, medidas: id.medidas, antesCentavos: null, depoisCentavos: id.precoTotalCentavos });
    } else if (d) {
      for (const id of d.itens) itens.push({ tipo: "ADICIONADO", descricao: id.descricao, medidas: id.medidas, antesCentavos: null, depoisCentavos: id.precoTotalCentavos });
    } else if (a) {
      for (const ia of a.itens) itens.push({ tipo: "REMOVIDO", descricao: ia.descricao, medidas: ia.medidas, antesCentavos: ia.precoTotalCentavos, depoisCentavos: null });
    }
    opcoes.push({ nome, situacao: a && d ? "MANTIDA" : d ? "NOVA" : "REMOVIDA", totalAntesCentavos: a?.totalCentavos ?? null, totalDepoisCentavos: d?.totalCentavos ?? null, itens });
  }
  // Formas de pagamento (por nome): entrou, saiu ou mudou de total em alguma opção. Sem formas extras nos dois lados: lista vazia.
  const formas: DiferencaForma[] = [];
  const nomesDasFormas = new Set([...(antes.formas ?? []).map((f) => f.nome), ...(depois.formas ?? []).map((f) => f.nome)]);
  for (const nome of nomesDasFormas) {
    const fa = (antes.formas ?? []).find((f) => f.nome === nome);
    const fd = (depois.formas ?? []).find((f) => f.nome === nome);
    const nomesDasOpcoes = new Set([...(fa?.totais ?? []).map((t) => t.opcaoNome), ...(fd?.totais ?? []).map((t) => t.opcaoNome)]);
    const mudancas: MudancaDeTotalDaForma[] = [];
    for (const opcaoNome of nomesDasOpcoes) {
      const a = fa?.totais.find((t) => t.opcaoNome === opcaoNome)?.totalCentavos ?? null;
      const d = fd?.totais.find((t) => t.opcaoNome === opcaoNome)?.totalCentavos ?? null;
      if (a !== d) mudancas.push({ opcaoNome, antesCentavos: a, depoisCentavos: d });
    }
    formas.push({ nome, situacao: fa && fd ? "MANTIDA" : fd ? "NOVA" : "REMOVIDA", mudancas });
  }
  const notaFiscalMudou = antes.comNotaFiscal !== depois.comNotaFiscal;
  const semMudancas = !notaFiscalMudou && formas.every((f) => f.situacao === "MANTIDA" && f.mudancas.length === 0) && opcoes.every((o) => o.situacao === "MANTIDA" && o.itens.length === 0 && o.totalAntesCentavos === o.totalDepoisCentavos);
  return { notaFiscalMudou, opcoes, formas, semMudancas };
}
