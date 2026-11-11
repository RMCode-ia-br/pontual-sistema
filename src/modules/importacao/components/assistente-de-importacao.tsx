"use client";

import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Undo2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { Campo, Selecao } from "@/components/formulario";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { gerarCsv } from "@/lib/csv";
import { lerArquivoDePlanilha } from "@/lib/csv/arquivo";
import { ErroPlanilha, LIMITES_PLANILHA, type Planilha } from "@/lib/csv/ler";
import { camposObrigatoriosSemColuna, sugerirMapeamento } from "@/lib/dominio/mapeamento";
import { cn } from "@/lib/utils";

import { analisarPlanilha, confirmarImportacao, desfazerImportacao, type PreviaDaImportacao } from "../actions";
import { CAMPOS_POR_TIPO, PERMITE_ATUALIZAR, ROTULO_DUPLICADAS, ROTULO_TIPO, TIPOS_DE_IMPORTACAO, type TipoDeImportacao } from "../campos";

const PASSOS = ["Arquivo", "Colunas", "Conferência", "Resultado"] as const;

const ONDE_VER: Record<TipoDeImportacao, { href: string; rotulo: string }> = {
  CLIENTES: { href: "/clientes", rotulo: "Ver os clientes" },
  FORNECEDORES: { href: "/fornecedores", rotulo: "Ver os fornecedores" },
  PRODUTOS: { href: "/produtos", rotulo: "Ver os produtos" },
};

const ROTULO_STATUS = { NOVA: "Nova", ATUALIZARA: "Atualiza", DUPLICADA: "Repetida", ERRO: "Erro" } as const;
const VARIANTE_STATUS = { NOVA: "secondary", ATUALIZARA: "default", DUPLICADA: "outline", ERRO: "destructive" } as const;

/** Limite do que viaja ao servidor de uma vez (o Next recusa corpos maiores que o configurado). */
const LIMITE_DO_ENVIO_BYTES = 4 * 1024 * 1024;

type Resultado = { loteId: string; criados: number; atualizados: number; ignorados: number };

