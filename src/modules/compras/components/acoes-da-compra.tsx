"use client";

import { Ban, Loader2, PackageCheck, Pencil, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CampoMascarado } from "@/components/campo-mascarado";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { AreaTexto, CaixaMarcacao, Campo, Selecao } from "@/components/formulario";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatarQuantidade, lerQuantidade } from "@/lib/dominio/estoque";
import { barrasInteirasSugeridas } from "@/lib/dominio/perfil-kg";
import { formatarMoeda } from "@/lib/formatadores";
import { mascararMoeda } from "@/lib/formatadores/mascaras";
import { FORMAS_PAGAMENTO, ROTULO_FORMA } from "@/lib/dominio/parcelas";

import { cancelarCompraAcao, estornarRecebimentoAcao, fazerPedidoAcao, receberCompraAcao } from "../actions";
import type { CompraDetalhe } from "../queries";

type Item = CompraDetalhe["itens"][number];

const quantidadeTexto = (m: number) => formatarQuantidade(m);

function DialogoDeRecebimento({ compra, categoriasDeDespesa, hoje, aoFechar }: { compra: CompraDetalhe; categoriasDeDespesa: { id: string; nome: string }[]; hoje: string; aoFechar: () => void }) {
  const router = useRouter();
  const pendentes = compra.itens.filter((i) => i.recebidaMilesimos < i.quantidadeMilesimos);
  const [valores, setValores] = useState<Record<string, { quantidade: string; estoque: string; valor: string; precoKg: boolean }>>(() =>
    Object.fromEntries(pendentes.map((i) => [i.id, { quantidade: quantidadeTexto(i.quantidadeMilesimos - i.recebidaMilesimos).replace(/\./g, ""), estoque: "", valor: "", precoKg: true }])),
  );
  const [gerarConta, setGerarConta] = useState(false);
  const [conta, setConta] = useState({ vencimento: "", parcelas: "1", categoriaId: "", forma: "" });
  const [data, setData] = useState(hoje);
  const [observacao, setObservacao] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [geral, setGeral] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const mudar = (id: string, c: Partial<(typeof valores)[string]>) => setValores((v) => ({ ...v, [id]: { ...v[id], ...c } }));
  const precisaEstoque = (i: Item) => !!i.produtoId && !!i.unidadeProduto && i.unidadeCompra !== i.unidadeProduto;
  const semPreco = pendentes.every((i) => i.precoUnitarioCentavos === null);

  function salvar() {
    setErros({});
    setGeral(null);
    const itensTodos = compra.itens.map((i) => (valores[i.id] ? { itemCompraId: i.id, quantidade: valores[i.id].quantidade, quantidadeEstoque: valores[i.id].estoque, valorTotal: valores[i.id].valor, atualizarPrecoKg: valores[i.id].precoKg && i.custoPorKg && i.unidadeCompra === "KG" } : null)).filter((x) => x !== null);
    iniciar(async () => {
      const r = await receberCompraAcao({ compraId: compra.id, data, observacao, itens: itensTodos, gerarConta, contaVencimento: conta.vencimento, contaParcelas: conta.parcelas, contaCategoriaId: conta.categoriaId, contaForma: conta.forma });
      if (r.ok) {
        toast.success(r.mensagem ?? "Recebimento registrado.");
        aoFechar();
        router.refresh();
      } else {
        setErros(r.campos ?? {});
        setGeral(r.erro);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(a) => !a && !pendente && aoFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receber material</DialogTitle>
          <DialogDescription>
            {compra.numero} · {compra.fornecedor}. Informe o que chegou agora (pode ser parte). {compra.destino === "ESTOQUE" ? "A entrada vai para o estoque." : "É custo direto da obra: não passa pelo estoque."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[62vh] gap-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="rc-data" rotulo="Data do recebimento" erro={erros.data} obrigatorio>
              <Input id="rc-data" type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
            </Campo>
            <Campo id="rc-obs" rotulo="Observação (opcional)">
              <Input id="rc-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={300} autoComplete="off" />
            </Campo>
          </div>

          <ul className="grid gap-3">
            {pendentes.map((i) => {
              const v = valores[i.id];
              const restante = i.quantidadeMilesimos - i.recebidaMilesimos;
              const kgDigitado = lerQuantidade(v.quantidade || "0") ?? 0;
              const sugestao = precisaEstoque(i) && i.unidadeCompra === "KG" && i.unidadeProduto === "BARRA" ? barrasInteirasSugeridas(kgDigitado, { pesoMilesimosKgPorMetro: i.pesoMilesimosKgPorMetro, comprimentoBarraMm: i.comprimentoBarraMm }) : null;
              const e = (c: string) => erros[`item:${compra.itens.findIndex((x) => x.id === i.id)}:${c}`];
              return (
                <li key={i.id} className="grid gap-3 rounded-lg border p-3" aria-label={`Item ${i.ordem}`}>
                  <p className="text-sm font-medium">
                    Item {i.ordem}: {i.produto ?? i.descricao}
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      · faltam {quantidadeTexto(restante)} {i.unidadeCompra.toLowerCase()}
                    </span>
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Campo id={`rq-${i.id}`} rotulo={`Chegou (${i.unidadeCompra.toLowerCase()})`} erro={e("quantidade")} dica="Vazio = não chegou agora.">
                      <Input id={`rq-${i.id}`} inputMode="decimal" value={v.quantidade} onChange={(ev) => mudar(i.id, { quantidade: ev.target.value })} autoComplete="off" />
                    </Campo>
                    {precisaEstoque(i) ? (
                      <Campo id={`re-${i.id}`} rotulo={`Entrou no estoque (${i.unidadeProduto === "BARRA" ? "barras" : i.unidadeProduto?.toLowerCase()})`} erro={e("estoque")} obrigatorio dica={sugestao !== null ? `Pelo peso nominal: ${sugestao} barra(s). Confira e confirme.` : "Conte e informe."}>
                        <div className="flex gap-2">
                          <Input id={`re-${i.id}`} inputMode="decimal" value={v.estoque} onChange={(ev) => mudar(i.id, { estoque: ev.target.value })} autoComplete="off" />
                          {sugestao !== null ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => mudar(i.id, { estoque: String(sugestao) })}>
                              Usar {sugestao}
                            </Button>
                          ) : null}
                        </div>
                      </Campo>
                    ) : null}
                    <Campo id={`rv-${i.id}`} rotulo="Valor total desta entrega (opcional)" erro={e("valor")} dica={i.precoUnitarioCentavos !== null ? `Vazio: quantidade × ${formatarMoeda(i.precoUnitarioCentavos)}.` : "Sem preço no pedido: sem valor, o custo fica “sem custo”."}>
                      <CampoMascarado id={`rv-${i.id}`} mascara={mascararMoeda} defaultValue="" onChange={(ev) => mudar(i.id, { valor: ev.currentTarget.value })} inputMode="numeric" autoComplete="off" placeholder="0,00" />
                    </Campo>
                  </div>
                  {i.custoPorKg && i.unidadeCompra === "KG" && i.precoUnitarioCentavos !== null ? (
                    <CaixaMarcacao id={`rk-${i.id}`} rotulo={`Atualizar o preço do kg do acabamento ${i.acabamentoNome ?? ""} para ${formatarMoeda(i.precoUnitarioCentavos)}`} checked={v.precoKg} onChange={(ev) => mudar(i.id, { precoKg: ev.target.checked })} />
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="grid gap-3 rounded-lg border p-3">
            <CaixaMarcacao id="rc-conta" rotulo="Gerar a conta a pagar do que foi recebido" checked={gerarConta} onChange={(e) => setGerarConta(e.target.checked)} />
            {gerarConta ? (
              <>
                {semPreco ? <p className="text-destructive text-sm">Nenhum item tem preço: não há valor para a conta.</p> : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo id="rc-venc" rotulo="Vencimento (1ª parcela)" erro={erros.contaVencimento} obrigatorio>
                    <Input id="rc-venc" type="date" value={conta.vencimento} onChange={(e) => setConta({ ...conta, vencimento: e.target.value })} />
                  </Campo>
                  <Campo id="rc-parc" rotulo="Parcelas" erro={erros.contaParcelas}>
                    <Selecao id="rc-parc" value={conta.parcelas} onChange={(e) => setConta({ ...conta, parcelas: e.target.value })}>
                      {Array.from({ length: 12 }, (_, n) => n + 1).map((n) => (
                        <option key={n} value={n}>
                          {n === 1 ? "À vista (1x)" : `${n}x`}
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                  <Campo id="rc-cat" rotulo="Categoria da despesa" erro={erros.contaCategoriaId} obrigatorio>
                    <Selecao id="rc-cat" value={conta.categoriaId} onChange={(e) => setConta({ ...conta, categoriaId: e.target.value })}>
                      <option value="">Escolha...</option>
                      {categoriasDeDespesa.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                  <Campo id="rc-forma" rotulo="Forma (opcional)">
                    <Selecao id="rc-forma" value={conta.forma} onChange={(e) => setConta({ ...conta, forma: e.target.value })}>
                      <option value="">—</option>
                      {FORMAS_PAGAMENTO.map((f) => (
                        <option key={f} value={f}>
                          {ROTULO_FORMA[f]}
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                </div>
                <p className="text-muted-foreground text-xs">A conta é só o pagamento: o custo da obra vem desta compra, então nada é contado duas vezes.</p>
              </>
            ) : null}
          </div>

          {geral ? (
            <p role="alert" className="text-destructive text-sm">
              {geral}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={pendente}>
            Cancelar
          </Button>
          <Button type="button" onClick={salvar} disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Registrar recebimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoCancelar({ compra, aoFechar }: { compra: CompraDetalhe; aoFechar: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <Dialog open onOpenChange={(a) => !a && !pendente && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar a compra {compra.numero}?</DialogTitle>
          <DialogDescription>Nada é apagado: a compra fica cancelada, com o motivo. Só se cancela compra que não recebeu nada.</DialogDescription>
        </DialogHeader>
        <Campo id="cc-motivo" rotulo="Motivo" obrigatorio>
          <AreaTexto id="cc-motivo" rows={2} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
        {erro ? (
          <p role="alert" className="text-destructive text-sm">
            {erro}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={pendente}>
            Voltar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await cancelarCompraAcao({ compraId: compra.id, motivo });
                if (r.ok) {
                  toast.success(r.mensagem ?? "Compra cancelada.");
                  aoFechar();
                  router.refresh();
                } else setErro(r.erro);
              })
            }
          >
            {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Cancelar a compra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Ações da compra conforme o status: editar, fazer o pedido, receber e cancelar. */
export function AcoesDaCompra({ compra, categoriasDeDespesa, hoje }: { compra: CompraDetalhe; categoriasDeDespesa: { id: string; nome: string }[]; hoje: string }) {
  const router = useRouter();
  const [dialogo, setDialogo] = useState<"receber" | "cancelar" | "pedir" | null>(null);
  const [pendente, iniciar] = useTransition();
  const aberta = compra.status === "RASCUNHO" || compra.status === "PEDIDO" || compra.status === "RECEBIDO_PARCIAL";
  const recebeuAlgo = compra.itens.some((i) => i.recebidaMilesimos > 0);
  const fechar = () => setDialogo(null);

  function pedir() {
    iniciar(async () => {
      const r = await fazerPedidoAcao({ compraId: compra.id });
      fechar();
      if (r.ok) {
        toast.success(r.mensagem ?? "Pedido registrado.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  if (!aberta) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {compra.status === "RASCUNHO" ? (
          <Button type="button" onClick={() => setDialogo("pedir")}>
            <Send aria-hidden /> Fazer o pedido
          </Button>
        ) : null}
        <Button type="button" variant={compra.status === "RASCUNHO" ? "outline" : "default"} onClick={() => setDialogo("receber")}>
          <PackageCheck aria-hidden /> Receber material
        </Button>
        <Link href={`/compras/${compra.id}/editar`} className={buttonVariants({ variant: "outline" })}>
          <Pencil aria-hidden /> Editar
        </Link>
        {!recebeuAlgo ? (
          <Button type="button" variant="ghost" onClick={() => setDialogo("cancelar")}>
            <Ban aria-hidden /> Cancelar compra
          </Button>
        ) : null}
      </div>
      {dialogo === "receber" ? <DialogoDeRecebimento compra={compra} categoriasDeDespesa={categoriasDeDespesa} hoje={hoje} aoFechar={fechar} /> : null}
      {dialogo === "cancelar" ? <DialogoCancelar compra={compra} aoFechar={fechar} /> : null}
      <ConfirmarAcao aberto={dialogo === "pedir"} aoFechar={fechar} titulo="Fazer o pedido?" descricao="A compra passa de rascunho para pedido feito ao fornecedor." botao="Fazer o pedido" pendente={pendente} aoConfirmar={pedir} />
    </>
  );
}

/** Estorna um recebimento (com motivo). */
export function BotaoEstornarRecebimento({ recebimentoId, rotulo }: { recebimentoId: string; rotulo: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(true)}>
        <RotateCcw aria-hidden /> Estornar
      </Button>
      {aberto ? (
        <Dialog open onOpenChange={(a) => !a && !pendente && setAberto(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Estornar o recebimento?</DialogTitle>
              <DialogDescription>{rotulo}. As entradas de estoque ganham o movimento contrário e a quantidade recebida volta. Se a compra tem conta a pagar ativa, cancele a conta antes.</DialogDescription>
            </DialogHeader>
            <Campo id="er-motivo" rotulo="Motivo" obrigatorio>
              <AreaTexto id="er-motivo" rows={2} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Campo>
            {erro ? (
              <p role="alert" className="text-destructive text-sm">
                {erro}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={pendente}>
                Voltar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await estornarRecebimentoAcao({ recebimentoId, motivo });
                    if (r.ok) {
                      toast.success(r.mensagem ?? "Estornado.");
                      setAberto(false);
                      router.refresh();
                    } else setErro(r.erro);
                  })
                }
              >
                {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Estornar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
