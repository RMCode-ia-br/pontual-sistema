"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { AreaTexto, Selecao } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FORMAS_PAGAMENTO, GATILHOS, MAXIMO_PARCELAS_CARTAO, ROTULO_FORMA, ROTULO_GATILHO, gerarParcelas } from "@/lib/dominio/parcelas";
import { percentualParaPontosBase, pontosBaseParaPercentual } from "@/lib/dominio/preco";
import { formatarMoeda } from "@/lib/formatadores";
import { useProtecaoDeSaida } from "@/lib/hooks/usar-protecao-de-saida";

import { salvarCondicao } from "../actions";
import { lerParcelasDaCondicao } from "../schemas";

type Gatilho = (typeof GATILHOS)[number];
type Forma = (typeof FORMAS_PAGAMENTO)[number];
type Linha = { chave: string; descricao: string; percentual: string; gatilho: Gatilho; forma: Forma | ""; diasApos: string; parcelasCartao: string };

type Props = {
  condicao?: {
    id: string;
    nome: string;
    descricao: string | null;
    textoLivre: string | null;
    parcelas: { descricao: string; percentualPb: number; gatilho: Gatilho; forma: Forma | null; diasApos: number | null; parcelasCartao: number | null }[];
  };
};

let contador = 0;
const novaChave = () => `p${++contador}`;

/** Total de exemplo só para mostrar como o cronograma se divide (não é valor de proposta). */
const TOTAL_EXEMPLO_CENTAVOS = 1_000_000;

