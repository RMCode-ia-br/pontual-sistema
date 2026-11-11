"use client";

import { Download, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { CampoMascarado } from "@/components/campo-mascarado";
import { Campo, Selecao } from "@/components/formulario";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErroPlanilha } from "@/lib/csv/ler";
import { lerArquivoDePlanilha } from "@/lib/csv/arquivo";
import { gerarCsv } from "@/lib/csv";
import { formatarMoeda } from "@/lib/formatadores";
import { centavosParaCampo, mascararMoeda } from "@/lib/formatadores/mascaras";

import { excluirPreco, importarPrecos, salvarPreco } from "../actions/precos";
import { COBRANCAS, ROTULO_COBRANCA } from "../schemas";

type Opcao = { id: string; nome: string };
export type PrecoSerializado = {
  id: string;
  linhaId: string | null;
  acabamentoId: string | null;
  tipoVidroId: string | null;
  espessuraVidroMm: number | null;
  cobranca: (typeof COBRANCAS)[number];
  valorCentavos: number;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  linha: string | null;
  acabamento: string | null;
  tipoVidro: string | null;
};

type Props = {
  tipologiaId: string;
  cobrancaPadrao: (typeof COBRANCAS)[number];
  precos: PrecoSerializado[];
  opcoes: { linhas: Opcao[]; acabamentos: Opcao[]; tiposVidro: Opcao[]; espessuras: number[] };
  /** Combinações linha × acabamento sem preço (rótulos prontos). */
  semPreco: string[];
};

function dadosDoPreco(tipologiaId: string, v: Record<string, string>): FormData {
  const f = new FormData();
  f.set("tipologiaId", tipologiaId);
  for (const [k, val] of Object.entries(v)) f.set(k, val);
  return f;
}

