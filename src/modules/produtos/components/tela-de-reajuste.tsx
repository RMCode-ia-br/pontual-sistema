"use client";

import { AlertTriangle, CheckCircle2, Loader2, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarMoeda } from "@/lib/formatadores";

import { aplicarReajuste, preverReajuste, type PreviaParaTela } from "../actions/reajuste";

type Opcao = { id: string; nome: string };
type Escopo = "FORNECEDOR" | "CATEGORIA";
type Modo = "PERCENTUAL" | "VALOR_FIXO";

type Pedido = { escopo: Escopo; alvoId: string; modo: Modo; valor: string };

export function TelaDeReajuste({ fornecedores, categorias }: { fornecedores: Opcao[]; categorias: Opcao[] }) {
  const [escopo, setEscopo] = useState<Escopo>("FORNECEDOR");
  const [alvoId, setAlvoId] = useState("");
  const [modo, setModo] = useState<Modo>("PERCENTUAL");
  const [valor, setValor] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  // A prévia guarda o pedido exato que a gerou: se a pessoa mexer no formulário depois, ela deixa de valer.
  const [previa, setPrevia] = useState<{ dados: PreviaParaTela; pedido: Pedido } | null>(null);
  const [concluido, setConcluido] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [calculando, calcular] = useTransition();
  const [aplicando, aplicar] = useTransition();

  const opcoes = escopo === "FORNECEDOR" ? fornecedores : categorias;
  const pedidoAtual: Pedido = { escopo, alvoId, modo, valor };
  const previaVale = !!previa && JSON.stringify(previa.pedido) === JSON.stringify(pedidoAtual);

  function limparResultado() {
    setPrevia(null);
    setErros({});
    setErroGeral(null);
    setConcluido(null);
  }

  function gerarPrevia(e: React.FormEvent) {
    e.preventDefault();
    limparResultado();
    const pedido = pedidoAtual;
    calcular(async () => {
      const r = await preverReajuste(pedido);
      if (r.ok && r.dados) setPrevia({ dados: r.dados, pedido });
      else if (!r.ok) {
        setErros(r.campos ?? {});
        setErroGeral(r.erro);
      }
    });
  }

  function confirmar() {
    if (!previa) return;
    const { pedido, dados } = previa;
    aplicar(async () => {
      const r = await aplicarReajuste({ ...pedido, assinatura: dados.assinatura });
      setConfirmando(false);
      if (r.ok) {
        toast.success(r.mensagem ?? "Reajuste aplicado.");
        setPrevia(null);
        setConcluido(r.mensagem ?? "Reajuste aplicado.");
      } else {
        toast.error(r.erro);
        setErroGeral(r.erro);
        setPrevia(null);
      }
    });
  }

  const aplicaveis = previa?.dados.itens.filter((i) => i.custoNovoCentavos !== null) ?? [];
  const ignorados = previa?.dados.itens.filter((i) => i.custoNovoCentavos === null) ?? [];
  const diferenca = previa ? previa.dados.somaDepoisCentavos - previa.dados.somaAntesCentavos : 0;

  return (
    <div className="grid gap-6">
      <form onSubmit={gerarPrevia} className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2" aria-label="Dados do reajuste">
        <Campo id="escopo" rotulo="Reajustar por" erro={erros.escopo}>
          <Selecao
            id="escopo"
            value={escopo}
            onChange={(e) => {
              setEscopo(e.target.value === "CATEGORIA" ? "CATEGORIA" : "FORNECEDOR");
              setAlvoId("");
              limparResultado();
            }}
          >
            <option value="FORNECEDOR">Fornecedor</option>
            <option value="CATEGORIA">Categoria de produto</option>
          </Selecao>
        </Campo>
        <Campo id="alvoId" rotulo={escopo === "FORNECEDOR" ? "Fornecedor" : "Categoria"} erro={erros.alvoId} obrigatorio>
          <Selecao
            id="alvoId"
            value={alvoId}
            required
            onChange={(e) => {
              setAlvoId(e.target.value);
              setPrevia(null);
            }}
            {...ariaDoCampo("alvoId", erros.alvoId)}
          >
            <option value="" disabled>
              Escolha…
            </option>
            {opcoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="modo" rotulo="Tipo de reajuste" erro={erros.modo}>
          <Selecao
            id="modo"
            value={modo}
            onChange={(e) => {
              setModo(e.target.value === "VALOR_FIXO" ? "VALOR_FIXO" : "PERCENTUAL");
              limparResultado();
            }}
          >
            <option value="PERCENTUAL">Percentual (%)</option>
            <option value="VALOR_FIXO">Valor fixo (R$)</option>
          </Selecao>
        </Campo>
        <Campo
          id="valor"
          rotulo={modo === "PERCENTUAL" ? "Percentual" : "Valor em reais"}
          erro={erros.valor}
          obrigatorio
          dica={modo === "PERCENTUAL" ? "Aumento: 5. Desconto: -3,5. Até duas casas decimais." : "Soma ou subtrai do custo de cada produto. Ex.: 2,50 ou -10,00."}
        >
          <Input
            id="valor"
            value={valor}
            required
            inputMode="text"
            maxLength={20}
            autoComplete="off"
            placeholder={modo === "PERCENTUAL" ? "5" : "2,50"}
            onChange={(e) => {
              setValor(e.target.value);
              setPrevia(null);
            }}
            {...ariaDoCampo("valor", erros.valor, modo === "PERCENTUAL" ? "Aumento: 5. Desconto: -3,5. Até duas casas decimais." : "Soma ou subtrai do custo de cada produto. Ex.: 2,50 ou -10,00.")}
          />
        </Campo>
        {erroGeral && Object.keys(erros).length === 0 ? (
          <p role="alert" className="text-destructive text-sm sm:col-span-2">
            {erroGeral}
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={calculando || !alvoId}>
            {calculando ? <Loader2 className="animate-spin" aria-hidden /> : <TrendingUp aria-hidden />} Ver prévia
          </Button>
          <p className="text-muted-foreground mt-2 text-xs">Nada é alterado nesta etapa. Só entram produtos ativos que já têm custo informado.</p>
        </div>
      </form>

      {concluido ? (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-600/40 bg-emerald-600/10 p-4 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
          <div>
            <p className="font-medium">{concluido}</p>
            <p className="text-muted-foreground mt-1">
              Cada mudança ficou registrada no histórico de preço do produto.{" "}
              <Link href="/produtos" className="underline">
                Voltar para os produtos
              </Link>
            </p>
          </div>
        </div>
      ) : null}

      {previa && previaVale ? (
        <section aria-labelledby="titulo-previa" className="grid gap-4">
          <div>
            <h2 id="titulo-previa" className="font-medium">
              Prévia: {previa.dados.escopoRotulo}, {previa.dados.descricaoDaRegra}
            </h2>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-4">
              <div className="rounded-lg border p-3">
                <dt className="text-muted-foreground text-xs">Produtos reajustados</dt>
                <dd className="text-lg font-semibold tabular-nums">{previa.dados.afetados}</dd>
              </div>
              <div className="rounded-lg border p-3">
                <dt className="text-muted-foreground text-xs">Ignorados</dt>
                <dd className="text-lg font-semibold tabular-nums">{previa.dados.ignorados}</dd>
              </div>
              <div className="rounded-lg border p-3">
                <dt className="text-muted-foreground text-xs">Soma dos custos antes</dt>
                <dd className="font-semibold tabular-nums">{formatarMoeda(previa.dados.somaAntesCentavos)}</dd>
              </div>
              <div className="rounded-lg border p-3">
                <dt className="text-muted-foreground text-xs">Soma dos custos depois</dt>
                <dd className="font-semibold tabular-nums">
                  {formatarMoeda(previa.dados.somaDepoisCentavos)} <span className="text-muted-foreground text-xs font-normal">({diferenca >= 0 ? "+" : "−"}{formatarMoeda(Math.abs(diferenca))})</span>
                </dd>
              </div>
            </dl>
            <p className="text-muted-foreground mt-2 text-xs">A soma é só uma conferência: cada unidade tem o seu custo. Arredondamento em centavos, meio centavo para cima.</p>
          </div>

          {aplicaveis.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <caption className="sr-only">Produtos que serão reajustados</caption>
                <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Código</th>
                    <th scope="col" className="px-3 py-2 font-medium">Descrição</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Custo atual</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Custo novo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {aplicaveis.map((i) => (
                    <tr key={i.id}>
                      <td className="px-3 py-2 whitespace-nowrap">{i.codigo}</td>
                      <td className="px-3 py-2">{i.descricao}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(i.custoAtualCentavos ?? 0)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{formatarMoeda(i.custoNovoCentavos ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
              Nenhum produto seria reajustado com essa escolha. Veja abaixo o motivo de cada um.
            </p>
          )}

          {previa.dados.itensOmitidos > 0 ? (
            <p className="text-muted-foreground text-xs">A tela mostra os primeiros {previa.dados.itens.length} produtos; o reajuste vale para todos os {previa.dados.afetados + previa.dados.ignorados}.</p>
          ) : null}

          {ignorados.length > 0 ? (
            <details className="rounded-xl border p-3 text-sm">
              <summary className="cursor-pointer font-medium">{previa.dados.ignorados} {previa.dados.ignorados === 1 ? "produto ignorado" : "produtos ignorados"} (e por quê)</summary>
              <ul className="mt-2 grid gap-1">
                {ignorados.map((i) => (
                  <li key={i.id}>
                    <span className="font-medium">{i.codigo}</span> — {i.descricao}: <span className="text-muted-foreground">{i.motivoIgnorado}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={aplicaveis.length === 0 || aplicando} onClick={() => setConfirmando(true)}>
              Aplicar o reajuste
            </Button>
            <Link href="/produtos" className={buttonVariants({ variant: "ghost" })}>
              Cancelar
            </Link>
          </div>
        </section>
      ) : null}

      <ConfirmarAcao
        aberto={confirmando}
        aoFechar={() => setConfirmando(false)}
        titulo={`Reajustar ${previa?.dados.afetados ?? 0} ${previa?.dados.afetados === 1 ? "produto" : "produtos"}?`}
        descricao={`${previa?.dados.escopoRotulo ?? ""}: ${previa?.dados.descricaoDaRegra ?? ""}. Os custos mudam agora e cada mudança fica no histórico de preço. Para desfazer, será preciso aplicar o reajuste contrário.`}
        botao="Aplicar reajuste"
        pendente={aplicando}
        aoConfirmar={confirmar}
      />
    </div>
  );
}
