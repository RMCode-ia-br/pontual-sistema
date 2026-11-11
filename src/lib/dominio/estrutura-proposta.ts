/**
 * Estrutura de exibição da proposta: dentro de cada opção, as seções (grupos) na ordem escolhida, os itens de cada
 * seção na ordem escolhida e a NUMERAÇÃO AUTOMÁTICA contínua (1, 2, 3…). Itens sem grupo vêm primeiro.
 * Usada pelo editor, pelo PDF e pelo congelamento (snapshot), para os três mostrarem a mesma numeração.
 */

export type GrupoBase = { id: string; nome: string; ordem: number };
export type ItemBase = { id: string; opcaoId: string; grupoId: string | null; ordem: number };

export type Secao<I extends ItemBase, G extends GrupoBase> = { grupo: G | null; itens: { numero: number; item: I }[] };

export function montarSecoes<I extends ItemBase, G extends GrupoBase>(opcaoId: string, grupos: G[], itens: I[]): Secao<I, G>[] {
  const daOpcao = itens.filter((i) => i.opcaoId === opcaoId);
  const porOrdem = (a: ItemBase, b: ItemBase) => a.ordem - b.ordem || a.id.localeCompare(b.id);
  const idsDeGrupos = new Set(grupos.map((g) => g.id));
  const blocos: { grupo: G | null; itens: I[] }[] = [];

  // Itens cujo grupo não existe mais (ou sem grupo) ficam na primeira seção, sem título.
  const semGrupo = daOpcao.filter((i) => i.grupoId === null || !idsDeGrupos.has(i.grupoId)).sort(porOrdem);
  if (semGrupo.length > 0) blocos.push({ grupo: null, itens: semGrupo });
  for (const g of [...grupos].sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id))) {
    const doGrupo = daOpcao.filter((i) => i.grupoId === g.id).sort(porOrdem);
    if (doGrupo.length > 0) blocos.push({ grupo: g, itens: doGrupo });
  }

  let numero = 0;
  return blocos.map((b) => ({ grupo: b.grupo, itens: b.itens.map((item) => ({ numero: ++numero, item })) }));
}

/** Vizinho para "subir/descer": devolve a nova ordem (ids) ou null se já está na ponta. */
export function mover<T extends { id: string }>(lista: T[], id: string, direcao: "acima" | "abaixo"): string[] | null {
  const ids = lista.map((x) => x.id);
  const i = ids.indexOf(id);
  if (i < 0) return null;
  const j = direcao === "acima" ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return null;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}