export function FormCondicao({ condicao }: Props) {
  const router = useRouter();
  const [nome, setNome] = useState(condicao?.nome ?? "");
  const [descricao, setDescricao] = useState(condicao?.descricao ?? "");
  const [textoLivre, setTextoLivre] = useState(condicao?.textoLivre ?? "");
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    (condicao?.parcelas ?? []).map((p) => ({
      chave: novaChave(),
      descricao: p.descricao,
      percentual: pontosBaseParaPercentual(p.percentualPb),
      gatilho: p.gatilho,
      forma: p.forma ?? "",
      diasApos: p.diasApos === null ? "" : String(p.diasApos),
      parcelasCartao: p.parcelasCartao === null ? "" : String(p.parcelasCartao),
    })),
  );
  const [sujo, setSujo] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  useProtecaoDeSaida(sujo);

  const entrada = useMemo(
    () => ({
      id: condicao?.id,
      nome,
      descricao,
      textoLivre,
      parcelas: linhas.map((l) => ({ descricao: l.descricao, percentual: l.percentual, gatilho: l.gatilho, forma: l.forma === "" ? null : l.forma, diasApos: l.diasApos, parcelasCartao: l.parcelasCartao })),
    }),
    [condicao?.id, nome, descricao, textoLivre, linhas],
  );
  const lido = useMemo(() => lerParcelasDaCondicao(entrada), [entrada]);
  const previa = useMemo(() => {
    if ("erro" in lido || lido.parcelas.length === 0) return null;
    return gerarParcelas(TOTAL_EXEMPLO_CENTAVOS, lido.parcelas, "2026-01-01");
  }, [lido]);

  function mudar(chave: string, parte: Partial<Linha>) {
    setLinhas((a) => a.map((l) => (l.chave === chave ? { ...l, ...parte } : l)));
    setSujo(true);
  }

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const r = await salvarCondicao(entrada);
      if (r.ok && r.dados) {
        setSujo(false);
        toast.success(r.mensagem ?? "Salvo.");
        setTimeout(() => router.push(`/configuracoes/condicoes-pagamento/${r.dados!.id}`), 0);
      } else if (!r.ok) {
        setErro(r.erro);
      }
    });
  }

  const soma = linhas.reduce((s, l) => s + (percentualParaPontosBase(l.percentual) ?? 0) / 100, 0);

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 rounded-xl border p-4" aria-labelledby="sec-cond">
        <h2 id="sec-cond" className="font-medium">
          Condição
        </h2>
        <label className="grid gap-1.5 text-sm">
          Nome
          <Input value={nome} maxLength={160} required onChange={(e) => { setNome(e.target.value); setSujo(true); }} autoComplete="off" />
        </label>
        <label className="grid gap-1.5 text-sm">
          Descrição (opcional)
          <Input value={descricao} maxLength={300} onChange={(e) => { setDescricao(e.target.value); setSujo(true); }} autoComplete="off" />
        </label>
        <label className="grid gap-1.5 text-sm">
          Texto livre (só para condições sem parcelas, como &ldquo;A combinar&rdquo;)
          <AreaTexto value={textoLivre} rows={2} maxLength={500} onChange={(e) => { setTextoLivre(e.target.value); setSujo(true); }} />
        </label>
      </section>

      {textoLivre === "" ? (
        <section className="grid gap-3" aria-labelledby="sec-parcelas">
          <div className="flex items-center justify-between gap-2">
            <h2 id="sec-parcelas" className="font-medium">
              Parcelas
            </h2>
            <Button type="button" variant="outline" size="sm" onClick={() => { setLinhas((a) => [...a, { chave: novaChave(), descricao: "", percentual: "", gatilho: "CONFIRMACAO", forma: "", diasApos: "", parcelasCartao: "" }]); setSujo(true); }}>
              <Plus aria-hidden /> Parcela
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            O gatilho de entrega (material, vidros e instalação) deixa a parcela sem vencimento até a etapa da obra ser concluída. A soma precisa fechar 100%: agora está em <strong>{soma.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</strong>.
            Sem cálculo de juros.
          </p>
          {linhas.map((l, i) => (
            <div key={l.chave} className="grid gap-2 rounded-xl border p-3 md:grid-cols-12">
              <label className="grid gap-1 text-xs md:col-span-5">
                Descrição
                <Input value={l.descricao} maxLength={120} onChange={(e) => mudar(l.chave, { descricao: e.target.value })} aria-label={`Descrição da parcela ${i + 1}`} />
              </label>
              <label className="grid gap-1 text-xs md:col-span-2">
                Percentual (%)
                <Input inputMode="decimal" value={l.percentual} maxLength={8} onChange={(e) => mudar(l.chave, { percentual: e.target.value })} aria-label={`Percentual da parcela ${i + 1}`} />
              </label>
              <label className="grid gap-1 text-xs md:col-span-5">
                Quando
                <Selecao value={l.gatilho} onChange={(e) => mudar(l.chave, { gatilho: e.target.value as Gatilho })} aria-label={`Gatilho da parcela ${i + 1}`}>
                  {GATILHOS.map((g) => (
                    <option key={g} value={g}>
                      {ROTULO_GATILHO[g]}
                    </option>
                  ))}
                </Selecao>
              </label>
              <label className="grid gap-1 text-xs md:col-span-4">
                Forma
                <Selecao value={l.forma} onChange={(e) => mudar(l.chave, { forma: e.target.value as Forma | "", ...(e.target.value !== "CARTAO_CREDITO" ? { parcelasCartao: "" } : {}) })} aria-label={`Forma da parcela ${i + 1}`}>
                  <option value="">A definir</option>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f} value={f}>
                      {ROTULO_FORMA[f]}
                    </option>
                  ))}
                </Selecao>
              </label>
              {l.gatilho === "DIAS_APOS_APROVACAO" ? (
                <label className="grid gap-1 text-xs md:col-span-3">
                  Dias após a aprovação
                  <Input inputMode="numeric" value={l.diasApos} maxLength={3} onChange={(e) => mudar(l.chave, { diasApos: e.target.value })} aria-label={`Dias da parcela ${i + 1}`} />
                </label>
              ) : null}
              {l.forma === "CARTAO_CREDITO" ? (
                <label className="grid gap-1 text-xs md:col-span-3">
                  Parcelas no cartão (até {MAXIMO_PARCELAS_CARTAO})
                  <Input inputMode="numeric" value={l.parcelasCartao} maxLength={2} onChange={(e) => mudar(l.chave, { parcelasCartao: e.target.value })} aria-label={`Parcelas do cartão da parcela ${i + 1}`} />
                </label>
              ) : null}
              {l.gatilho === "DATA_FIXA" ? <p className="text-muted-foreground text-xs md:col-span-12">A data fixa é escolhida em cada proposta.</p> : null}
              <div className="flex items-end justify-end md:col-span-12">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setLinhas((a) => a.filter((x) => x.chave !== l.chave)); setSujo(true); }} aria-label={`Remover parcela ${i + 1}`}>
                  <Trash2 aria-hidden /> Remover
                </Button>
              </div>
            </div>
          ))}
          {linhas.length === 0 ? <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Nenhuma parcela. Adicione as parcelas ou escreva um texto livre acima.</p> : null}
        </section>
      ) : null}

      {previa ? (
        <section className="grid gap-2 rounded-xl border p-4" aria-labelledby="sec-previa">
          <h2 id="sec-previa" className="font-medium">
            Como ficaria (exemplo com {formatarMoeda(TOTAL_EXEMPLO_CENTAVOS)})
          </h2>
          <ul className="text-sm">
            {previa.map((p) => (
              <li key={p.ordem} className="flex flex-wrap justify-between gap-2 border-b py-1 last:border-0">
                <span>
                  {p.ordem}. {p.descricao} ({(p.percentualPb / 100).toLocaleString("pt-BR")}%)
                </span>
                <span>
                  {formatarMoeda(p.valorCentavos)} · {p.status === "AGUARDANDO_GATILHO" ? "aguarda a etapa" : "com vencimento"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {erro ? (
        <p role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      ) : "erro" in lido && linhas.length > 0 && textoLivre === "" ? (
        <p className="text-muted-foreground text-sm">{lido.erro}</p>
      ) : null}

      <div className="bg-background/95 sticky bottom-14 z-10 -mx-1 flex flex-wrap gap-2 border-t px-1 py-3 backdrop-blur md:bottom-0">
        <Button type="button" onClick={salvar} disabled={pendente || ("erro" in lido && textoLivre === "")}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} {condicao ? "Salvar alterações" : "Criar condição"}
        </Button>
        <Link href="/configuracoes/condicoes-pagamento" className="inline-flex h-8 items-center px-3 text-sm hover:underline">
          Cancelar
        </Link>
      </div>
    </div>
  );
}