export function AssistenteDeImportacao() {
  const router = useRouter();
  const entradaArquivo = useRef<HTMLInputElement>(null);
  const [passo, setPasso] = useState(0);
  const [tipo, setTipo] = useState<TipoDeImportacao>("PRODUTOS");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [planilha, setPlanilha] = useState<Planilha | null>(null);
  const [mapeamento, setMapeamento] = useState<Record<string, number | null>>({});
  const [modo, setModo] = useState<"IGNORAR" | "ATUALIZAR">("IGNORAR");
  const [previa, setPrevia] = useState<PreviaDaImportacao | null>(null);
  const [importarValidas, setImportarValidas] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [desfeito, setDesfeito] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [analisando, analisar] = useTransition();
  const [gravando, gravar] = useTransition();
  const [desfazendo, desfazer] = useTransition();
  const [confirmandoDesfazer, setConfirmandoDesfazer] = useState(false);

  const campos = CAMPOS_POR_TIPO[tipo];
  const faltando = camposObrigatoriosSemColuna(campos, mapeamento);

  function recomecar() {
    setPasso(0);
    setPlanilha(null);
    setNomeArquivo("");
    setMapeamento({});
    setModo("IGNORAR");
    setPrevia(null);
    setImportarValidas(false);
    setResultado(null);
    setDesfeito(null);
    setErro(null);
  }

  function baixarModelo() {
    const csv = gerarCsv(campos.map((c) => c.rotulo), []);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `modelo-${tipo.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setErro(null);
    setLendo(true);
    try {
      const lida = await lerArquivoDePlanilha(arquivo);
      setPlanilha(lida);
      setNomeArquivo(arquivo.name);
      setMapeamento(sugerirMapeamento(lida.cabecalho, campos));
      setModo("IGNORAR");
      setPrevia(null);
      setPasso(1);
    } catch (falha) {
      setErro(falha instanceof ErroPlanilha ? falha.message : "Não consegui ler o arquivo. Confira se é um .csv ou .xlsx válido.");
    } finally {
      setLendo(false);
    }
  }

  function corpoDoPedido() {
    return { tipo, nomeArquivo, mapeamento, linhas: planilha?.linhas ?? [], modo: PERMITE_ATUALIZAR[tipo] ? modo : "IGNORAR" };
  }

  function conferir() {
    if (!planilha) return;
    const corpo = corpoDoPedido();
    if (JSON.stringify(corpo).length > LIMITE_DO_ENVIO_BYTES) {
      setErro("A planilha é grande demais para enviar de uma vez. Divida o arquivo em partes menores.");
      return;
    }
    setErro(null);
    analisar(async () => {
      const r = await analisarPlanilha(corpo);
      if (r.ok && r.dados) {
        setPrevia(r.dados);
        setImportarValidas(false);
        setPasso(2);
      } else if (!r.ok) setErro(r.erro);
    });
  }

  function importar() {
    if (!planilha) return;
    setErro(null);
    gravar(async () => {
      const r = await confirmarImportacao({ ...corpoDoPedido(), importarValidas });
      if (r.ok && r.dados) {
        toast.success(r.mensagem ?? "Importação concluída.");
        setResultado(r.dados);
        setPasso(3);
        router.refresh();
      } else if (!r.ok) setErro(r.erro);
    });
  }

  function desfazerEsta() {
    if (!resultado) return;
    desfazer(async () => {
      const r = await desfazerImportacao(resultado.loteId);
      setConfirmandoDesfazer(false);
      if (r.ok) {
        toast.success(r.mensagem ?? "Importação desfeita.");
        setDesfeito(r.mensagem ?? "Importação desfeita.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  const gravaveis = previa ? previa.totais.novas + previa.totais.atualizacoes : 0;
  const temErros = !!previa && previa.totais.erros > 0;
  const podeImportar = gravaveis > 0 && (!temErros || importarValidas);

  return (
    <div className="grid gap-6">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Passos da importação">
        {PASSOS.map((nome, i) => (
          <li
            key={nome}
            aria-current={i === passo ? "step" : undefined}
            className={cn("inline-flex min-h-9 items-center gap-2 rounded-full border px-3", i === passo ? "bg-primary text-primary-foreground border-primary" : i < passo ? "text-foreground" : "text-muted-foreground")}
          >
            <span className="tabular-nums">{i + 1}.</span> {nome}
          </li>
        ))}
      </ol>

      {erro ? (
        <p role="alert" className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2 rounded-xl border p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {erro}
        </p>
      ) : null}

      {/* Passo 1 */}
      {passo === 0 ? (
        <section aria-labelledby="passo-1" className="grid gap-4">
          <h2 id="passo-1" className="font-medium">
            O que você vai importar?
          </h2>
          <fieldset className="grid gap-2 sm:grid-cols-3">
            <legend className="sr-only">Tipo de cadastro</legend>
            {TIPOS_DE_IMPORTACAO.map((t) => (
              <label key={t} className={cn("flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm", tipo === t ? "border-primary bg-primary/5 font-medium" : "hover:bg-accent")}>
                <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => setTipo(t)} className="accent-primary size-4" />
                {ROTULO_TIPO[t]}
              </label>
            ))}
          </fieldset>

          <div className="grid gap-3 rounded-xl border p-4">
            <p className="text-sm">
              Aceita arquivos <strong>.csv</strong> e <strong>.xlsx</strong>, até {LIMITES_PLANILHA.bytes / 1024 / 1024} MB e {LIMITES_PLANILHA.linhas.toLocaleString("pt-BR")} linhas. A primeira linha precisa ter os nomes das colunas.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={baixarModelo}>
                <Download aria-hidden /> Baixar modelo de planilha
              </Button>
              <Button type="button" onClick={() => entradaArquivo.current?.click()} disabled={lendo}>
                {lendo ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />} {lendo ? "Lendo o arquivo..." : "Escolher arquivo"}
              </Button>
              <input ref={entradaArquivo} type="file" accept=".csv,.txt,.xlsx" className="sr-only" tabIndex={-1} aria-label="Escolher a planilha para importar" onChange={aoEscolherArquivo} data-testid="entrada-planilha" />
            </div>
            <p className="text-muted-foreground text-xs">O arquivo é lido no seu navegador; só as linhas seguem para o sistema, e tudo é conferido de novo antes de gravar.</p>
          </div>

          <details className="rounded-xl border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Colunas aceitas em {ROTULO_TIPO[tipo].toLowerCase()}</summary>
            <dl className="mt-2 grid gap-2">
              {campos.map((c) => (
                <div key={c.chave}>
                  <dt className="font-medium">
                    {c.rotulo}
                    {c.obrigatorio ? <span className="text-destructive"> (obrigatória)</span> : null}
                  </dt>
                  <dd className="text-muted-foreground">{c.ajuda}</dd>
                </div>
              ))}
            </dl>
          </details>
        </section>
      ) : null}

      {/* Passo 2 */}
      {passo === 1 && planilha ? (
        <section aria-labelledby="passo-2" className="grid gap-4">
          <div>
            <h2 id="passo-2" className="font-medium">
              Quais colunas da planilha são cada informação?
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              <FileSpreadsheet className="mr-1 inline size-4" aria-hidden />
              {nomeArquivo}: {planilha.linhas.length.toLocaleString("pt-BR")} {planilha.linhas.length === 1 ? "linha" : "linhas"}. Já sugeri as colunas pelo nome; confira e ajuste.
            </p>
          </div>
          <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
            {campos.map((c) => (
              <Campo key={c.chave} id={`col-${c.chave}`} rotulo={c.rotulo} obrigatorio={c.obrigatorio} dica={c.ajuda}>
                <Selecao
                  id={`col-${c.chave}`}
                  value={mapeamento[c.chave] ?? ""}
                  onChange={(e) => setMapeamento((m) => ({ ...m, [c.chave]: e.target.value === "" ? null : Number(e.target.value) }))}
                >
                  <option value="">Não importar</option>
                  {planilha.cabecalho.map((nome, i) => (
                    <option key={i} value={i}>
                      {nome}
                      {planilha.linhas[0]?.[i] ? ` (ex.: ${planilha.linhas[0][i].slice(0, 24)})` : ""}
                    </option>
                  ))}
                </Selecao>
              </Campo>
            ))}
          </div>

          {PERMITE_ATUALIZAR[tipo] ? (
            <Campo id="modo" rotulo="Quando o código já existir" dica="Atualizar só mexe nas colunas preenchidas; célula vazia nunca apaga o que já existe.">
              <Selecao id="modo" value={modo} onChange={(e) => setModo(e.target.value === "ATUALIZAR" ? "ATUALIZAR" : "IGNORAR")}>
                <option value="IGNORAR">{ROTULO_DUPLICADAS.IGNORAR}</option>
                <option value="ATUALIZAR">{ROTULO_DUPLICADAS.ATUALIZAR}</option>
              </Selecao>
            </Campo>
          ) : (
            <p className="text-muted-foreground text-sm">Cadastros que já existem (mesmo {tipo === "CLIENTES" ? "CPF/CNPJ ou telefone" : "CNPJ"}) são ignorados, nunca duplicados.</p>
          )}

          {faltando.length > 0 ? (
            <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
              Falta escolher a coluna de: {faltando.map((c) => c.rotulo).join(", ")}.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={conferir} disabled={analisando || faltando.length > 0}>
              {analisando ? <Loader2 className="animate-spin" aria-hidden /> : null} Conferir a planilha
            </Button>
            <Button type="button" variant="ghost" onClick={recomecar}>
              Trocar de arquivo
            </Button>
          </div>
        </section>
      ) : null}

      {/* Passo 3 */}
      {passo === 2 && previa ? (
        <section aria-labelledby="passo-3" className="grid gap-4">
          <h2 id="passo-3" className="font-medium">
            Conferência: o que vai acontecer
          </h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-lg border p-3">
              <dt className="text-muted-foreground text-xs">Novos</dt>
              <dd className="text-lg font-semibold tabular-nums">{previa.totais.novas}</dd>
            </div>
            <div className="rounded-lg border p-3">
              <dt className="text-muted-foreground text-xs">Atualizados</dt>
              <dd className="text-lg font-semibold tabular-nums">{previa.totais.atualizacoes}</dd>
            </div>
            <div className="rounded-lg border p-3">
              <dt className="text-muted-foreground text-xs">Repetidos (ignorados)</dt>
              <dd className="text-lg font-semibold tabular-nums">{previa.totais.duplicadas}</dd>
            </div>
            <div className={cn("rounded-lg border p-3", previa.totais.erros > 0 && "border-destructive/50")}>
              <dt className="text-muted-foreground text-xs">Com erro</dt>
              <dd className="text-lg font-semibold tabular-nums">{previa.totais.erros}</dd>
            </div>
          </dl>

          {previa.linhas.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <caption className="sr-only">Linhas da planilha e o que acontece com cada uma</caption>
                <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Linha</th>
                    <th scope="col" className="px-3 py-2 font-medium">Situação</th>
                    <th scope="col" className="px-3 py-2 font-medium">Registro</th>
                    <th scope="col" className="px-3 py-2 font-medium">Detalhe</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {previa.linhas.map((l) => (
                    <tr key={l.numero} className="align-top">
                      <td className="px-3 py-2 tabular-nums">{l.numero}</td>
                      <td className="px-3 py-2">
                        <Badge variant={VARIANTE_STATUS[l.status]}>{ROTULO_STATUS[l.status]}</Badge>
                      </td>
                      <td className="px-3 py-2">{l.resumo}</td>
                      <td className="text-muted-foreground px-3 py-2">{l.detalhe.length ? l.detalhe.join(" ") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {previa.omitidas > 0 ? <p className="text-muted-foreground text-xs">A tela lista os problemas primeiro e uma amostra das linhas novas; os totais valem para as {previa.totais.total} linhas.</p> : null}

          {temErros ? (
            <label className="flex min-h-9 cursor-pointer items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <input type="checkbox" className="accent-primary mt-0.5 size-4" checked={importarValidas} onChange={(e) => setImportarValidas(e.target.checked)} />
              <span>
                Importar só as {gravaveis} linhas válidas e deixar de fora as {previa.totais.erros} com erro. (Dá para corrigir a planilha e importar as demais depois.)
              </span>
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={importar} disabled={gravando || !podeImportar}>
              {gravando ? <Loader2 className="animate-spin" aria-hidden /> : null} Importar {gravaveis} {gravaveis === 1 ? "registro" : "registros"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setPasso(1)}>
              Voltar às colunas
            </Button>
            <Button type="button" variant="ghost" onClick={recomecar}>
              Cancelar
            </Button>
          </div>
          {gravaveis === 0 ? <p className="text-muted-foreground text-sm">Nenhuma linha pode ser importada. Corrija a planilha e envie de novo.</p> : null}
        </section>
      ) : null}

      {/* Passo 4 */}
      {passo === 3 && resultado ? (
        <section aria-labelledby="passo-4" className="grid gap-4">
          <h2 id="passo-4" className="sr-only">
            Resultado da importação
          </h2>
          <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-600/40 bg-emerald-600/10 p-4 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
            <div>
              <p className="font-medium">
                {desfeito
                  ? desfeito
                  : `Importação concluída: ${resultado.criados} ${resultado.criados === 1 ? "criado" : "criados"}${resultado.atualizados ? `, ${resultado.atualizados} atualizados` : ""}${resultado.ignorados ? `, ${resultado.ignorados} ignorados` : ""}.`}
              </p>
              {desfeito ? null : <p className="text-muted-foreground mt-1">Fica registrada em “Importações anteriores”, de onde dá para desfazer.</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={ONDE_VER[tipo].href} className={buttonVariants()}>
              {ONDE_VER[tipo].rotulo}
            </Link>
            <Button type="button" variant="outline" onClick={recomecar}>
              Nova importação
            </Button>
            {desfeito ? null : (
              <Button type="button" variant="ghost" onClick={() => setConfirmandoDesfazer(true)}>
                <Undo2 aria-hidden /> Desfazer esta importação
              </Button>
            )}
          </div>
        </section>
      ) : null}

      <ConfirmarAcao
        aberto={confirmandoDesfazer}
        aoFechar={() => setConfirmandoDesfazer(false)}
        titulo="Desfazer esta importação?"
        descricao="O que ela criou vai para a lixeira e o que ela atualizou volta ao valor anterior (exceto o que já foi alterado depois)."
        botao="Desfazer importação"
        pendente={desfazendo}
        aoConfirmar={desfazerEsta}
      />
    </div>
  );
}
