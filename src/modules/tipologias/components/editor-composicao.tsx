"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Selecao } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { custoDaComposicao } from "@/lib/dominio/composicao";
import { testarFormula } from "@/lib/dominio/formulas";
import { formatarMoeda } from "@/lib/formatadores";
import { centavosParaCampo } from "@/lib/formatadores/mascaras";
import { useProtecaoDeSaida } from "@/lib/hooks/usar-protecao-de-saida";
import { pontosBaseParaPercentual } from "@/lib/dominio/preco";

import { salvarComposicao } from "../actions/composicao";
import { UNIDADES_INSUMO } from "../schemas";

type ProdutoOpcao = { id: string; codigo: string; descricao: string; unidade: string; custoUnitarioCentavos: number | null };

type LinhaInsumo = { chave: string; produtoId: string; descricao: string; unidade: string; formulaQuantidade: string; perda: string; custoUnitario: string };
type LinhaMao = { chave: string; papel: "FABRICA" | "INSTALACAO"; base: "HORAS_POR_M2" | "HORAS_POR_UNIDADE"; horas: string; custoHora: string };

type Props = {
  tipologiaId: string;
  nomeDaTipologia: string;
  exemplo: boolean;
  produtos: ProdutoOpcao[];
  insumos: { produtoId: string | null; descricao: string | null; unidade: string; formulaQuantidade: string; perdaPb: number; custoUnitarioCentavos: number | null }[];
  maoDeObra: { papel: "FABRICA" | "INSTALACAO"; base: "HORAS_POR_M2" | "HORAS_POR_UNIDADE"; horasCentesimos: number; custoHoraCentavos: number | null }[];
};

let contador = 0;
const novaChave = () => `l${++contador}`;

const inputNumero = "w-full";

