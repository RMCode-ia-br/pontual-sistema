"use client";

import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";

import { CampoMascarado } from "@/components/campo-mascarado";
import { AreaTexto, CaixaMarcacao, Selecao } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AJUSTE_MAXIMO_PB, MAXIMO_FORMAS_PAGAMENTO, calcularAlternativa, parcelasDoCartao } from "@/lib/dominio/alternativas-pagamento";
import { valorParaCentavos } from "@/lib/dominio/numeros";
import { gerarParcelas, validarParcelas } from "@/lib/dominio/parcelas";
import { pontosBaseParaPercentual } from "@/lib/dominio/preco";
import { formatarMoeda } from "@/lib/formatadores";
import { centavosParaCampo, mascararMoeda } from "@/lib/formatadores/mascaras";
import { lerEscalado } from "@/lib/validadores/numero-br";

import type { AlternativaSer, OpcoesEditor } from "../tipos";
import { LinhasDeParcelas, entradaDeParcela, linhaDeParcela, novaChave, planejarParcelas, type LinhaParcela } from "./linhas-de-parcelas";

/** Uma forma de pagamento extra como a pessoa digita. */
export type LinhaAlternativa = {
  chave: string;
  nome: string;
  condicaoId: string;
  textoLivre: string;
  modoAjuste: "PERCENTUAL" | "TOTAL_DIGITADO";
  /** Percentual com sinal ("-5", "7,5"); vazio = zero. */
  ajuste: string;
  repasseCartao: boolean;
  /** A pessoa mexeu na marca: daí em diante ela não segue mais o cartão sozinha. */
  repasseManual: boolean;
  parcelas: LinhaParcela[];
  /** Modo "total": texto do dinheiro por opção de produto. */
  totais: Record<string, string>;
};

export function ajusteParaCampo(pb: number): string {
  return pb === 0 ? "" : `${pb < 0 ? "-" : ""}${pontosBaseParaPercentual(Math.abs(pb))}`;
}

export function alternativaDeSer(a: AlternativaSer): LinhaAlternativa {
  return {
    chave: novaChave(),
    nome: a.nome,
    condicaoId: a.condicaoId ?? "",
    textoLivre: a.textoLivre ?? "",
    modoAjuste: a.modoAjuste,
    ajuste: ajusteParaCampo(a.ajustePb),
    repasseCartao: a.repasseCartao,
    repasseManual: true,
    parcelas: a.parcelas.map((p) => linhaDeParcela(p)),
    totais: Object.fromEntries(a.totais.map((t) => [t.opcaoId, centavosParaCampo(t.baseCentavos)])),
  };
}

export function entradaDeAlternativa(a: LinhaAlternativa) {
  return {
    nome: a.nome,
    condicaoId: a.condicaoId || null,
    textoLivre: a.textoLivre,
    modoAjuste: a.modoAjuste,
    ajuste: a.ajuste,
    repasseCartao: a.repasseCartao,
    parcelas: a.parcelas.map(entradaDeParcela),
    totais: a.modoAjuste === "TOTAL_DIGITADO" ? Object.entries(a.totais).filter(([, t]) => t !== "").map(([opcaoId, total]) => ({ opcaoId, total })) : [],
  };
}

const temCartao = (parcelas: { forma: string | null }[]) => parcelas.some((p) => p.forma === "CARTAO_CREDITO");
const sinal = (pb: number) => `${pb > 0 ? "+" : pb < 0 ? "-" : ""}${pontosBaseParaPercentual(Math.abs(pb))}%`;

type Props = {
  alternativas: LinhaAlternativa[];
  aoMudar: (f: (a: LinhaAlternativa[]) => LinhaAlternativa[]) => void;
  opcoesDaProposta: { id: string; nome: string }[];
  /** Itens − desconto de cada opção (centavos), calculado ao vivo a partir do que já está gravado. */
  referencias: Record<string, number>;
  condicoes: OpcoesEditor["condicoes"];
  comNotaFiscal: boolean;
  acrescimoNotaPb: number;
  somenteLeitura: boolean;
};

