"use client";

import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { CaixaMarcacao, Selecao } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  avisosDoModelo,
  GATILHOS_DE_ETAPA,
  MAXIMO_DE_ETAPAS_NO_MODELO,
  PESO_MAXIMO_DE_ETAPA,
  ROTULO_GATILHO_DE_ETAPA,
  ROTULO_GRUPO_PRAZO,
  ROTULO_TIPO_ETAPA,
  TIPOS_DE_ETAPA,
  type GatilhoDeEtapa,
  type ItemDoModelo,
  type TipoDeEtapa,
} from "@/lib/dominio/etapas";
import { GRUPOS_DE_PRAZO, type GrupoDePrazo } from "@/lib/dominio/prazo-obra";
import { useProtecaoDeSaida } from "@/lib/hooks/usar-protecao-de-saida";

import { salvarModeloDeEtapas } from "../actions/modelo";
import { lerModeloDeEtapas } from "../schemas";

type Linha = {
  chave: string;
  tipo: TipoDeEtapa;
  nome: string;
  grupoPrazo: GrupoDePrazo | "";
  peso: string;
  liberaGatilho: GatilhoDeEtapa | "";
  marcoGarantia: boolean;
  exigeEsquadria: boolean;
  ativo: boolean;
};

let contador = 0;
const novaChave = () => `e${++contador}`;

function paraLinha(i: ItemDoModelo): Linha {
  return {
    chave: novaChave(),
    tipo: i.tipo,
    nome: i.nome,
    grupoPrazo: i.grupoPrazo ?? "",
    peso: String(i.peso),
    liberaGatilho: i.liberaGatilho ?? "",
    marcoGarantia: i.marcoGarantia,
    exigeEsquadria: i.exigeEsquadria,
    ativo: i.ativo,
  };
}