export function PainelPrecos({ tipologiaId, cobrancaPadrao, precos, opcoes, semPreco }: Props) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<PrecoSerializado | null>(null);
  const [edicao, setEdicao] = useState<Record<string, { valor: string; cobranca: string }>>({});
  const [relatorio, setRelatorio] = useState<string | null>(null);
  const [chaveForm, setChaveForm] = useState(0);
  const arquivo = useRef<HTMLInputElement>(null);

  function adicionar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    dados.set("tipologiaId", tipologiaId);
    setErroNovo(null);
    iniciar(async () => {
      const r = await salvarPreco(null, dados);
      if (!r.ok) {
        setErroNovo(r.erro);
        return;
      }
      toast.success(r.mensagem ?? "Preço adicionado.");
      setChaveForm((c) => c + 1);
      router.refresh();
    });
  }

  function salvarLinha(p: PrecoSerializado) {
    const e = edicao[p.id];
    if (!e) return;
    iniciar(async () => {
      const r = await salvarPreco(
        null,
        dadosDoPreco(tipologiaId, {
          id: p.id,
          linhaId: p.linhaId ?? "",
          acabamentoId: p.acabamentoId ?? "",
          tipoVidroId: p.tipoVidroId ?? "",
          espessuraVidroMm: p.espessuraVidroMm ? String(p.espessuraVidroMm) : "",
          cobranca: e.cobranca,
          valor: e.valor,
          vigenciaInicio: p.vigenciaInicio ?? "",
          vigenciaFim: p.vigenciaFim ?? "",
        }),
      );
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success("Preço atualizado.");
      setEdicao((a) => Object.fromEntries(Object.entries(a).filter(([k]) => k !== p.id)));
      router.refresh();
    });
  }

  function remover() {
    if (!removendo) return;
    iniciar(async () => {
      const r = await excluirPreco(tipologiaId, removendo.id);
      setRemovendo(null);
      if (!r.ok) toast.error(r.erro);
      else {
        toast.success("Preço removido.");
        router.refresh();
      }
    });
  }

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const escolhido = e.target.files?.[0];
    e.target.value = "";
    if (!escolhido) return;
    setRelatorio(null);
    try {
      const planilha = await lerArquivoDePlanilha(escolhido);
      iniciar(async () => {
        const r = await importarPrecos({ tipologiaId, linhas: planilha.linhas });
        if (r.ok) {
          setRelatorio(r.mensagem ?? "Importação concluída.");
          toast.success(r.mensagem ?? "Importação concluída.");
          router.refresh();
        } else {
          setRelatorio(r.erro);
        }
      });
    } catch (erro) {
      setRelatorio(erro instanceof ErroPlanilha ? erro.message : "Não consegui ler o arquivo.");
    }
  }

  function baixarModelo() {
    const csv = gerarCsv(["Linha", "Acabamento", "Vidro", "Espessura (mm)", "Cobrança", "Valor (R$)"], [["", "", "", "", ROTULO_COBRANCA[cobrancaPadrao], ""]]);
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-tabela-de-precos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-6">
      <p className="text-muted-foreground text-sm">
        A tabela define o preço do item no modo <strong>Tabela</strong>. Coluna em branco vale para qualquer valor; vale a linha mais específica. A cor/acabamento é uma linha própria (não é percentual). Sem linha correspondente, o item da proposta cai no valor manual, com aviso.
      </p>

      {semPreco.length > 0 && precos.length > 0 ? (
        <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <strong>Combinações sem preço ({semPreco.length}):</strong> {semPreco.slice(0, 12).join("; ")}
          {semPreco.length > 12 ? "…" : ""}
        </div>
      ) : null}

      <form key={chaveForm} onSubmit={adicionar} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Novo preço">
        <h2 className="font-medium sm:col-span-2 lg:col-span-4">Novo preço</h2>
        <Campo id="p-linha" rotulo="Linha">
          <Selecao id="p-linha" name="linhaId" defaultValue="">
            <option value="">Qualquer</option>
            {opcoes.linhas.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="p-acab" rotulo="Acabamento">
          <Selecao id="p-acab" name="acabamentoId" defaultValue="">
            <option value="">Qualquer</option>
            {opcoes.acabamentos.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="p-vidro" rotulo="Tipo de vidro">
          <Selecao id="p-vidro" name="tipoVidroId" defaultValue="">
            <option value="">Qualquer</option>
            {opcoes.tiposVidro.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="p-esp" rotulo="Espessura">
          <Selecao id="p-esp" name="espessuraVidroMm" defaultValue="">
            <option value="">Qualquer</option>
            {opcoes.espessuras.map((mm) => (
              <option key={mm} value={mm}>
                {mm} mm
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="p-cob" rotulo="Cobrança" obrigatorio>
          <Selecao id="p-cob" name="cobranca" defaultValue={cobrancaPadrao}>
            {COBRANCAS.map((c) => (
              <option key={c} value={c}>
                {ROTULO_COBRANCA[c]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="p-valor" rotulo="Valor (R$)" obrigatorio>
          <CampoMascarado id="p-valor" name="valor" mascara={mascararMoeda} inputMode="numeric" placeholder="0,00" required autoComplete="off" />
        </Campo>
        <Campo id="p-ini" rotulo="Vigência: início">
          <Input id="p-ini" name="vigenciaInicio" type="date" />
        </Campo>
        <Campo id="p-fim" rotulo="Vigência: fim">
          <Input id="p-fim" name="vigenciaFim" type="date" />
        </Campo>
        {erroNovo ? (
          <p role="alert" className="text-destructive text-sm sm:col-span-2 lg:col-span-4">
            {erroNovo}
          </p>
        ) : null}
        <div className="sm:col-span-2 lg:col-span-4">
          <Button type="submit" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Adicionar preço
          </Button>
        </div>
      </form>

      <section aria-labelledby="sec-import" className="grid gap-2 rounded-xl border p-4">
        <h2 id="sec-import" className="font-medium">
          Importar planilha
        </h2>
        <p className="text-muted-foreground text-sm">Colunas: Linha; Acabamento; Vidro; Espessura (mm); Cobrança; Valor. Tudo ou nada: se houver erro, nada é gravado e as linhas com problema são listadas. Combinação que já existe tem o valor atualizado.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={baixarModelo}>
            <Download aria-hidden /> Baixar modelo
          </Button>
          <Button type="button" variant="outline" disabled={pendente} onClick={() => arquivo.current?.click()}>
            <Upload aria-hidden /> Enviar CSV ou XLSX
          </Button>
          <input ref={arquivo} type="file" accept=".csv,.txt,.xlsx" className="sr-only" onChange={aoEscolherArquivo} aria-label="Escolher planilha de preços" />
        </div>
        {relatorio ? (
          <p role="status" className="text-sm">
            {relatorio}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="sec-tabela" className="grid gap-2">
        <h2 id="sec-tabela" className="font-medium">
          Preços cadastrados ({precos.length})
        </h2>
        {precos.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Nenhum preço ainda. Adicione acima ou importe uma planilha. Nada foi preenchido por conta própria.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs">
                <tr>
                  <th className="p-2">Linha</th>
                  <th className="p-2">Acabamento</th>
                  <th className="p-2">Vidro</th>
                  <th className="p-2">Cobrança</th>
                  <th className="p-2">Valor (R$)</th>
                  <th className="p-2">Vigência</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {precos.map((p) => {
                  const e = edicao[p.id];
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="p-2">{p.linha ?? "Qualquer"}</td>
                      <td className="p-2">{p.acabamento ?? "Qualquer"}</td>
                      <td className="p-2">{[p.tipoVidro ?? "Qualquer", p.espessuraVidroMm ? `${p.espessuraVidroMm} mm` : null].filter(Boolean).join(" · ")}</td>
                      <td className="p-2">
                        <Selecao
                          aria-label={`Cobrança do preço ${p.linha ?? ""} ${p.acabamento ?? ""}`}
                          value={e?.cobranca ?? p.cobranca}
                          onChange={(ev) => setEdicao((a) => ({ ...a, [p.id]: { valor: a[p.id]?.valor ?? centavosParaCampo(p.valorCentavos), cobranca: ev.target.value } }))}
                        >
                          {COBRANCAS.map((c) => (
                            <option key={c} value={c}>
                              {ROTULO_COBRANCA[c]}
                            </option>
                          ))}
                        </Selecao>
                      </td>
                      <td className="p-2">
                        <CampoMascarado
                          aria-label={`Valor do preço ${p.linha ?? ""} ${p.acabamento ?? ""} (atual ${formatarMoeda(p.valorCentavos)})`}
                          mascara={mascararMoeda}
                          inputMode="numeric"
                          className="w-28"
                          value={e?.valor ?? centavosParaCampo(p.valorCentavos)}
                          onChange={(ev) => setEdicao((a) => ({ ...a, [p.id]: { valor: ev.target.value, cobranca: a[p.id]?.cobranca ?? p.cobranca } }))}
                        />
                      </td>
                      <td className="text-muted-foreground p-2 text-xs">{p.vigenciaInicio || p.vigenciaFim ? `${p.vigenciaInicio ?? "…"} a ${p.vigenciaFim ?? "…"}` : "Sempre"}</td>
                      <td className="p-2 text-right whitespace-nowrap">
                        {e ? (
                          <Button type="button" size="sm" disabled={pendente} onClick={() => salvarLinha(p)}>
                            Salvar
                          </Button>
                        ) : null}
                        <Button type="button" size="sm" variant="ghost" onClick={() => setRemovendo(p)} aria-label={`Remover preço ${p.linha ?? ""} ${p.acabamento ?? ""}`}>
                          <Trash2 aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmarAcao aberto={!!removendo} aoFechar={() => setRemovendo(null)} titulo="Remover este preço?" descricao="Propostas já feitas não mudam. Itens futuros nessa combinação caem no valor manual." botao="Remover" pendente={pendente} aoConfirmar={remover} />
    </div>
  );
}
