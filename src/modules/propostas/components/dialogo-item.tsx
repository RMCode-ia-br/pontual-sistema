"use client";

import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { DesenhoEsquadria } from "@/components/desenho-esquadria";
import { AreaTexto, Selecao } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { gerarDescricao, valoresDoTemplate } from "@/lib/dominio/descricao-item";
import type { TipoDesenho } from "@/lib/dominio/desenho";
import { areaM2, pontosBaseParaPercentual } from "@/lib/dominio/preco";
import { formatarMoeda } from "@/lib/formatadores";
import { centavosParaCampo, mascararMoeda } from "@/lib/formatadores/mascaras";

import { calcularPreviaDoItem, salvarItem } from "../actions/estrutura";
import { ROTULO_MODO_PRECO, MODOS_PRECO } from "../schemas";
import type { ItemSer, OpcoesEditor } from "../tipos";

type LinhaMedida = { chave: string; largura: string; altura: string; quantidade: string; local: string };
let contador = 0;
const novaChave = () => `m${++contador}`;

type Props = {
  aberto: boolean;
  aoFechar: () => void;
  propostaId: string;
  opcaoId: string;
  grupoId: string | null;
  grupos: { id: string; nome: string }[];
  opcoesDaProposta: { id: string; nome: string }[];
  item: ItemSer | null;
  opcoes: OpcoesEditor;
  descricoesMaiusculas: boolean;
  aoSalvar: () => void;
};

type Previa = { ok: true; preco: number; custo: number | null; markupPb: number | null; aviso: string | null; modo: string } | { ok: false; erro: string };

const inteiro = (t: string) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : null);