export function EditorModeloEtapas({ itens }: { itens: ItemDoModelo[] }) {
  const router = useRouter();
  const [linhas, setLinhas] = useState<Linha[]>(() => itens.map(paraLinha));
  const [sujo, setSujo] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  useProtecaoDeSaida(sujo);

  const entrada = useMemo(
    () => ({
      itens: linhas.map((l) => ({
        tipo: l.tipo,
        nome: l.nome,
        grupoPrazo: l.grupoPrazo === "" ? null : l.grupoPrazo,
        peso: l.peso.trim() === "" ? Number.NaN : Number(l.peso.replace(",", ".")),
        liberaGatilho: l.liberaGatilho === "" ? null : l.liberaGatilho,
        marcoGarantia: l.marcoGarantia,
        exigeEsquadria: l.exigeEsquadria,
        ativo: l.ativo,
      })),
    }),
    [linhas],
  );
  const lido = useMemo(() => lerModeloDeEtapas(entrada), [entrada]);
  const avisos = useMemo(() => ("erro" in lido ? [] : avisosDoModelo(lido.itens)), [lido]);

  function mudar(chave: string, parte: Partial<Linha>) {
    setLinhas((a) => a.map((l) => (l.chave === chave ? { ...l, ...parte } : l)));
    setSujo(true);
  }

  function mover(indice: number, delta: -1 | 1) {
    setLinhas((a) => {
      const destino = indice + delta;
      if (destino < 0 || destino >= a.length) return a;
      const copia = [...a];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
    setSujo(true);
  }

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const r = await salvarModeloDeEtapas(entrada);
      if (r.ok) {
        setSujo(false);
        toast.success(r.mensagem ?? "Salvo.");
        router.refresh();
      } else {
        setErro(r.erro);
      }
    });
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-3" aria-labelledby="sec-etapas">
        <div className="flex items-center justify-between gap-2">
          <h2 id="sec-etapas" className="font-medium">
            Etapas da obra
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={linhas.length >= MAXIMO_DE_ETAPAS_NO_MODELO}
            onClick={() => {
              setLinhas((a) => [...a, { chave: novaChave(), tipo: "OUTRA", nome: "", grupoPrazo: "", peso: "1", liberaGatilho: "", marcoGarantia: false, exigeEsquadria: false, ativo: true }]);
              setSujo(true);
            }}
          >
            <Plus aria-hidden /> Etapa
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          As etapas seguem a ordem desta lista. Os <strong>dias</strong> de cada prazo (material, execução, vidros e finalização) vêm de cada proposta: aqui você só diz a que prazo cada etapa pertence e o peso
          dela dentro dele. A medição exata não pertence a nenhum prazo: é dela que o relógio começa a contar.
        </p>

        {linhas.map((l, i) => {
          const medicao = l.tipo === "MEDICAO_EXATA";
          return (
            <div key={l.chave} className={`grid gap-3 rounded-xl border p-3 md:grid-cols-12 ${l.ativo ? "" : "bg-muted/40"}`}>
              <div className="flex items-center justify-between gap-2 md:col-span-12">
                <p className="text-sm font-medium">
                  {i + 1}. {l.nome.trim() || ROTULO_TIPO_ETAPA[l.tipo]}
                  {l.ativo ? null : <span className="text-muted-foreground ml-2 text-xs font-normal">(inativa)</span>}
                </p>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir a etapa ${i + 1}`}>
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" disabled={i === linhas.length - 1} onClick={() => mover(i, 1)} aria-label={`Descer a etapa ${i + 1}`}>
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setLinhas((a) => a.filter((x) => x.chave !== l.chave));
                      setSujo(true);
                    }}
                    aria-label={`Remover a etapa ${i + 1}`}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>

              <label className="grid gap-1 text-xs md:col-span-4">
                Nome
                <Input value={l.nome} maxLength={80} onChange={(e) => mudar(l.chave, { nome: e.target.value })} aria-label={`Nome da etapa ${i + 1}`} autoComplete="off" />
              </label>
              <label className="grid gap-1 text-xs md:col-span-3">
                Tipo
                <Selecao
                  value={l.tipo}
                  onChange={(e) => {
                    const tipo = e.target.value as TipoDeEtapa;
                    mudar(l.chave, { tipo, ...(tipo === "MEDICAO_EXATA" ? { grupoPrazo: "" as const } : {}) });
                  }}
                  aria-label={`Tipo da etapa ${i + 1}`}
                >
                  {TIPOS_DE_ETAPA.map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_TIPO_ETAPA[t]}
                    </option>
                  ))}
                </Selecao>
              </label>
              <label className="grid gap-1 text-xs md:col-span-3">
                Prazo a que pertence
                <Selecao
                  value={l.grupoPrazo}
                  disabled={medicao}
                  onChange={(e) => mudar(l.chave, { grupoPrazo: e.target.value as GrupoDePrazo | "" })}
                  aria-label={`Prazo da etapa ${i + 1}`}
                >
                  <option value="">{medicao ? "Nenhum (inicia o relógio)" : "Nenhum (sem datas previstas)"}</option>
                  {GRUPOS_DE_PRAZO.map((g) => (
                    <option key={g} value={g}>
                      {ROTULO_GRUPO_PRAZO[g]}
                    </option>
                  ))}
                </Selecao>
              </label>
              <label className="grid gap-1 text-xs md:col-span-2">
                Peso (1 a {PESO_MAXIMO_DE_ETAPA})
                <Input inputMode="numeric" value={l.peso} maxLength={2} onChange={(e) => mudar(l.chave, { peso: e.target.value })} aria-label={`Peso da etapa ${i + 1}`} />
              </label>

              <label className="grid gap-1 text-xs md:col-span-6">
                Ao concluir, libera a parcela
                <Selecao value={l.liberaGatilho} onChange={(e) => mudar(l.chave, { liberaGatilho: e.target.value as GatilhoDeEtapa | "" })} aria-label={`Parcela liberada pela etapa ${i + 1}`}>
                  <option value="">Nenhuma</option>
                  {GATILHOS_DE_ETAPA.map((g) => (
                    <option key={g} value={g}>
                      {ROTULO_GATILHO_DE_ETAPA[g]}
                    </option>
                  ))}
                </Selecao>
              </label>
              <div className="flex flex-wrap items-end gap-x-5 md:col-span-6">
                <CaixaMarcacao id={`${l.chave}-marco`} rotulo="Inicia a garantia" checked={l.marcoGarantia} onChange={(e) => mudar(l.chave, { marcoGarantia: e.target.checked })} />
                <CaixaMarcacao id={`${l.chave}-esq`} rotulo="Só se tiver esquadria" checked={l.exigeEsquadria} onChange={(e) => mudar(l.chave, { exigeEsquadria: e.target.checked })} />
                <CaixaMarcacao
                  id={`${l.chave}-ativo`}
                  rotulo="Ativa"
                  checked={l.ativo}
                  onChange={(e) => mudar(l.chave, e.target.checked ? { ativo: true } : { ativo: false, liberaGatilho: "", marcoGarantia: false })}
                />
              </div>
            </div>
          );
        })}

        {linhas.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
            O modelo ainda não tem etapas. Adicione ao menos a medição exata (ela inicia o relógio do prazo) e as demais etapas da obra.
          </p>
        ) : null}
      </section>

      {avisos.length > 0 ? (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100" aria-labelledby="sec-avisos">
          <h2 id="sec-avisos" className="mb-1 flex items-center gap-2 font-medium">
            <TriangleAlert className="size-4" aria-hidden /> Atenção
          </h2>
          <ul className="list-disc pl-5">
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {erro ? (
        <p role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      ) : "erro" in lido && linhas.length > 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          {lido.erro}
        </p>
      ) : null}

      <div className="bg-background/95 sticky bottom-14 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t px-1 py-3 backdrop-blur md:bottom-0">
        <Button type="button" onClick={salvar} disabled={pendente || !sujo || "erro" in lido}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Salvar modelo
        </Button>
        <p className="text-muted-foreground text-xs">Mudar o modelo não altera as obras que já existem: cada obra guarda a sua cópia das etapas.</p>
      </div>
    </div>
  );
}