export function EditorComposicao({ tipologiaId, nomeDaTipologia, exemplo, produtos, insumos, maoDeObra }: Props) {
  const [linhasInsumo, setLinhasInsumo] = useState<LinhaInsumo[]>(() =>
    insumos.map((i) => ({
      chave: novaChave(),
      produtoId: i.produtoId ?? "",
      descricao: i.descricao ?? "",
      unidade: i.unidade,
      formulaQuantidade: i.formulaQuantidade,
      perda: i.perdaPb ? pontosBaseParaPercentual(i.perdaPb) : "",
      custoUnitario: centavosParaCampo(i.custoUnitarioCentavos),
    })),
  );
  const [linhasMao, setLinhasMao] = useState<LinhaMao[]>(() =>
    maoDeObra.map((m) => ({ chave: novaChave(), papel: m.papel, base: m.base, horas: String(m.horasCentesimos / 100).replace(".", ","), custoHora: centavosParaCampo(m.custoHoraCentavos) })),
  );
  const [sujo, setSujo] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [teste, setTeste] = useState({ L: "2000", A: "1200", F: "2", Q: "1" });
  useProtecaoDeSaida(sujo);

  const produtoPorId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  function mudou<T>(definir: React.Dispatch<React.SetStateAction<T[]>>, chave: string, parte: Partial<T>) {
    definir((atual) => atual.map((l) => ((l as { chave: string }).chave === chave ? { ...l, ...parte } : l)));
    setSujo(true);
  }

  const numero = (t: string) => Number(t.replace(",", "."));
  const valores = { L: numero(teste.L) || 0, A: numero(teste.A) || 0, F: numero(teste.F) || 0, Q: numero(teste.Q) || 0 };

  /** Custo de teste: usa o custo do produto ou o digitado; o que não tem custo aparece como "falta informar". */
  const custoDeTeste = useMemo(() => {
    const centavos = (t: string) => {
      const n = Number(t.replace(/\./g, "").replace(",", "."));
      return t.trim() !== "" && Number.isFinite(n) ? Math.round(n * 100) : null;
    };
    return custoDaComposicao(
      linhasInsumo.map((i) => ({
        descricao: i.descricao || produtoPorId.get(i.produtoId)?.descricao || "insumo",
        formulaQuantidade: i.formulaQuantidade,
        perdaPb: Math.round((numero(i.perda) || 0) * 100),
        custoUnitarioCentavos: i.produtoId ? (produtoPorId.get(i.produtoId)?.custoUnitarioCentavos ?? null) : centavos(i.custoUnitario),
      })),
      linhasMao.map((m) => ({ papel: m.papel, base: m.base, horasCentesimos: Math.round((numero(m.horas) || 0) * 100), custoHoraCentavos: centavos(m.custoHora) })),
      [{ larguraMm: Math.max(1, Math.round(valores.L)), alturaMm: Math.max(1, Math.round(valores.A)), quantidade: Math.max(1, Math.round(valores.Q)) }],
      { folhas: valores.F || null },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhasInsumo, linhasMao, teste, produtoPorId]);

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const r = await salvarComposicao({
        tipologiaId,
        insumos: linhasInsumo.map((i) => ({
          produtoId: i.produtoId || null,
          descricao: i.descricao,
          unidade: i.unidade as (typeof UNIDADES_INSUMO)[number],
          formulaQuantidade: i.formulaQuantidade,
          perda: i.perda,
          custoUnitario: i.produtoId ? "" : i.custoUnitario,
        })),
        maoDeObra: linhasMao.map((m) => ({ papel: m.papel, base: m.base, horas: m.horas, custoHora: m.custoHora })),
      });
      if (r.ok) {
        setSujo(false);
        toast.success(r.mensagem ?? "Composição salva.");
      } else {
        setErro(r.erro);
      }
    });
  }

  return (
    <div className="grid gap-6">
      {exemplo ? (
        <p role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <strong>EXEMPLO — validar com o Marcelo.</strong> Esta composição é ilustrativa (sem custos). Nada aqui vale como dado real da Pontual.
        </p>
      ) : null}
      <p className="text-muted-foreground text-sm">
        A fórmula dá a quantidade <strong>por peça</strong>; o sistema multiplica pela quantidade de cada medida. Variáveis: <code>L</code> (largura, mm), <code>A</code> (altura, mm), <code>F</code> (folhas), <code>Q</code> (quantidade). Funções: min, max, ceil, floor, round, abs, sqrt, se(condição; então; senão).
        Custo vazio nunca vira zero: o sistema avisa o que falta e não calcula o preço por composição.
      </p>

      <section aria-labelledby="sec-insumos" className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="sec-insumos" className="font-medium">
            Insumos de {nomeDaTipologia}
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={() => { setLinhasInsumo((a) => [...a, { chave: novaChave(), produtoId: "", descricao: "", unidade: "UN", formulaQuantidade: "1", perda: "", custoUnitario: "" }]); setSujo(true); }}>
            <Plus aria-hidden /> Insumo
          </Button>
        </div>
        {linhasInsumo.length === 0 ? <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Nenhum insumo ainda. Adicione perfis, vidros e acessórios com a fórmula de quantidade.</p> : null}
        {linhasInsumo.map((l, i) => {
          const produto = produtoPorId.get(l.produtoId);
          const resultado = testarFormula(l.formulaQuantidade, valores);
          return (
            <div key={l.chave} className="grid gap-2 rounded-xl border p-3 md:grid-cols-12">
              <label className="grid gap-1 text-xs md:col-span-4">
                Produto
                <Selecao value={l.produtoId} onChange={(e) => mudou(setLinhasInsumo, l.chave, { produtoId: e.target.value, ...(e.target.value ? { unidade: produtoPorId.get(e.target.value)?.unidade ?? l.unidade } : {}) })} aria-label={`Produto do insumo ${i + 1}`}>
                  <option value="">Sem produto (descrever)</option>
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} — {p.descricao}
                    </option>
                  ))}
                </Selecao>
              </label>
              <label className="grid gap-1 text-xs md:col-span-3">
                Descrição {produto ? "(vem do produto)" : ""}
                <Input value={produto ? produto.descricao : l.descricao} disabled={!!produto} maxLength={200} onChange={(e) => mudou(setLinhasInsumo, l.chave, { descricao: e.target.value })} aria-label={`Descrição do insumo ${i + 1}`} />
              </label>
              <label className="grid gap-1 text-xs md:col-span-2">
                Unidade
                <Selecao value={l.unidade} onChange={(e) => mudou(setLinhasInsumo, l.chave, { unidade: e.target.value })} aria-label={`Unidade do insumo ${i + 1}`}>
                  {UNIDADES_INSUMO.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </Selecao>
              </label>
              <label className="grid gap-1 text-xs md:col-span-3">
                {produto ? "Custo (do cadastro do produto)" : "Custo unitário (R$)"}
                <Input
                  className={inputNumero}
                  inputMode="decimal"
                  placeholder="vazio = falta informar"
                  value={produto ? (produto.custoUnitarioCentavos !== null ? centavosParaCampo(produto.custoUnitarioCentavos) : "") : l.custoUnitario}
                  disabled={!!produto}
                  onChange={(e) => mudou(setLinhasInsumo, l.chave, { custoUnitario: e.target.value })}
                  aria-label={`Custo do insumo ${i + 1}`}
                />
              </label>
              <label className="grid gap-1 text-xs md:col-span-7">
                Fórmula da quantidade (por peça)
                <Input value={l.formulaQuantidade} maxLength={300} onChange={(e) => mudou(setLinhasInsumo, l.chave, { formulaQuantidade: e.target.value })} aria-label={`Fórmula do insumo ${i + 1}`} aria-invalid={!resultado.ok} className="font-mono" />
                <span className={resultado.ok ? "text-muted-foreground" : "text-destructive"} role={resultado.ok ? undefined : "alert"}>
                  {resultado.ok ? `Com L=${valores.L}, A=${valores.A}, F=${valores.F}, Q=${valores.Q}: ${resultado.valor.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} ${l.unidade}` : resultado.erro}
                </span>
              </label>
              <label className="grid gap-1 text-xs md:col-span-3">
                Perda de corte (%)
                <Input inputMode="decimal" value={l.perda} maxLength={8} placeholder="0" onChange={(e) => mudou(setLinhasInsumo, l.chave, { perda: e.target.value })} aria-label={`Perda do insumo ${i + 1}`} />
              </label>
              <div className="flex items-end justify-end md:col-span-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setLinhasInsumo((a) => a.filter((x) => x.chave !== l.chave)); setSujo(true); }} aria-label={`Remover insumo ${i + 1}`}>
                  <Trash2 aria-hidden /> Remover
                </Button>
              </div>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="sec-mao" className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="sec-mao" className="font-medium">
            Mão de obra
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={() => { setLinhasMao((a) => [...a, { chave: novaChave(), papel: "FABRICA", base: "HORAS_POR_M2", horas: "", custoHora: "" }]); setSujo(true); }}>
            <Plus aria-hidden /> Mão de obra
          </Button>
        </div>
        {linhasMao.length === 0 ? <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Sem mão de obra. Informe as horas de fábrica e de instalação (por m² ou por unidade) e o custo por hora.</p> : null}
        {linhasMao.map((m, i) => (
          <div key={m.chave} className="grid gap-2 rounded-xl border p-3 md:grid-cols-12">
            <label className="grid gap-1 text-xs md:col-span-3">
              Etapa
              <Selecao value={m.papel} onChange={(e) => mudou(setLinhasMao, m.chave, { papel: e.target.value as LinhaMao["papel"] })} aria-label={`Etapa da mão de obra ${i + 1}`}>
                <option value="FABRICA">Fábrica</option>
                <option value="INSTALACAO">Instalação</option>
              </Selecao>
            </label>
            <label className="grid gap-1 text-xs md:col-span-3">
              Base
              <Selecao value={m.base} onChange={(e) => mudou(setLinhasMao, m.chave, { base: e.target.value as LinhaMao["base"] })} aria-label={`Base da mão de obra ${i + 1}`}>
                <option value="HORAS_POR_M2">Horas por m²</option>
                <option value="HORAS_POR_UNIDADE">Horas por unidade</option>
              </Selecao>
            </label>
            <label className="grid gap-1 text-xs md:col-span-2">
              Horas
              <Input inputMode="decimal" value={m.horas} maxLength={10} onChange={(e) => mudou(setLinhasMao, m.chave, { horas: e.target.value })} aria-label={`Horas da mão de obra ${i + 1}`} />
            </label>
            <label className="grid gap-1 text-xs md:col-span-3">
              Custo por hora (R$)
              <Input inputMode="decimal" value={m.custoHora} placeholder="vazio = falta informar" maxLength={20} onChange={(e) => mudou(setLinhasMao, m.chave, { custoHora: e.target.value })} aria-label={`Custo por hora da mão de obra ${i + 1}`} />
            </label>
            <div className="flex items-end justify-end md:col-span-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => { setLinhasMao((a) => a.filter((x) => x.chave !== m.chave)); setSujo(true); }} aria-label={`Remover mão de obra ${i + 1}`}>
                <Trash2 aria-hidden />
              </Button>
            </div>
          </div>
        ))}
      </section>

      <section aria-labelledby="sec-teste" className="grid gap-3 rounded-xl border p-4">
        <h2 id="sec-teste" className="font-medium">
          Testar com medidas de exemplo
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["L", "A", "F", "Q"] as const).map((v) => (
            <label key={v} className="grid gap-1 text-xs">
              {v === "L" ? "Largura L (mm)" : v === "A" ? "Altura A (mm)" : v === "F" ? "Folhas F" : "Quantidade Q"}
              <Input inputMode="numeric" value={teste[v]} maxLength={6} onChange={(e) => setTeste((t) => ({ ...t, [v]: e.target.value }))} />
            </label>
          ))}
        </div>
        <p className="text-sm" aria-live="polite">
          {custoDeTeste.ok ? (
            <>
              Custo estimado: <strong>{formatarMoeda(custoDeTeste.custoCentavos)}</strong> (materiais {formatarMoeda(custoDeTeste.materiaisCentavos)} + mão de obra {formatarMoeda(custoDeTeste.maoDeObraCentavos)}). O preço sai deste custo × (1 + markup).
            </>
          ) : (
            <span className="text-muted-foreground">{custoDeTeste.erro}</span>
          )}
        </p>
      </section>

      {erro ? (
        <p role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      ) : null}
      <div className="bg-background/95 sticky bottom-14 z-10 -mx-1 flex gap-2 border-t px-1 py-3 backdrop-blur md:bottom-0">
        <Button type="button" onClick={salvar} disabled={pendente || !sujo}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Salvar composição
        </Button>
      </div>
    </div>
  );
}