export function DialogoItem({ aberto, aoFechar, propostaId, opcaoId, grupoId, grupos, opcoesDaProposta, item, opcoes, descricoesMaiusculas, aoSalvar }: Props) {
  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{item ? "Editar item" : "Novo item"}</DialogTitle>
          <DialogDescription>Escolha a tipologia, as medidas e como calcular o preço. A descrição técnica é gerada sozinha e pode ser editada.</DialogDescription>
        </DialogHeader>
        {/* O formulário só monta com o diálogo aberto: cada abertura começa do estado certo. */}
        {aberto ? <FormItem {...{ aoFechar, propostaId, opcaoId, grupoId, grupos, opcoesDaProposta, item, opcoes, descricoesMaiusculas, aoSalvar }} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function FormItem({ aoFechar, propostaId, opcaoId, grupoId, grupos, opcoesDaProposta, item, opcoes, descricoesMaiusculas, aoSalvar }: Omit<Props, "aberto">) {
  const [tipologiaId, setTipologiaId] = useState(item?.tipologiaId ?? "");
  const [linhaId, setLinhaId] = useState(item?.linhaId ?? "");
  const [acabamentoId, setAcabamentoId] = useState(item?.acabamentoId ?? "");
  const [tipoVidroId, setTipoVidroId] = useState(item?.tipoVidroId ?? "");
  const [espessura, setEspessura] = useState(item?.espessuraVidroMm ? String(item.espessuraVidroMm) : "");
  const [folhas, setFolhas] = useState(item?.folhas ? String(item.folhas) : "");
  const [faces, setFaces] = useState(item?.faces ? String(item.faces) : "");
  const [torres, setTorres] = useState(item?.torresCm ? String(item.torresCm) : "");
  const [opcaoEscolhida, setOpcaoEscolhida] = useState(item?.opcaoId ?? opcaoId);
  const [grupoEscolhido, setGrupoEscolhido] = useState(item?.grupoId ?? grupoId ?? "");
  const [medidas, setMedidas] = useState<LinhaMedida[]>(() =>
    item && item.medidas.length > 0
      ? item.medidas.map((m) => ({ chave: novaChave(), largura: String(m.larguraMm), altura: String(m.alturaMm), quantidade: String(m.quantidade), local: m.local ?? "" }))
      : [{ chave: novaChave(), largura: "", altura: "", quantidade: "1", local: "" }],
  );
  const [descricao, setDescricao] = useState(item?.descricao ?? "");
  const [descricaoEditada, setDescricaoEditada] = useState(item?.descricaoEditada ?? false);
  const [local, setLocal] = useState(item?.local ?? "");
  const [observacoes, setObservacoes] = useState(item?.observacoes ?? "");
  const [modo, setModo] = useState<(typeof MODOS_PRECO)[number]>(item?.modoPreco ?? "MANUAL");
  const [valorManual, setValorManual] = useState(item?.valorManualCentavos ? centavosParaCampo(item.valorManualCentavos) : "");
  const [markup, setMarkup] = useState(item?.markupPb != null ? pontosBaseParaPercentual(item.markupPb) : "");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [errosCampo, setErrosCampo] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  const pedido = useRef(0);

  const tipologia = opcoes.tipologias.find((t) => t.id === tipologiaId) ?? null;
  const nome = (lista: { id: string; nome: string }[], id: string) => lista.find((x) => x.id === id)?.nome ?? null;

  const medidasLidas = useMemo(() => {
    const lidas = medidas.map((m) => ({ larguraMm: inteiro(m.largura), alturaMm: inteiro(m.altura), quantidade: inteiro(m.quantidade), local: m.local }));
    const ok = lidas.every((m) => m.larguraMm && m.alturaMm && m.quantidade);
    return { ok, lidas: lidas as { larguraMm: number; alturaMm: number; quantidade: number; local: string }[] };
  }, [medidas]);

  /** Descrição gerada pelo template da tipologia com o que já foi escolhido (nada é inventado: o que falta fica em branco). */
  const gerada = useMemo(() => {
    if (!tipologia || !medidasLidas.ok) return null;
    const f = inteiro(folhas);
    const fa = inteiro(faces);
    const r = gerarDescricao(
      tipologia.templateDescricao,
      valoresDoTemplate({ folhas: f, faces: fa, torresCm: inteiro(torres), linha: nome(opcoes.linhas, linhaId), tipoVidro: nome(opcoes.tiposVidro, tipoVidroId), espessuraMm: inteiro(espessura), acabamento: nome(opcoes.acabamentos, acabamentoId) }),
      medidasLidas.lidas,
    );
    return { texto: descricoesMaiusculas ? r.texto.toUpperCase() : r.texto, faltando: r.faltando };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipologia, medidasLidas, folhas, faces, linhaId, tipoVidroId, espessura, acabamentoId, torres, descricoesMaiusculas]);

  // Enquanto a descrição não foi editada à mão, acompanha o template (derivado: sem efeito).
  const descricaoAtual = descricaoEditada || !gerada ? descricao : gerada.texto;

  // Prévia do preço no servidor (com pequeno atraso para não consultar a cada tecla).
  const chaveDaPrevia = JSON.stringify([modo, tipologiaId, linhaId, acabamentoId, tipoVidroId, espessura, folhas, medidasLidas.ok ? medidasLidas.lidas : null, valorManual, markup]);
  useEffect(() => {
    if (!medidasLidas.ok) return;
    const numero = ++pedido.current;
    const espera = setTimeout(async () => {
      const r = await calcularPreviaDoItem(entradaDoServidor());
      if (numero !== pedido.current) return;
      if (r.ok && r.dados && "ok" in r.dados && r.dados.ok) setPrevia({ ok: true, preco: r.dados.precoTotalCentavos, custo: r.dados.custoEstimadoCentavos, markupPb: r.dados.markupPb, aviso: r.dados.aviso, modo: r.dados.modoPreco });
      else setPrevia({ ok: false, erro: r.ok ? "Não foi possível calcular." : r.erro });
    }, 450);
    return () => clearTimeout(espera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaPrevia]);

  function entradaDoServidor() {
    return {
      id: item?.id ?? null,
      propostaId,
      opcaoId: opcaoEscolhida,
      grupoId: grupoEscolhido || null,
      tipologiaId: tipologiaId || null,
      linhaId: linhaId || null,
      acabamentoId: acabamentoId || null,
      tipoVidroId: tipoVidroId || null,
      espessuraVidroMm: espessura,
      folhas,
      faces,
      torresCm: torres,
      descricao: descricaoAtual,
      descricaoEditada,
      local,
      observacoes,
      modoPreco: modo,
      valorManual,
      markup: modo === "COMPOSICAO" ? markup : "",
      medidas: medidasLidas.lidas.map((m) => ({ larguraMm: m.larguraMm, alturaMm: m.alturaMm, quantidade: m.quantidade, local: m.local })),
    };
  }

  function escolherTipologia(id: string) {
    setTipologiaId(id);
    const t = opcoes.tipologias.find((x) => x.id === id);
    if (t) {
      setFolhas(t.opcoesFolhas.length > 0 ? String(t.opcoesFolhas.includes(Number(folhas)) ? folhas : t.opcoesFolhas[0]) : "");
      if (modo === "MANUAL" && !valorManual) setModo("MANUAL");
    }
    setDescricaoEditada(false);
  }

  function salvar() {
    setErro(null);
    setErrosCampo({});
    if (!medidasLidas.ok) {
      setErro("Preencha largura, altura e quantidade de todas as medidas (números inteiros; largura e altura em milímetros).");
      return;
    }
    iniciar(async () => {
      const r = await salvarItem(entradaDoServidor());
      if (r.ok) {
        toast.success(r.mensagem ?? "Item salvo.");
        aoSalvar();
        aoFechar();
      } else {
        setErro(r.erro);
        setErrosCampo(r.campos ?? {});
      }
    });
  }

  const previaVisivel = medidasLidas.ok ? previa : null;
  const desenho = tipologia ? (tipologia.tipoDesenho as TipoDesenho) : "GENERICO";
  const primeira = medidasLidas.ok ? medidasLidas.lidas[0] : { larguraMm: 2000, alturaMm: 1200 };
  const temFaces = tipologia?.templateDescricao.includes("{FACES}");
  const temTorres = tipologia?.templateDescricao.includes("{TORRES_CM}");

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm sm:col-span-2">
            Tipologia
            <Selecao value={tipologiaId} onChange={(e) => escolherTipologia(e.target.value)} aria-label="Tipologia">
              <option value="">Sem tipologia (item livre)</option>
              {opcoes.tipologias.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </Selecao>
          </label>
          <label className="grid gap-1 text-sm">
            Linha de alumínio
            <Selecao value={linhaId} onChange={(e) => setLinhaId(e.target.value)} aria-label="Linha de alumínio">
              <option value="">—</option>
              {opcoes.linhas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </Selecao>
          </label>
          <label className="grid gap-1 text-sm">
            Acabamento
            <Selecao value={acabamentoId} onChange={(e) => setAcabamentoId(e.target.value)} aria-label="Acabamento">
              <option value="">—</option>
              {opcoes.acabamentos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </Selecao>
          </label>
          <label className="grid gap-1 text-sm">
            Vidro
            <Selecao value={tipoVidroId} onChange={(e) => setTipoVidroId(e.target.value)} aria-label="Tipo de vidro">
              <option value="">—</option>
              {opcoes.tiposVidro.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </Selecao>
          </label>
          <label className="grid gap-1 text-sm">
            Espessura do vidro
            <Selecao value={espessura} onChange={(e) => setEspessura(e.target.value)} aria-label="Espessura do vidro">
              <option value="">—</option>
              {opcoes.espessuras.map((mm) => (
                <option key={mm} value={mm}>
                  {mm} mm
                </option>
              ))}
            </Selecao>
          </label>
          {tipologia && tipologia.opcoesFolhas.length > 0 ? (
            <label className="grid gap-1 text-sm">
              Folhas
              <Selecao value={folhas} onChange={(e) => setFolhas(e.target.value)} aria-label="Folhas">
                {tipologia.opcoesFolhas.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Selecao>
            </label>
          ) : null}
          {temFaces ? (
            <label className="grid gap-1 text-sm">
              Faces
              <Input inputMode="numeric" value={faces} maxLength={2} onChange={(e) => setFaces(e.target.value)} aria-label="Faces" />
            </label>
          ) : null}
          {temTorres ? (
            <label className="grid gap-1 text-sm">
              Torres (cm)
              <Input inputMode="numeric" value={torres} maxLength={3} onChange={(e) => setTorres(e.target.value)} aria-label="Torres em centímetros" />
            </label>
          ) : null}
        </div>
        <div className="hidden rounded-lg border p-2 sm:block" aria-hidden>
          <DesenhoEsquadria tipo={desenho} folhas={inteiro(folhas)} larguraMm={primeira.larguraMm || 2000} alturaMm={primeira.alturaMm || 1200} />
        </div>
      </div>

      <fieldset className="grid gap-2 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Medidas (mm) — vários vãos iguais no mesmo valor</legend>
        {medidas.map((m, i) => (
          <div key={m.chave} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_5rem_1fr_auto]">
            <Input inputMode="numeric" placeholder="Largura" value={m.largura} maxLength={5} aria-label={`Largura da medida ${i + 1}`} onChange={(e) => setMedidas((a) => a.map((x) => (x.chave === m.chave ? { ...x, largura: e.target.value } : x)))} />
            <Input inputMode="numeric" placeholder="Altura" value={m.altura} maxLength={5} aria-label={`Altura da medida ${i + 1}`} onChange={(e) => setMedidas((a) => a.map((x) => (x.chave === m.chave ? { ...x, altura: e.target.value } : x)))} />
            <Input inputMode="numeric" placeholder="Qtd" value={m.quantidade} maxLength={4} aria-label={`Quantidade da medida ${i + 1}`} onChange={(e) => setMedidas((a) => a.map((x) => (x.chave === m.chave ? { ...x, quantidade: e.target.value } : x)))} />
            <Input placeholder="Local (opcional)" value={m.local} maxLength={120} aria-label={`Local da medida ${i + 1}`} onChange={(e) => setMedidas((a) => a.map((x) => (x.chave === m.chave ? { ...x, local: e.target.value } : x)))} />
            <Button type="button" variant="ghost" size="sm" disabled={medidas.length === 1} aria-label={`Remover medida ${i + 1}`} onClick={() => setMedidas((a) => a.filter((x) => x.chave !== m.chave))}>
              <Trash2 aria-hidden />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setMedidas((a) => [...a, { chave: novaChave(), largura: "", altura: "", quantidade: "1", local: "" }])}>
            <Plus aria-hidden /> Medida
          </Button>
          {medidasLidas.ok ? (
            <span className="text-muted-foreground text-xs">
              {medidasLidas.lidas.reduce((s, m) => s + m.quantidade, 0)} un · {areaM2(medidasLidas.lidas).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²
            </span>
          ) : null}
        </div>
      </fieldset>

      <label className="grid gap-1 text-sm">
        <span className="flex items-center justify-between gap-2">
          Descrição técnica {descricaoEditada ? "(editada à mão)" : tipologia ? "(gerada pelo modelo)" : ""}
          {descricaoEditada && gerada ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDescricaoEditada(false)}>
              <RefreshCw aria-hidden /> Gerar de novo
            </Button>
          ) : null}
        </span>
        <AreaTexto value={descricaoAtual} rows={4} maxLength={1500} aria-label="Descrição técnica" onChange={(e) => { setDescricao(e.target.value); setDescricaoEditada(true); }} />
        {gerada && gerada.faltando.length > 0 && !descricaoEditada ? <span className="text-xs text-amber-700 dark:text-amber-400">Faltam no modelo: {gerada.faltando.map((f) => `{${f}}`).join(" ")}. Escolha acima ou edite o texto.</span> : null}
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Local do item (opcional)
          <Input value={local} maxLength={120} onChange={(e) => setLocal(e.target.value)} aria-label="Local do item" />
        </label>
        <label className="grid gap-1 text-sm">
          Observações (opcional)
          <Input value={observacoes} maxLength={1000} onChange={(e) => setObservacoes(e.target.value)} aria-label="Observações do item" />
        </label>
        <label className="grid gap-1 text-sm">
          Opção
          <Selecao value={opcaoEscolhida} onChange={(e) => setOpcaoEscolhida(e.target.value)} aria-label="Opção do item">
            {opcoesDaProposta.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Selecao>
        </label>
        <label className="grid gap-1 text-sm">
          Seção
          <Selecao value={grupoEscolhido} onChange={(e) => setGrupoEscolhido(e.target.value)} aria-label="Seção do item">
            <option value="">Sem seção</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </Selecao>
        </label>
      </div>

      <fieldset className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
        <legend className="px-1 text-sm font-medium">Preço do item</legend>
        <label className="grid gap-1 text-sm">
          Como calcular
          <Selecao value={modo} onChange={(e) => setModo(e.target.value as typeof modo)} aria-label="Como calcular o preço">
            {MODOS_PRECO.map((m) => (
              <option key={m} value={m}>
                {ROTULO_MODO_PRECO[m]}
              </option>
            ))}
          </Selecao>
        </label>
        {modo === "MANUAL" || (previa && !previa.ok && modo === "TABELA") || errosCampo.valorManual ? (
          <label className="grid gap-1 text-sm">
            Valor do item (R$)
            <Input inputMode="numeric" placeholder="0,00" value={valorManual} maxLength={14} aria-label="Valor do item" onChange={(e) => setValorManual(mascararMoeda(e.target.value))} aria-invalid={!!errosCampo.valorManual} />
            {errosCampo.valorManual ? <span role="alert" className="text-destructive text-xs">{errosCampo.valorManual}</span> : <span className="text-muted-foreground text-xs">Preço total do item (todas as medidas).</span>}
          </label>
        ) : null}
        {modo === "COMPOSICAO" ? (
          <label className="grid gap-1 text-sm">
            Markup deste item (%) — opcional
            <Input inputMode="decimal" value={markup} maxLength={8} placeholder="vazio = o da proposta ou da categoria" aria-label="Markup do item" onChange={(e) => setMarkup(e.target.value)} />
          </label>
        ) : null}
        <div className="sm:col-span-2" aria-live="polite">
          {previaVisivel ? (
            previaVisivel.ok ? (
              <p className="text-sm">
                Preço: <strong>{formatarMoeda(previaVisivel.preco)}</strong>
                {previaVisivel.custo !== null ? <span className="text-muted-foreground"> · custo estimado {formatarMoeda(previaVisivel.custo)}</span> : null}
                {previaVisivel.markupPb !== null ? <span className="text-muted-foreground"> · markup {pontosBaseParaPercentual(previaVisivel.markupPb)}%</span> : null}
                {previaVisivel.aviso ? <span className="block text-xs text-amber-700 dark:text-amber-400">{previaVisivel.aviso}</span> : null}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">{previaVisivel.erro}</p>
            )
          ) : (
            <p className="text-muted-foreground text-sm">{medidasLidas.ok ? "Calculando…" : "Informe as medidas para ver o preço."}</p>
          )}
        </div>
      </fieldset>

      {erro ? (
        <p role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoFechar}>
          Cancelar
        </Button>
        <Button type="button" onClick={salvar} disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} {item ? "Salvar item" : "Adicionar item"}
        </Button>
      </DialogFooter>
    </div>
  );
}
