import type { ChamadoDaLista } from "./queries-chamados";
import type { MateriaisDaObra } from "./queries-materiais";

/**
 * Remove valores de dados de OBRA no servidor, antes de chegarem à tela (Fase 7C): quem não pode ver valores (Campo) não
 * recebe o número nem no HTML. Funções puras; os componentes já aceitam `null` nesses campos.
 */

/** Compras da obra perdem o valor recebido sem "ver valores"; o aviso "sem custo" do produto some sem "ver custo e margem". */
export function semValoresNosMateriais(m: MateriaisDaObra, acesso: { valores: boolean; custo: boolean }): MateriaisDaObra {
  return {
    ...m,
    linhas: acesso.custo ? m.linhas : m.linhas.map((l) => ({ ...l, semCusto: false })),
    compras: acesso.valores ? m.compras : m.compras.map((c) => ({ ...c, recebidoCentavos: null })),
  };
}

/** Chamados perdem o valor da visita cobrada sem "ver valores" ("Visita a cobrar" continua, sem o número). */
export function semValoresNosChamados<T extends Pick<ChamadoDaLista, "valorCobradoCentavos">>(linhas: readonly T[], podeVerValores: boolean): T[] {
  return podeVerValores ? [...linhas] : linhas.map((c) => ({ ...c, valorCobradoCentavos: null }));
}
