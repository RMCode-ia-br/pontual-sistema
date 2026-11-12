"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CampoMascarado } from "@/components/campo-mascarado";
import { AreaTexto, CaixaMarcacao, Campo, Selecao } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lerQuantidade } from "@/lib/dominio/estoque";
import { formatarMoeda, parseMoedaParaCentavos } from "@/lib/formatadores";
import { centavosParaCampo, mascararMoeda } from "@/lib/formatadores/mascaras";
import { CampoProjeto } from "@/modules/agenda/components/campo-projeto";
import { CampoFornecedor } from "@/modules/fornecedores/components/campo-fornecedor";
import { CampoProduto } from "@/modules/produtos/components/campo-produto";
import type { ProdutoParaEscolha } from "@/modules/produtos/actions/rapido";
import { ROTULO_UNIDADE, UNIDADES } from "@/modules/produtos/schemas";

import { atualizarCompraAcao, criarCompraAcao } from "../actions";
import type { CompraDetalhe } from "../queries";

export type ItemInicial = {
  id?: string;
  produto: { id: string; rotulo: string; unidade: string; custoPorKg: boolean } | null;
  descricao: string;
  unidadeCompra: string;
  /** Texto digitado ("2,5"). */
  quantidade: string;
  preco: string;
  larguraMm?: string;
  alturaMm?: string;
  espessuraMm?: string;
  tipoVidroId?: string;
  beneficiamentos?: string;
  itemPropostaId?: string;
  itemPropostaMedidaId?: string;
  recebida?: boolean;
};

type ItemEstado = ItemInicial & { chave: string; avulso: boolean };

type Props = {
  opcoes: { tiposDeVidro: { id: string; nome: string }[] };
  compra?: CompraDetalhe;
  /** Valores de partida de uma compra nova (ex.: vinda da lista de materiais ou do pedido de vidro da obra). */
  inicial?: { tipo?: "MATERIAL" | "VIDRO"; destino?: "ESTOQUE" | "OBRA"; projeto?: { id: string; rotulo: string } | null; itens?: ItemInicial[]; observacao?: string };
};

let contador = 0;
const novaChave = () => `i${++contador}`;

const itemVazio = (tipo: "MATERIAL" | "VIDRO"): ItemEstado => ({ chave: novaChave(), produto: null, avulso: false, descricao: tipo === "VIDRO" ? "Vidro" : "", unidadeCompra: tipo === "VIDRO" ? "UN" : "UN", quantidade: "", preco: "" });

function doItemDetalhe(i: CompraDetalhe["itens"][number]): ItemEstado {
  return {
    chave: novaChave(),
    id: i.id,
    produto: i.produtoId ? { id: i.produtoId, rotulo: `${i.codigoProduto} · ${i.produto}`, unidade: i.unidadeProduto ?? "UN", custoPorKg: i.custoPorKg } : null,
    avulso: !i.produtoId,
    descricao: i.descricao ?? "",
    unidadeCompra: i.unidadeCompra,
    quantidade: (i.quantidadeMilesimos / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 }),
    preco: centavosParaCampo(i.precoUnitarioCentavos),
    larguraMm: i.larguraMm?.toString() ?? "",
    alturaMm: i.alturaMm?.toString() ?? "",
    espessuraMm: i.espessuraMm?.toString() ?? "",
    tipoVidroId: i.tipoVidroId ?? "",
    beneficiamentos: i.beneficiamentos ?? "",
    itemPropostaId: i.itemPropostaId ?? "",
    itemPropostaMedidaId: i.itemPropostaMedidaId ?? "",
    recebida: i.recebidaMilesimos > 0,
  };
}

/** Unidades que o item pode ter: a do produto e, em perfil (barra ou metro), também kg; item avulso, qualquer uma. */
function unidadesDoItem(i: ItemEstado): readonly string[] {
  if (i.produto && !i.avulso) return i.produto.unidade === "BARRA" || i.produto.unidade === "M" ? [i.produto.unidade, "KG"] : [i.produto.unidade];
  return UNIDADES;
}

