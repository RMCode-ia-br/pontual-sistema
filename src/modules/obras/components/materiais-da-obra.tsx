import { Boxes, ShoppingCart } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ROTULO_STATUS_DA_COMPRA } from "@/lib/dominio/compras";
import { formatarMoeda } from "@/lib/formatadores";

import type { MateriaisDaObra } from "../queries-materiais";

const sigla = (u: string) => u.toLowerCase();
const nf = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/**
 * Aba "Materiais e compras" da obra: lista de materiais pela composição das propostas aprovadas (necessário × estoque), pedido
 * de vidro, compras da obra e retalhos. Não é plano de corte (isso é evolução futura, com o programa do fornecedor).
 */
export function MateriaisDaObra({ projetoId, m }: { projetoId: string; m: MateriaisDaObra }) {
  const faltam = m.linhas.filter((l) => l.produtoId && l.falta !== null && l.falta > 0);
  const aPedir = m.vidros.filter((v) => !v.compra);
  const hrefMaterial = `/compras/nova?obra=${projetoId}&itens=${encodeURIComponent(faltam.map((l) => `${l.produtoId}:${l.falta}`).join(","))}`;
  const hrefVidro = `/compras/nova?tipo=VIDRO&obra=${projetoId}&vidros=${encodeURIComponent(aPedir.map((v) => v.medidaId).join(","))}`;

  return (
    <div className="grid max-w-4xl gap-8">
      <section aria-labelledby="titulo-lista" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titulo-lista" className="flex items-center gap-2 font-medium">
            <Boxes className="size-4" aria-hidden /> Lista de materiais
          </h2>
          {faltam.length > 0 ? (
            <Link href={hrefMaterial} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ShoppingCart aria-hidden /> Montar compra do que falta ({faltam.length})
            </Link>
          ) : null}
        </div>
        {m.propostas.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">A obra ainda não tem proposta aprovada: a lista nasce da composição das propostas aprovadas.</p>
        ) : (
          <>
            <p className="text-muted-foreground text-xs">
              Pelas propostas aprovadas ({m.propostas.map((p) => `${p.numero}${p.revisao > 0 ? ` Rev. ${p.revisao}` : ""}`).join(", ")}), com a perda de corte da composição. É a necessidade total de cada insumo, não um plano de corte (a lista de corte do programa do fornecedor é uma evolução futura).
            </p>
            {m.linhas.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Nenhum item das propostas tem composição cadastrada, então não há quantidade para calcular. Cadastre a composição em Tipologias e preços: o sistema não inventa quantidade.</p>
            ) : (
              <ul className="grid gap-2">
                {m.linhas.map((l) => (
                  <li key={l.chave} className="grid gap-1 rounded-xl border p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
                    <div className="grid gap-0.5">
                      <p className="font-medium">
                        {l.produtoId ? (
                          <Link href={`/produtos/${l.produtoId}?aba=estoque`} className="hover:underline">
                            {l.codigo} · {l.produto}
                          </Link>
                        ) : (
                          l.produto
                        )}
                        {l.semCusto ? <Badge variant="outline" className="ml-2">Sem custo</Badge> : null}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Precisa de {nf(l.necessario)} {sigla(l.unidadeFormula)}
                        {l.equivalencias && l.unidadeFormula === "M" ? ` (${l.equivalencias.barras !== null ? `${l.equivalencias.barras} barra(s)` : "barras: falta o comprimento da barra"}${l.equivalencias.kg !== null ? ` · ${nf(l.equivalencias.kg)} kg` : ""})` : ""}
                        {!l.produtoId ? " · insumo sem produto cadastrado (sem controle de estoque)" : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      {l.saldo !== null && l.unidadeProduto ? (
                        <p className="tabular-nums">
                          Em estoque: {nf(l.saldo)} {sigla(l.unidadeProduto)}
                        </p>
                      ) : null}
                      {l.falta === null ? (
                        l.produtoId ? <p className="text-muted-foreground text-xs">Sem como comparar (falta peso ou comprimento no produto)</p> : null
                      ) : l.falta > 0 ? (
                        <p className="font-medium text-amber-700 tabular-nums dark:text-amber-400">
                          Falta {nf(l.falta)} {sigla(l.unidadeProduto ?? l.unidadeFormula)}
                        </p>
                      ) : (
                        <p className="text-emerald-700 dark:text-emerald-400">Tem em estoque</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {m.semComposicao.length > 0 ? (
              <div role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p className="font-medium">Itens sem quantidade calculada</p>
                <ul className="list-disc pl-5">
                  {m.semComposicao.map((s) => (
                    <li key={`${s.proposta}-${s.itemNumero}`}>
                      Item {s.itemNumero} da proposta {s.proposta} ({s.descricao}): {s.motivo}.
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section aria-labelledby="titulo-vidro" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titulo-vidro" className="font-medium">
            Pedido de vidro
          </h2>
          {aPedir.length > 0 ? (
            <Link href={hrefVidro} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ShoppingCart aria-hidden /> Montar pedido de vidro ({aPedir.length})
            </Link>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">O vão é só referência: a medida do vidro se digita no pedido, depois de conferir as esquadrias instaladas (o sistema não presume folga nem desconto).</p>
        {m.vidros.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Nenhum item aprovado tem tipo de vidro definido.</p>
        ) : (
          <ul className="grid gap-2">
            {m.vidros.map((v) => (
              <li key={v.medidaId} className="grid gap-1 rounded-xl border p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
                <div className="grid gap-0.5">
                  <p className="font-medium">
                    Item {v.itemNumero} ({v.proposta}): {v.tipoVidro}
                    {v.espessuraMm ? ` ${v.espessuraMm} mm` : ""} · {v.quantidade} un
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Vão {v.vaoLarguraMm} × {v.vaoAlturaMm} mm{v.local ? ` · ${v.local}` : ""} · {v.descricao}
                  </p>
                </div>
                <div className="text-right">
                  {v.compra ? (
                    <Link href={`/compras/${v.compra.id}`} className="hover:underline">
                      Pedido {v.compra.numero} · {ROTULO_STATUS_DA_COMPRA[v.compra.status]}
                    </Link>
                  ) : (
                    <Badge variant="outline">Falta pedir</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="titulo-compras" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titulo-compras" className="font-medium">
            Compras desta obra
          </h2>
          <Link href={`/compras/nova?obra=${projetoId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Nova compra para a obra
          </Link>
        </div>
        {m.compras.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Nenhuma compra com destino a esta obra.</p>
        ) : (
          <ul className="grid gap-2">
            {m.compras.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
                <Link href={`/compras/${c.id}`} className="font-medium hover:underline">
                  {c.numero} · {c.fornecedor}
                </Link>
                <span className="text-muted-foreground tabular-nums">
                  {c.tipo === "VIDRO" ? "Vidro" : "Material"} · {ROTULO_STATUS_DA_COMPRA[c.status]}
                  {c.recebidoCentavos !== null ? ` · recebido ${formatarMoeda(c.recebidoCentavos)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="titulo-retalhos" className="grid gap-3">
        <h2 id="titulo-retalhos" className="font-medium">
          Retalhos
        </h2>
        {m.retalhosGerados.length === 0 && m.retalhosUsados.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Nenhum retalho gerado nem usado nesta obra. A baixa de perfil por corte de barra se faz na aba Estoque do perfil.</p>
        ) : (
          <ul className="grid gap-1.5 text-sm">
            {m.retalhosGerados.map((r) => (
              <li key={r.id} className="rounded-lg border px-3 py-2">
                Sobrou {r.comprimentoMm.toLocaleString("pt-BR")} mm de {r.produto} ({r.status === "DISPONIVEL" ? "disponível" : r.status === "CONSUMIDO" ? "já usado em outra obra" : "descartado"})
              </li>
            ))}
            {m.retalhosUsados.map((r) => (
              <li key={r.id} className="rounded-lg border px-3 py-2">
                Usou o retalho de {r.comprimentoMm.toLocaleString("pt-BR")} mm de {r.produto} (custo contado na obra de origem)
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground text-xs">
          Saídas de estoque desta obra: veja em <Link href={`/estoque/movimentacoes?obra=${projetoId}`} className="underline">Movimentações</Link>.
        </p>
      </section>
    </div>
  );
}