export function FormasDePagamentoExtras({ alternativas, aoMudar, opcoesDaProposta, referencias, condicoes, comNotaFiscal, acrescimoNotaPb, somenteLeitura: L }: Props) {
  const mudar = (chave: string, f: (a: LinhaAlternativa) => LinhaAlternativa) => aoMudar((lista) => lista.map((x) => (x.chave === chave ? f(x) : x)));

  function aplicarCondicao(chave: string, id: string) {
    const c = condicoes.find((x) => x.id === id);
    mudar(chave, (a) => (c ? { ...a, condicaoId: id, textoLivre: c.textoLivre ?? "", parcelas: c.parcelas.map((p) => linhaDeParcela(p, false)), repasseCartao: temCartao(c.parcelas), repasseManual: false } : { ...a, condicaoId: "" }));
  }

  function mover(chave: string, delta: -1 | 1) {
    aoMudar((lista) => {
      const i = lista.findIndex((x) => x.chave === chave);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= lista.length) return lista;
      const copia = [...lista];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  const cheio = alternativas.length >= MAXIMO_FORMAS_PAGAMENTO - 1;

  return (
    <div className="grid gap-3">
      {alternativas.map((a, n) => {
        const rotulo = `Forma ${n + 2}`;
        const prefixo = `${rotulo} — `;
        const planejadas = a.textoLivre ? null : planejarParcelas(a.parcelas);
        const cronogramaOk = planejadas !== null && planejadas.length > 0 && validarParcelas(planejadas).ok;
        const ajusteLido = a.ajuste.trim() === "" ? 0 : lerEscalado(a.ajuste, { casas: 2, negativo: true });
        return (
          <fieldset key={a.chave} className="grid min-w-0 gap-3 rounded-lg border p-3" aria-label={`${rotulo}: ${a.nome || "sem nome"}`}>
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid min-w-0 basis-full gap-1 text-sm sm:flex-1 sm:basis-0">
                {rotulo}: nome
                <Input value={a.nome} disabled={L} maxLength={60} placeholder="Ex.: 10x no cartão" aria-label={`${rotulo}: nome`} onChange={(e) => mudar(a.chave, (x) => ({ ...x, nome: e.target.value }))} />
              </label>
              {!L ? (
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" aria-label={`Subir a ${rotulo.toLowerCase()}`} disabled={n === 0} onClick={() => mover(a.chave, -1)}><ArrowUp aria-hidden /></Button>
                  <Button type="button" variant="ghost" size="sm" aria-label={`Descer a ${rotulo.toLowerCase()}`} disabled={n === alternativas.length - 1} onClick={() => mover(a.chave, 1)}><ArrowDown aria-hidden /></Button>
                  <Button type="button" variant="ghost" size="sm" aria-label={`Duplicar a ${rotulo.toLowerCase()}`} disabled={cheio} onClick={() => aoMudar((lista) => { const i = lista.findIndex((x) => x.chave === a.chave); const copia: LinhaAlternativa = { ...a, chave: novaChave(), nome: `${a.nome} (cópia)`.slice(0, 60), parcelas: a.parcelas.map((p) => ({ ...p, chave: novaChave() })), totais: { ...a.totais } }; return [...lista.slice(0, i + 1), copia, ...lista.slice(i + 1)]; })}><Copy aria-hidden /></Button>
                  <Button type="button" variant="ghost" size="sm" aria-label={`Remover a ${rotulo.toLowerCase()}`} onClick={() => aoMudar((lista) => lista.filter((x) => x.chave !== a.chave))}><Trash2 aria-hidden /></Button>
                </div>
              ) : null}
            </div>

            <label className="grid gap-1 text-sm">
              Modelo de condição
              <Selecao value={a.condicaoId} disabled={L} onChange={(e) => aplicarCondicao(a.chave, e.target.value)} aria-label={`${prefixo}Modelo de condição de pagamento`}>
                <option value="">Escolha um modelo…</option>
                {condicoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Selecao>
            </label>
            {a.textoLivre ? (
              <label className="grid gap-1 text-sm">
                Texto livre
                <AreaTexto value={a.textoLivre} rows={2} disabled={L} maxLength={500} onChange={(e) => mudar(a.chave, (x) => ({ ...x, textoLivre: e.target.value }))} aria-label={`${prefixo}Texto livre da condição`} />
              </label>
            ) : (
              <LinhasDeParcelas linhas={a.parcelas} somenteLeitura={L} prefixo={prefixo} aoMudar={(f) => mudar(a.chave, (x) => { const parcelas = f(x.parcelas); return { ...x, parcelas, repasseCartao: x.repasseManual ? x.repasseCartao : temCartao(parcelas.map((p) => ({ forma: p.forma || null }))) }; })} />
            )}

            <div className="grid gap-3 rounded-lg bg-muted/40 p-3">
              <label className="grid gap-1 text-sm">
                Como informar o valor desta forma
                <Selecao value={a.modoAjuste} disabled={L} aria-label={`${prefixo}Como informar o valor`} onChange={(e) => mudar(a.chave, (x) => ({ ...x, modoAjuste: e.target.value as LinhaAlternativa["modoAjuste"] }))}>
                  <option value="PERCENTUAL">Ajuste em % sobre o valor da opção</option>
                  <option value="TOTAL_DIGITADO">Digitar o valor total desta forma</option>
                </Selecao>
              </label>
              {a.modoAjuste === "PERCENTUAL" ? (
                <label className="grid gap-1 text-sm sm:max-w-xs">
                  Ajuste (%)
                  <Input inputMode="text" value={a.ajuste} disabled={L} maxLength={8} placeholder="0 (ex.: -5 desconto, 7,5 acréscimo)" aria-label={`${prefixo}Ajuste em porcentagem`} onChange={(e) => mudar(a.chave, (x) => ({ ...x, ajuste: e.target.value }))} />
                  <span className="text-muted-foreground text-xs">Negativo é desconto (ex.: à vista), positivo é acréscimo. De -50 a +50. Zero vale: é o mesmo valor da opção.</span>
                </label>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {opcoesDaProposta.map((o) => (
                    <label key={o.id} className="grid gap-1 text-sm">
                      Total desta forma{opcoesDaProposta.length > 1 ? ` — ${o.nome}` : ""}
                      <div className="relative">
                        <CampoMascarado
                          mascara={mascararMoeda}
                          defaultValue={a.totais[o.id] ?? ""}
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={16}
                          disabled={L}
                          className="pl-10"
                          aria-label={`${prefixo}Total desta forma${opcoesDaProposta.length > 1 ? ` — ${o.nome}` : ""}`}
                          onChange={(e) => { const v = e.currentTarget.value; mudar(a.chave, (x) => ({ ...x, totais: { ...x.totais, [o.id]: v } })); }}
                        />
                        <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">R$</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <CaixaMarcacao id={`repasse-${a.chave}`} rotulo="O acréscimo desta forma é taxa da maquininha (repasse)" checked={a.repasseCartao} disabled={L} onChange={(e) => mudar(a.chave, (x) => ({ ...x, repasseCartao: e.target.checked, repasseManual: true }))} />
              <p className="text-muted-foreground -mt-2 text-xs">Marcado: o acréscimo conta como venda, mas sai da margem da obra (repasse de taxa de cartão). Só vale quando o ajuste é positivo.</p>

              <div className="grid gap-2" aria-label={`${prefixo}Valores desta forma`}>
                {opcoesDaProposta.map((o) => {
                  const ref = referencias[o.id] ?? 0;
                  if (ref <= 0) return <p key={o.id} className="text-muted-foreground text-xs">{opcoesDaProposta.length > 1 ? `${o.nome}: ` : ""}adicione itens com valor para ver o total.</p>;
                  const totalTexto = a.totais[o.id] ?? "";
                  const digitado = totalTexto === "" ? undefined : (valorParaCentavos(totalTexto) ?? undefined);
                  if (a.modoAjuste === "PERCENTUAL" && ajusteLido === null) return <p key={o.id} role="alert" className="text-destructive text-xs">Ajuste inválido: use, por exemplo, -5 ou 7,5.</p>;
                  const r = calcularAlternativa({ referenciaCentavos: ref, modo: a.modoAjuste, ajustePb: a.modoAjuste === "PERCENTUAL" ? (ajusteLido ?? 0) : 0, totalDigitadoCentavos: a.modoAjuste === "TOTAL_DIGITADO" ? digitado : undefined, comNotaFiscal, acrescimoNotaPb });
                  if (!r.ok) return <p key={o.id} role={a.modoAjuste === "TOTAL_DIGITADO" && digitado === undefined ? "status" : "alert"} className={`${a.modoAjuste === "TOTAL_DIGITADO" && digitado === undefined ? "text-muted-foreground" : "text-destructive"} text-xs`}>{opcoesDaProposta.length > 1 ? `${o.nome}: ` : ""}{r.erro}</p>;
                  const partes = cronogramaOk && planejadas ? gerarParcelas(r.totalCentavos, planejadas, "2026-01-01") : null;
                  return (
                    <div key={o.id} className="grid gap-0.5 text-sm" role="group" aria-label={`${prefixo}Total${opcoesDaProposta.length > 1 ? ` da opção ${o.nome}` : ""}`}>
                      {opcoesDaProposta.length > 1 ? <p className="font-medium">{o.nome}</p> : null}
                      <p>
                        Valor da opção {formatarMoeda(ref)} · ajuste {sinal(r.ajusteEfetivoPb)} ({r.ajusteCentavos < 0 ? "-" : r.ajusteCentavos > 0 ? "+" : ""}{formatarMoeda(Math.abs(r.ajusteCentavos))})
                        {comNotaFiscal ? ` · nota fiscal ${formatarMoeda(r.acrescimoNotaCentavos)}` : ""}
                      </p>
                      <p className="font-semibold">Total desta forma: {formatarMoeda(r.totalCentavos)}</p>
                      {partes ? (
                        <ul className="text-muted-foreground list-inside list-disc text-xs">
                          {partes.map((g) => {
                            const n = g.parcelasCartao;
                            const cartao = g.forma === "CARTAO_CREDITO" && n && n >= 1 && n <= 12 && g.valorCentavos > 0 ? parcelasDoCartao(g.valorCentavos, n) : null;
                            return (
                              <li key={g.ordem}>
                                {g.descricao}: {formatarMoeda(g.valorCentavos)}
                                {cartao ? ` (${n}x ${formatarMoeda(cartao[0])}${cartao[n! - 1] !== cartao[0] ? `, última ${formatarMoeda(cartao[n! - 1])}` : ""})` : ""}
                              </li>
                            );
                          })}
                        </ul>
                      ) : a.textoLivre ? null : <p className="text-muted-foreground text-xs">As parcelas precisam somar 100% para mostrar os valores.</p>}
                      {r.ajusteCentavos < 0 ? <p className="text-muted-foreground text-xs">Desconto: reduz o Vendido e a margem.</p> : null}
                      {r.ajusteCentavos > 0 && a.repasseCartao ? <p className="text-muted-foreground text-xs">Acréscimo de cartão: entra no Vendido; sai da margem como repasse da taxa de cartão.</p> : null}
                      {a.modoAjuste === "TOTAL_DIGITADO" && Math.abs(r.ajusteEfetivoPb) > AJUSTE_MAXIMO_PB ? <p role="alert" className="text-destructive text-xs">O total passa de 50% da opção.</p> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </fieldset>
        );
      })}

      {!L ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={cheio} onClick={() => aoMudar((lista) => [...lista, { chave: novaChave(), nome: "", condicaoId: "", textoLivre: "", modoAjuste: "PERCENTUAL", ajuste: "", repasseCartao: false, repasseManual: false, parcelas: [], totais: {} }])}>
            <Plus aria-hidden /> Adicionar forma de pagamento
          </Button>
          {cheio ? <span className="text-muted-foreground text-xs">No máximo {MAXIMO_FORMAS_PAGAMENTO} formas por proposta.</span> : null}
        </div>
      ) : null}
    </div>
  );
}