export function FormCompra({ opcoes, compra, inicial }: Props) {
  const router = useRouter();
  const editando = !!compra;
  const recebeu = !!compra?.itens.some((i) => i.recebidaMilesimos > 0);
  const [fornecedor, setFornecedor] = useState<{ id: string; nome: string } | null>(compra ? { id: compra.fornecedorId, nome: compra.fornecedor } : null);
  const [tipo, setTipo] = useState<"MATERIAL" | "VIDRO">(compra?.tipo ?? inicial?.tipo ?? "MATERIAL");
  const [destino, setDestino] = useState<"ESTOQUE" | "OBRA">(compra?.destino ?? inicial?.destino ?? "ESTOQUE");
  const [projeto, setProjeto] = useState<{ id: string; rotulo: string } | null>(compra?.projetoId ? { id: compra.projetoId, rotulo: compra.obra ?? "" } : (inicial?.projeto ?? null));
  const [previsao, setPrevisao] = useState(compra?.previsaoEntrega ?? "");
  const [condicoes, setCondicoes] = useState(compra?.condicoes ?? "");
  const [observacao, setObservacao] = useState(compra?.observacao ?? inicial?.observacao ?? "");
  const [itens, setItens] = useState<ItemEstado[]>(() => (compra ? compra.itens.map(doItemDetalhe) : inicial?.itens?.length ? inicial.itens.map((i) => ({ ...i, chave: novaChave(), avulso: !i.produto })) : [itemVazio(inicial?.tipo ?? "MATERIAL")]));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [geral, setGeral] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const mudarItem = (chave: string, mudanca: Partial<ItemEstado>) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)));

  function enviar(fazerPedido: boolean) {
    setErros({});
    setGeral(null);
    const payload = {
      fornecedorId: fornecedor?.id ?? "",
      tipo,
      destino,
      projetoId: destino === "OBRA" ? (projeto?.id ?? "") : "",
      previsaoEntrega: previsao,
      condicoes,
      observacao,
      fazerPedido,
      itens: itens.map((i) => ({
        id: i.id ?? null,
        produtoId: i.avulso ? null : (i.produto?.id ?? null),
        descricao: i.avulso || tipo === "VIDRO" || !i.produto ? i.descricao : null,
        unidadeCompra: i.unidadeCompra,
        quantidade: i.quantidade,
        preco: i.preco,
        larguraMm: i.larguraMm ?? "",
        alturaMm: i.alturaMm ?? "",
        espessuraMm: i.espessuraMm ?? "",
        tipoVidroId: i.tipoVidroId ?? "",
        beneficiamentos: i.beneficiamentos ?? "",
        itemPropostaId: i.itemPropostaId ?? "",
        itemPropostaMedidaId: i.itemPropostaMedidaId ?? "",
      })),
    };
    iniciar(async () => {
      const r = editando ? await atualizarCompraAcao(compra!.id, payload) : await criarCompraAcao(payload);
      if (r.ok && r.dados) {
        toast.success(r.mensagem ?? "Salvo.");
        router.push(`/compras/${r.dados.id}`);
      } else if (!r.ok) {
        setErros(r.campos ?? {});
        setGeral(r.erro);
      }
    });
  }

  const totalItens = itens.reduce(
    (s, i) => {
      const q = lerQuantidade(i.quantidade);
      const p = i.preco.trim() === "" ? null : parseMoedaParaCentavos(i.preco);
      if (q === null || p === null) return { ...s, semPreco: s.semPreco + (q === null ? 0 : 1) };
      return { ...s, total: s.total + Math.round((q * p) / 1000) };
    },
    { total: 0, semPreco: 0 },
  );

  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        enviar(false);
      }}
    >
      {recebeu ? (
        <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Esta compra já recebeu material: fornecedor, tipo, destino e obra não mudam mais, e os itens recebidos ficam travados (dá para ajustar a quantidade do pedido, sem ficar abaixo do que já chegou).
        </p>
      ) : null}

      <section aria-labelledby="sec-compra" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-compra" className="font-medium sm:col-span-2">
          Pedido
        </h2>
        <Campo id="cmp-fornecedor" rotulo="Fornecedor" erro={erros.fornecedorId} obrigatorio className="sm:col-span-2" dica="Não está na lista? Digite o nome e use “Cadastrar”.">
          {recebeu ? <span className="bg-muted flex min-h-9 items-center rounded-lg px-3 text-sm">{fornecedor?.nome}</span> : <CampoFornecedor id="cmp-fornecedor" name="fornecedorId" inicial={fornecedor} aoMudar={setFornecedor} />}
        </Campo>
        <Campo id="cmp-tipo" rotulo="Tipo" erro={erros.tipo} obrigatorio>
          <Selecao id="cmp-tipo" value={tipo} disabled={recebeu} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="MATERIAL">Material (perfis, ferragens, acessórios)</option>
            <option value="VIDRO">Vidro sob medida</option>
          </Selecao>
        </Campo>
        <Campo id="cmp-destino" rotulo="Destino" erro={erros.destino} obrigatorio dica={destino === "OBRA" ? "Custo direto da obra: não passa pelo estoque (típico dos vidros sob medida)." : "Dá entrada no estoque ao receber."}>
          <Selecao id="cmp-destino" value={destino} disabled={recebeu} onChange={(e) => setDestino(e.target.value as typeof destino)}>
            <option value="ESTOQUE">Estoque</option>
            <option value="OBRA">Obra (custo direto)</option>
          </Selecao>
        </Campo>
        {destino === "OBRA" ? (
          <Campo id="cmp-obra" rotulo="Obra" erro={erros.projetoId} obrigatorio className="sm:col-span-2" dica="Obras aprovadas, em execução ou concluídas.">
            {recebeu ? <span className="bg-muted flex min-h-9 items-center rounded-lg px-3 text-sm">{projeto?.rotulo}</span> : <CampoProjeto id="cmp-obra" name="projetoId" inicial={projeto} aoMudar={(p) => setProjeto(p ? { id: p.id, rotulo: p.rotulo } : null)} />}
          </Campo>
        ) : null}
        <Campo id="cmp-previsao" rotulo="Previsão de entrega (opcional)" erro={erros.previsaoEntrega}>
          <Input id="cmp-previsao" type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
        </Campo>
        <Campo id="cmp-condicoes" rotulo="Condições (opcional)" erro={erros.condicoes} dica="Ex.: pagamento em 28 dias, frete por conta do fornecedor.">
          <Input id="cmp-condicoes" value={condicoes} onChange={(e) => setCondicoes(e.target.value)} maxLength={300} autoComplete="off" />
        </Campo>
      </section>

      <section aria-labelledby="sec-itens" className="grid gap-3 rounded-xl border p-4">
        <h2 id="sec-itens" className="font-medium">
          Itens
        </h2>
        {erros.itens ? (
          <p role="alert" className="text-destructive text-sm">
            {erros.itens}
          </p>
        ) : null}
        <ul className="grid gap-3">
          {itens.map((i, n) => {
            const travado = i.recebida === true;
            const e = (c: string) => erros[`item:${n}:${c}`];
            return (
              <li key={i.chave} className="grid gap-3 rounded-lg border p-3" aria-label={`Item ${n + 1}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Item {n + 1}</p>
                  <Button type="button" variant="ghost" size="sm" disabled={travado || itens.length === 1} onClick={() => setItens((l) => l.filter((x) => x.chave !== i.chave))} aria-label={`Remover o item ${n + 1}`}>
                    <Trash2 aria-hidden /> Remover
                  </Button>
                </div>

                {tipo === "VIDRO" ? (
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Campo id={`d-${i.chave}`} rotulo="Descrição" className="sm:col-span-4">
                      <Input id={`d-${i.chave}`} value={i.descricao} disabled={travado} onChange={(ev) => mudarItem(i.chave, { descricao: ev.target.value })} maxLength={200} autoComplete="off" />
                    </Campo>
                    <Campo id={`l-${i.chave}`} rotulo="Largura (mm)">
                      <Input id={`l-${i.chave}`} inputMode="numeric" value={i.larguraMm ?? ""} onChange={(ev) => mudarItem(i.chave, { larguraMm: ev.target.value })} maxLength={6} autoComplete="off" />
                    </Campo>
                    <Campo id={`a-${i.chave}`} rotulo="Altura (mm)">
                      <Input id={`a-${i.chave}`} inputMode="numeric" value={i.alturaMm ?? ""} onChange={(ev) => mudarItem(i.chave, { alturaMm: ev.target.value })} maxLength={6} autoComplete="off" />
                    </Campo>
                    <Campo id={`e-${i.chave}`} rotulo="Espessura (mm)">
                      <Input id={`e-${i.chave}`} inputMode="numeric" value={i.espessuraMm ?? ""} onChange={(ev) => mudarItem(i.chave, { espessuraMm: ev.target.value })} maxLength={4} autoComplete="off" />
                    </Campo>
                    <Campo id={`t-${i.chave}`} rotulo="Tipo de vidro">
                      <Selecao id={`t-${i.chave}`} value={i.tipoVidroId ?? ""} onChange={(ev) => mudarItem(i.chave, { tipoVidroId: ev.target.value })}>
                        <option value="">—</option>
                        {opcoes.tiposDeVidro.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nome}
                          </option>
                        ))}
                      </Selecao>
                    </Campo>
                    <Campo id={`b-${i.chave}`} rotulo="Beneficiamentos (opcional)" className="sm:col-span-4" dica="Ex.: temperado, lapidado, furos, canto arredondado.">
                      <Input id={`b-${i.chave}`} value={i.beneficiamentos ?? ""} onChange={(ev) => mudarItem(i.chave, { beneficiamentos: ev.target.value })} maxLength={200} autoComplete="off" />
                    </Campo>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {i.avulso ? (
                      <Campo id={`d-${i.chave}`} rotulo="Descrição do item avulso" erro={e("descricao")}>
                        <Input id={`d-${i.chave}`} value={i.descricao} disabled={travado} onChange={(ev) => mudarItem(i.chave, { descricao: ev.target.value })} maxLength={200} autoComplete="off" />
                      </Campo>
                    ) : (
                      <Campo id={`p-${i.chave}`} rotulo="Produto" dica="Não está na lista? Digite o nome e use “Cadastrar”.">
                        {travado ? (
                          <span className="bg-muted flex min-h-9 items-center rounded-lg px-3 text-sm">{i.produto?.rotulo}</span>
                        ) : (
                          <CampoProduto
                            id={`p-${i.chave}`}
                            name={`produto-${i.chave}`}
                            inicial={i.produto ? ({ id: i.produto.id, rotulo: i.produto.rotulo, unidade: i.produto.unidade as ProdutoParaEscolha["unidade"], custoUnitarioCentavos: null, custoPorKg: i.produto.custoPorKg } as ProdutoParaEscolha) : null}
                            aoMudar={(p) => mudarItem(i.chave, p ? { produto: { id: p.id, rotulo: p.rotulo, unidade: p.unidade, custoPorKg: p.custoPorKg }, unidadeCompra: p.custoPorKg && p.unidade === "BARRA" ? "KG" : p.unidade } : { produto: null })}
                          />
                        )}
                      </Campo>
                    )}
                    {!travado ? <CaixaMarcacao id={`av-${i.chave}`} rotulo="Item avulso (sem cadastro de produto)" checked={i.avulso} onChange={(ev) => mudarItem(i.chave, { avulso: ev.target.checked, produto: ev.target.checked ? null : i.produto })} /> : null}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo id={`u-${i.chave}`} rotulo="Unidade de compra" erro={e("unidade")}>
                    <Selecao id={`u-${i.chave}`} value={i.unidadeCompra} disabled={travado} onChange={(ev) => mudarItem(i.chave, { unidadeCompra: ev.target.value })}>
                      {unidadesDoItem(i).map((u) => (
                        <option key={u} value={u}>
                          {ROTULO_UNIDADE[u as keyof typeof ROTULO_UNIDADE] ?? u}
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                  <Campo id={`q-${i.chave}`} rotulo="Quantidade" erro={e("quantidade")} obrigatorio>
                    <Input id={`q-${i.chave}`} inputMode="decimal" value={i.quantidade} onChange={(ev) => mudarItem(i.chave, { quantidade: ev.target.value })} autoComplete="off" />
                  </Campo>
                  <Campo id={`pr-${i.chave}`} rotulo={`Preço por ${i.unidadeCompra === "KG" ? "kg" : "unidade"} (R$)`} erro={e("preco")} dica="Vazio = sem preço (“sem custo”).">
                    <CampoMascarado id={`pr-${i.chave}`} mascara={mascararMoeda} defaultValue={i.preco} onChange={(ev) => mudarItem(i.chave, { preco: ev.currentTarget.value })} inputMode="numeric" autoComplete="off" placeholder="0,00" />
                  </Campo>
                </div>
                {i.unidadeCompra === "KG" && i.produto && !i.avulso && i.produto.unidade !== "KG" ? <p className="text-muted-foreground text-xs">Comprado por kg: ao receber, você informa quantas {i.produto.unidade === "BARRA" ? "barras" : "unidades"} entraram no estoque.</p> : null}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" onClick={() => setItens((l) => [...l, itemVazio(tipo)])}>
            <Plus aria-hidden /> Adicionar item
          </Button>
          <p className="text-sm" role="status">
            Total do pedido: <strong className="tabular-nums">{formatarMoeda(totalItens.total)}</strong>
            {totalItens.semPreco > 0 ? <span className="text-muted-foreground"> ({totalItens.semPreco} item(ns) sem preço)</span> : null}
          </p>
        </div>
      </section>

      <Campo id="cmp-obs" rotulo="Observação (opcional)" erro={erros.observacao}>
        <AreaTexto id="cmp-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} maxLength={1000} />
      </Campo>

      {geral && Object.keys(erros).length === 0 ? (
        <p role="alert" className="text-destructive text-sm">
          {geral}
        </p>
      ) : null}
      {geral && Object.keys(erros).length > 0 ? (
        <p role="alert" className="text-destructive text-sm">
          {geral}
        </p>
      ) : null}

      <div className="bg-background/95 sticky bottom-14 z-10 -mx-1 flex flex-wrap gap-2 border-t px-1 py-3 backdrop-blur md:bottom-0">
        {editando ? (
          <Button type="submit" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Salvar alterações
          </Button>
        ) : (
          <>
            <Button type="button" disabled={pendente} onClick={() => enviar(true)}>
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Salvar e fazer o pedido
            </Button>
            <Button type="submit" variant="outline" disabled={pendente}>
              Salvar como rascunho
            </Button>
          </>
        )}
        <Link href={editando ? `/compras/${compra!.id}` : "/compras"} className="inline-flex h-8 items-center px-3 text-sm hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
