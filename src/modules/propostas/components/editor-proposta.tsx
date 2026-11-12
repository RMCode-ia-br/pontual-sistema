"use client";

import { ArrowDown, ArrowUp, Copy, FileInput, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { DesenhoEsquadria } from "@/components/desenho-esquadria";
import { AreaTexto, CaixaMarcacao, Selecao } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TipoDesenho } from "@/lib/dominio/desenho";
import { montarSecoes } from "@/lib/dominio/estrutura-proposta";
import { FORMAS_PAGAMENTO, GATILHOS, ROTULO_FORMA, ROTULO_GATILHO } from "@/lib/dominio/parcelas";
import { pontosBaseParaPercentual } from "@/lib/dominio/preco";
import { formatarMoeda } from "@/lib/formatadores";
import { centavosParaCampo, mascararMoeda } from "@/lib/formatadores/mascaras";
import { useProtecaoDeSaida } from "@/lib/hooks/usar-protecao-de-saida";

import { duplicarOpcao, duplicarItem, importarMedidasDaVisita, moverGrupo, moverItem, removerGrupo, removerItem, removerOpcao, salvarGrupo, salvarOpcao } from "../actions/estrutura";
import { salvarProposta } from "../actions/propostas";
import type { ItemSer, OpcoesEditor, PropostaSer } from "../tipos";
import { DialogoItem } from "./dialogo-item";
import { PainelTotais } from "./painel-totais";

type Props = { proposta: PropostaSer; opcoes: OpcoesEditor; somenteLeitura?: boolean; temMedidasDaVisita: boolean };

type LinhaParcela = { chave: string; descricao: string; percentual: string; gatilho: string; forma: string; diasApos: string; dataFixa: string; parcelasCartao: string };
let contador = 0;
const novaChave = () => `c${++contador}`;

const pct = (pb: number | null | undefined) => (pb === null || pb === undefined ? "" : pontosBaseParaPercentual(pb));

export function EditorProposta({ proposta, opcoes, somenteLeitura = false, temMedidasDaVisita }: Props) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [sujo, setSujo] = useState(false);
  useProtecaoDeSaida(sujo);

  // ----- Estado do formulário (cabeçalho + condições comerciais) -----
  const [f, setF] = useState(() => ({
    parte: proposta.parte ?? "",
    data: proposta.data,
    consultorNome: proposta.consultorNome ?? "",
    consultorCargo: proposta.consultorCargo ?? "",
    clienteNome: proposta.clienteNome,
    clienteDocumento: proposta.clienteDocumento ?? "",
    clienteContato: proposta.clienteContato ?? "",
    clienteTelefone: proposta.clienteTelefone ?? "",
    clienteEmail: proposta.clienteEmail ?? "",
    enderecoObra: proposta.enderecoObra ?? "",
    tituloEscopo: proposta.tituloEscopo,
    comNotaFiscal: proposta.comNotaFiscal,
    acrescimoNota: pct(proposta.acrescimoNotaPb),
    comissaoArquiteto: pct(proposta.comissaoArquitetoPb),
    comissaoIndicacao: pct(proposta.comissaoIndicacaoPb),
    markup: pct(proposta.markupPb),
    modoPrazo: proposta.modoPrazo,
    prazoTotalMinDias: proposta.prazoTotalMinDias ? String(proposta.prazoTotalMinDias) : "",
    prazoTotalMaxDias: proposta.prazoTotalMaxDias ? String(proposta.prazoTotalMaxDias) : "",
    prazoMaterialDias: proposta.prazoMaterialDias ? String(proposta.prazoMaterialDias) : "",
    prazoExecucaoDias: proposta.prazoExecucaoDias ? String(proposta.prazoExecucaoDias) : "",
    prazoVidrosDias: proposta.prazoVidrosDias ? String(proposta.prazoVidrosDias) : "",
    validadeTexto: proposta.validadeTexto ?? "",
    validadeAte: proposta.validadeAte ?? "",
    condicaoId: proposta.condicaoId ?? "",
    condicaoTextoLivre: proposta.condicaoTextoLivre ?? "",
    dadosPagamento: proposta.dadosPagamento ?? "",
    notas: proposta.notas.join("\n"),
    exibirValorPorItem: proposta.exibirValorPorItem,
    descricoesMaiusculas: proposta.descricoesMaiusculas,
    observacoesInternas: proposta.observacoesInternas ?? "",
  }));
  const [parcelas, setParcelas] = useState<LinhaParcela[]>(() =>
    proposta.parcelas.map((p) => ({ chave: novaChave(), descricao: p.descricao, percentual: pct(p.percentualPb), gatilho: p.gatilho, forma: p.forma ?? "", diasApos: p.diasApos === null ? "" : String(p.diasApos), dataFixa: p.dataFixa ?? "", parcelasCartao: p.parcelasCartao === null ? "" : String(p.parcelasCartao) })),
  );
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [errosCampo, setErrosCampo] = useState<Record<string, string>>({});

  const set = <K extends keyof typeof f>(campo: K, valor: (typeof f)[K]) => {
    setF((a) => ({ ...a, [campo]: valor }));
    setSujo(true);
  };

  // ----- Estrutura -----
  const [opcaoAtiva, setOpcaoAtiva] = useState(proposta.opcoes[0]?.id ?? "");
  const opcaoAtual = proposta.opcoes.find((o) => o.id === opcaoAtiva) ?? proposta.opcoes[0];
  const secoes = useMemo(() => montarSecoes(opcaoAtual?.id ?? "", proposta.grupos, proposta.itens), [opcaoAtual?.id, proposta.grupos, proposta.itens]);

  const [dialogoItem, setDialogoItem] = useState<{ item: ItemSer | null; grupoId: string | null } | null>(null);
  const [removendoItem, setRemovendoItem] = useState<ItemSer | null>(null);
  const [removendoOpcao, setRemovendoOpcao] = useState(false);
  const [confirmandoImportar, setConfirmandoImportar] = useState(false);
  const [novoGrupo, setNovoGrupo] = useState("");
  const [nomeOpcao, setNomeOpcao] = useState(opcaoAtual?.nome ?? "");
  const [descontoOpcao, setDescontoOpcao] = useState(opcaoAtual?.descontoCentavos ? centavosParaCampo(opcaoAtual.descontoCentavos) : "");
  const [copiando, setCopiando] = useState(false);
  const [copia, setCopia] = useState({ nome: "", linhaId: "", acabamentoId: "", tipoVidroId: "", espessura: "" });

  function trocarOpcao(id: string) {
    const o = proposta.opcoes.find((x) => x.id === id);
    setOpcaoAtiva(id);
    setNomeOpcao(o?.nome ?? "");
    setDescontoOpcao(o?.descontoCentavos ? centavosParaCampo(o.descontoCentavos) : "");
  }

  function chamar(fn: () => Promise<{ ok: boolean; erro?: string; mensagem?: string }>, depois?: () => void) {
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.erro ?? "Não foi possível concluir.");
        return;
      }
      if (r.mensagem) toast.success(r.mensagem);
      depois?.();
      router.refresh();
    });
  }

  function aplicarCondicao(id: string) {
    set("condicaoId", id);
    const c = opcoes.condicoes.find((x) => x.id === id);
    if (!c) return;
    set("condicaoTextoLivre", c.textoLivre ?? "");
    setParcelas(c.parcelas.map((p) => ({ chave: novaChave(), descricao: p.descricao, percentual: pct(p.percentualPb), gatilho: p.gatilho, forma: p.forma ?? "", diasApos: p.diasApos === null ? "" : String(p.diasApos), dataFixa: "", parcelasCartao: p.parcelasCartao === null ? "" : String(p.parcelasCartao) })));
    setSujo(true);
  }

  function salvar() {
    setErroSalvar(null);
    setErrosCampo({});
    iniciar(async () => {
      const r = await salvarProposta({
        id: proposta.id,
        ...f,
        condicaoId: f.condicaoId || null,
        comNotaFiscal: f.comNotaFiscal,
        notas: f.notas.split("\n").map((n) => n.trim()).filter(Boolean),
        parcelas: parcelas.map((p) => ({ descricao: p.descricao, percentual: p.percentual, gatilho: p.gatilho as (typeof GATILHOS)[number], forma: (p.forma || null) as (typeof FORMAS_PAGAMENTO)[number] | null, diasApos: p.diasApos, dataFixa: p.dataFixa, parcelasCartao: p.parcelasCartao })),
      });
      if (r.ok) {
        setSujo(false);
        toast.success(r.mensagem ?? "Proposta salva.");
        router.refresh();
      } else {
        setErroSalvar(r.erro);
        setErrosCampo(r.campos ?? {});
      }
    });
  }

  const totaisItens = proposta.itens.map((i) => ({
    id: i.id,
    numero: i.ordem + 1,
    descricao: i.descricao,
    opcaoId: i.opcaoId,
    precoTotalCentavos: i.precoTotalCentavos,
    custoEstimadoCentavos: i.custoEstimadoCentavos,
    custoMaterialInformadoCentavos: i.custoMaterialInformadoCentavos,
    medidas: i.medidas,
    avisoPreco: i.avisoPreco,
  }));
  const pbNota = Math.round((Number(f.acrescimoNota.replace(",", ".")) || 0) * 100);
  const somaParcelas = parcelas.reduce((s, p) => s + (Number(p.percentual.replace(",", ".")) || 0), 0);
  const L = somenteLeitura;

  const campo = (rotulo: string, valor: string, aoMudar: (v: string) => void, extra: { tipo?: string; max?: number; modo?: "numeric" | "decimal" | "tel" | "email"; erro?: string; className?: string } = {}) => (
    <label className={`grid gap-1 text-sm ${extra.className ?? ""}`}>
      {rotulo}
      <Input type={extra.tipo ?? "text"} inputMode={extra.modo} maxLength={extra.max ?? 200} value={valor} disabled={L} aria-label={rotulo} aria-invalid={!!extra.erro} onChange={(e) => aoMudar(e.target.value)} />
      {extra.erro ? <span role="alert" className="text-destructive text-xs">{extra.erro}</span> : null}
    </label>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="grid min-w-0 gap-6">
        {/* ---------- Opções e itens ---------- */}
        <section aria-labelledby="sec-itens" className="grid gap-4 rounded-xl border p-4">
          <h2 id="sec-itens" className="font-medium">
            Escopo: opções, seções e itens
          </h2>
          <div role="tablist" aria-label="Opções da proposta" className="flex flex-wrap gap-1 border-b pb-2">
            {proposta.opcoes.map((o) => (
              <button key={o.id} role="tab" type="button" aria-selected={o.id === opcaoAtual?.id} onClick={() => trocarOpcao(o.id)} className={`min-h-9 rounded-lg px-3 text-sm ${o.id === opcaoAtual?.id ? "bg-primary text-primary-foreground" : "hover:bg-accent border"}`}>
                {o.nome}
              </button>
            ))}
            {!L ? (
              <Button type="button" variant="outline" size="sm" onClick={() => chamar(() => salvarOpcao({ propostaId: proposta.id, nome: `Opção ${proposta.opcoes.length + 1}` }), undefined)}>
                <Plus aria-hidden /> Nova opção
              </Button>
            ) : null}
          </div>

          {opcaoAtual && !L ? (
            <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
              <label className="grid gap-1 text-sm">
                Nome da opção
                <Input value={nomeOpcao} maxLength={80} aria-label="Nome da opção" onChange={(e) => setNomeOpcao(e.target.value)} />
              </label>
              <label className="grid gap-1 text-sm">
                Desconto (R$)
                <Input inputMode="numeric" value={descontoOpcao} placeholder="0,00" maxLength={14} aria-label="Desconto da opção" onChange={(e) => setDescontoOpcao(mascararMoeda(e.target.value))} />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={pendente} onClick={() => chamar(() => salvarOpcao({ id: opcaoAtual.id, propostaId: proposta.id, nome: nomeOpcao, desconto: descontoOpcao }))}>
                  Salvar opção
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => { setCopia({ nome: `${nomeOpcao} (cópia)`, linhaId: "", acabamentoId: "", tipoVidroId: "", espessura: "" }); setCopiando(true); }}>
                  <Copy aria-hidden /> Duplicar
                </Button>
                {proposta.opcoes.length > 1 ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setRemovendoOpcao(true)}>
                    <Trash2 aria-hidden /> Remover
                  </Button>
                ) : null}
              </div>
              {copiando ? (
                <div className="grid gap-2 rounded-lg border border-dashed p-3 sm:col-span-3 sm:grid-cols-5" role="group" aria-label="Duplicar opção">
                  <label className="grid gap-1 text-xs sm:col-span-5">
                    Nome da nova opção
                    <Input value={copia.nome} maxLength={80} onChange={(e) => setCopia((c) => ({ ...c, nome: e.target.value }))} aria-label="Nome da nova opção" />
                  </label>
                  <p className="text-muted-foreground text-xs sm:col-span-5">Troque a combinação para recalcular todos os itens copiados (deixe em branco para manter).</p>
                  <Selecao value={copia.linhaId} onChange={(e) => setCopia((c) => ({ ...c, linhaId: e.target.value }))} aria-label="Nova linha de alumínio">
                    <option value="">Mesma linha</option>
                    {opcoes.linhas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </Selecao>
                  <Selecao value={copia.acabamentoId} onChange={(e) => setCopia((c) => ({ ...c, acabamentoId: e.target.value }))} aria-label="Novo acabamento">
                    <option value="">Mesmo acabamento</option>
                    {opcoes.acabamentos.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </Selecao>
                  <Selecao value={copia.tipoVidroId} onChange={(e) => setCopia((c) => ({ ...c, tipoVidroId: e.target.value }))} aria-label="Novo vidro">
                    <option value="">Mesmo vidro</option>
                    {opcoes.tiposVidro.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </Selecao>
                  <Selecao value={copia.espessura} onChange={(e) => setCopia((c) => ({ ...c, espessura: e.target.value }))} aria-label="Nova espessura">
                    <option value="">Mesma espessura</option>
                    {opcoes.espessuras.map((mm) => <option key={mm} value={mm}>{mm} mm</option>)}
                  </Selecao>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={pendente} onClick={() => chamar(async () => { const r = await duplicarOpcao({ propostaId: proposta.id, opcaoId: opcaoAtual.id, nome: copia.nome, linhaId: copia.linhaId || null, acabamentoId: copia.acabamentoId || null, tipoVidroId: copia.tipoVidroId || null, espessuraVidroMm: copia.espessura }); if (r.ok && r.dados) setOpcaoAtiva(r.dados.id); return r; }, () => setCopiando(false))}>
                      Criar cópia
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setCopiando(false)}>Cancelar</Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {secoes.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              Nenhum item nesta opção. {L ? "" : "Adicione o primeiro item abaixo."}
            </p>
          ) : null}

          {secoes.map((s) => (
            <div key={s.grupo?.id ?? "sem-grupo"} className="grid gap-2">
              {s.grupo ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-1">
                  <h3 className="text-sm font-semibold uppercase">{s.grupo.nome}</h3>
                  {!L ? (
                    <div className="flex gap-1">
                      <Button type="button" variant="ghost" size="sm" aria-label={`Subir a seção ${s.grupo.nome}`} onClick={() => chamar(() => moverGrupo(proposta.id, s.grupo!.id, "acima"))}><ArrowUp aria-hidden /></Button>
                      <Button type="button" variant="ghost" size="sm" aria-label={`Descer a seção ${s.grupo.nome}`} onClick={() => chamar(() => moverGrupo(proposta.id, s.grupo!.id, "abaixo"))}><ArrowDown aria-hidden /></Button>
                      <Button type="button" variant="ghost" size="sm" aria-label={`Remover a seção ${s.grupo.nome}`} onClick={() => chamar(() => removerGrupo(proposta.id, s.grupo!.id))}><Trash2 aria-hidden /></Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {s.itens.map(({ numero, item }) => (
                <article key={item.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[7rem_1fr_auto]" aria-label={`Item ${numero}`}>
                  <div className="hidden sm:block" aria-hidden>
                    <DesenhoEsquadria tipo={item.tipoDesenho as TipoDesenho} folhas={item.folhas} larguraMm={item.medidas[0]?.larguraMm ?? 2000} alturaMm={item.medidas[0]?.alturaMm ?? 1200} />
                  </div>
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">
                      {numero}. {item.medidas.reduce((n, m) => n + m.quantidade, 0)} un — {item.tipologiaNome ?? "Item livre"}
                    </p>
                    <p className="text-muted-foreground mt-0.5 break-words">{item.descricao}</p>
                    {item.local || item.observacoes ? <p className="text-muted-foreground text-xs">{[item.local, item.observacoes].filter(Boolean).join(" · ")}</p> : null}
                    {item.avisoPreco ? <p role="status" className="mt-1 text-xs text-amber-700 dark:text-amber-400">{item.avisoPreco}</p> : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className={`tabular-nums text-sm font-semibold ${item.precoTotalCentavos <= 0 ? "text-destructive" : ""}`}>{item.precoTotalCentavos > 0 ? formatarMoeda(item.precoTotalCentavos) : "Sem valor"}</p>
                    {!L ? (
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button type="button" variant="ghost" size="sm" aria-label={`Editar o item ${numero}`} onClick={() => setDialogoItem({ item, grupoId: item.grupoId })}><Pencil aria-hidden /></Button>
                        <Button type="button" variant="ghost" size="sm" aria-label={`Duplicar o item ${numero}`} disabled={pendente} onClick={() => chamar(() => duplicarItem(proposta.id, item.id))}><Copy aria-hidden /></Button>
                        <Button type="button" variant="ghost" size="sm" aria-label={`Subir o item ${numero}`} disabled={pendente} onClick={() => chamar(() => moverItem(proposta.id, item.id, "acima"))}><ArrowUp aria-hidden /></Button>
                        <Button type="button" variant="ghost" size="sm" aria-label={`Descer o item ${numero}`} disabled={pendente} onClick={() => chamar(() => moverItem(proposta.id, item.id, "abaixo"))}><ArrowDown aria-hidden /></Button>
                        <Button type="button" variant="ghost" size="sm" aria-label={`Remover o item ${numero}`} onClick={() => setRemovendoItem(item)}><Trash2 aria-hidden /></Button>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ))}

          {!L && opcaoAtual ? (
            <div className="flex flex-wrap items-end gap-2">
              <Button type="button" onClick={() => setDialogoItem({ item: null, grupoId: null })}>
                <Plus aria-hidden /> Adicionar item
              </Button>
              {temMedidasDaVisita ? (
                <Button type="button" variant="outline" disabled={pendente} onClick={() => (secoes.length > 0 ? setConfirmandoImportar(true) : chamar(() => importarMedidasDaVisita(proposta.id, opcaoAtual.id)))}>
                  <FileInput aria-hidden /> Importar medidas da visita
                </Button>
              ) : null}
              <div className="ml-auto flex items-end gap-2">
                <Input value={novoGrupo} maxLength={80} placeholder="Nova seção (ex.: PARTE SUPERIOR)" aria-label="Nome da nova seção" onChange={(e) => setNovoGrupo(e.target.value)} className="w-56" />
                <Button type="button" variant="outline" disabled={pendente || novoGrupo.trim() === ""} onClick={() => chamar(() => salvarGrupo({ propostaId: proposta.id, nome: novoGrupo }), () => setNovoGrupo(""))}>
                  Criar seção
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        {/* ---------- Cabeçalho ---------- */}
        <section aria-labelledby="sec-cab" className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
          <h2 id="sec-cab" className="font-medium sm:col-span-2">
            Cabeçalho da proposta
          </h2>
          {campo("Cliente", f.clienteNome, (v) => set("clienteNome", v), { max: 160, erro: errosCampo.clienteNome })}
          {campo("CPF/CNPJ (opcional)", f.clienteDocumento, (v) => set("clienteDocumento", v), { max: 30 })}
          {campo("Contato", f.clienteContato, (v) => set("clienteContato", v), { max: 120 })}
          {campo("Telefone", f.clienteTelefone, (v) => set("clienteTelefone", v), { max: 30, modo: "tel" })}
          {campo("E-mail", f.clienteEmail, (v) => set("clienteEmail", v), { max: 160, modo: "email" })}
          {campo("Endereço da obra", f.enderecoObra, (v) => set("enderecoObra", v), { max: 300 })}
          {campo("Título do escopo", f.tituloEscopo, (v) => set("tituloEscopo", v), { max: 120, erro: errosCampo.tituloEscopo })}
          {campo("Parte (ex.: Parte 01/02)", f.parte, (v) => set("parte", v), { max: 40 })}
          {campo("Data da proposta", f.data, (v) => set("data", v), { tipo: "date", erro: errosCampo.data })}
          {campo("Consultor", f.consultorNome, (v) => set("consultorNome", v), { max: 120 })}
          {campo("Cargo do consultor", f.consultorCargo, (v) => set("consultorCargo", v), { max: 120 })}
        </section>

        {/* ---------- Nota fiscal e preço ---------- */}
        <section aria-labelledby="sec-nota" className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
          <h2 id="sec-nota" className="font-medium sm:col-span-2">
            Nota fiscal, markup e comissões
          </h2>
          <div className="sm:col-span-2">
            <CaixaMarcacao id="comNotaFiscal" rotulo="Esta venda é COM nota fiscal" checked={f.comNotaFiscal} disabled={L} onChange={(e) => set("comNotaFiscal", e.target.checked)} />
            <p className="text-muted-foreground text-xs">A maioria das vendas é sem nota (principalmente pessoa física). Com nota, soma-se o acréscimo sobre o total, em linha separada.</p>
          </div>
          {campo("Acréscimo da nota fiscal (%)", f.acrescimoNota, (v) => set("acrescimoNota", v), { max: 6, modo: "decimal", erro: errosCampo.acrescimoNota })}
          {campo("Markup desta proposta (%) — só composição", f.markup, (v) => set("markup", v), { max: 8, modo: "decimal", erro: errosCampo.markup })}
          {campo("Comissão do arquiteto (%)", f.comissaoArquiteto, (v) => set("comissaoArquiteto", v), { max: 6, modo: "decimal", erro: errosCampo.comissaoArquiteto })}
          {campo("Comissão de indicação (%)", f.comissaoIndicacao, (v) => set("comissaoIndicacao", v), { max: 6, modo: "decimal", erro: errosCampo.comissaoIndicacao })}
          <p className="text-muted-foreground text-xs sm:col-span-2">
            Markup vazio = o da categoria da tipologia (padrão {pct(opcoes.config.markupPadraoPb)}%; vidro temperado e guarda-corpo {pct(opcoes.config.markupVidroTemperadoPb)}%, em Configurações). Manual e tabela não usam markup. Comissões começam em zero e são só informativas.
          </p>
        </section>

        {/* ---------- Prazos e validade ---------- */}
        <section aria-labelledby="sec-prazo" className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
          <h2 id="sec-prazo" className="font-medium sm:col-span-2">
            Prazos e validade
          </h2>
          <label className="grid gap-1 text-sm sm:col-span-2">
            Como informar o prazo
            <Selecao value={f.modoPrazo} disabled={L} onChange={(e) => set("modoPrazo", e.target.value as typeof f.modoPrazo)} aria-label="Como informar o prazo">
              <option value="NENHUM">Sem prazo na proposta</option>
              <option value="TOTAL">Prazo total simples (ex.: 20 a 35 dias úteis)</option>
              <option value="POR_ETAPA">Por grupo de etapas (material, execução, vidros)</option>
            </Selecao>
          </label>
          {f.modoPrazo === "TOTAL" ? (
            <>
              {campo("De (dias)", f.prazoTotalMinDias, (v) => set("prazoTotalMinDias", v), { modo: "numeric", max: 3, erro: errosCampo.prazoTotalMinDias })}
              {campo("Até (dias) — é o prazo prometido", f.prazoTotalMaxDias, (v) => set("prazoTotalMaxDias", v), { modo: "numeric", max: 3, erro: errosCampo.prazoTotalMaxDias })}
            </>
          ) : null}
          {f.modoPrazo === "POR_ETAPA" ? (
            <>
              {campo("Material (dias)", f.prazoMaterialDias, (v) => set("prazoMaterialDias", v), { modo: "numeric", max: 3 })}
              {campo("Execução (dias)", f.prazoExecucaoDias, (v) => set("prazoExecucaoDias", v), { modo: "numeric", max: 3 })}
              {campo("Vidros e finalização (dias)", f.prazoVidrosDias, (v) => set("prazoVidrosDias", v), { modo: "numeric", max: 3, className: "sm:col-span-2" })}
            </>
          ) : null}
          <p className="text-muted-foreground text-xs sm:col-span-2">O prazo conta a partir da medição exata para produção. No prazo total, vale o valor máximo.</p>
          {campo("Validade (texto)", f.validadeTexto, (v) => set("validadeTexto", v), { max: 200 })}
          {campo("Data limite (opcional)", f.validadeAte, (v) => set("validadeAte", v), { tipo: "date", erro: errosCampo.validadeAte })}
        </section>

        {/* ---------- Pagamento ---------- */}
        <section aria-labelledby="sec-pag" className="grid gap-3 rounded-xl border p-4">
          <h2 id="sec-pag" className="font-medium">
            Condição de pagamento
          </h2>
          <label className="grid gap-1 text-sm">
            Modelo
            <Selecao value={f.condicaoId} disabled={L} onChange={(e) => aplicarCondicao(e.target.value)} aria-label="Modelo de condição de pagamento">
              <option value="">Escolha um modelo…</option>
              {opcoes.condicoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
          </label>
          {f.condicaoTextoLivre ? (
            <label className="grid gap-1 text-sm">
              Texto livre
              <AreaTexto value={f.condicaoTextoLivre} rows={2} disabled={L} maxLength={500} onChange={(e) => set("condicaoTextoLivre", e.target.value)} aria-label="Texto livre da condição" />
            </label>
          ) : (
            <div className="grid gap-2">
              {parcelas.map((p, i) => (
                <div key={p.chave} className="grid gap-2 rounded-lg border p-2 md:grid-cols-12">
                  <Input className="md:col-span-4" value={p.descricao} disabled={L} maxLength={120} aria-label={`Descrição da parcela ${i + 1}`} onChange={(e) => { setParcelas((a) => a.map((x) => (x.chave === p.chave ? { ...x, descricao: e.target.value } : x))); setSujo(true); }} />
                  <Input className="md:col-span-2" inputMode="decimal" value={p.percentual} disabled={L} maxLength={8} placeholder="%" aria-label={`Percentual da parcela ${i + 1}`} onChange={(e) => { setParcelas((a) => a.map((x) => (x.chave === p.chave ? { ...x, percentual: e.target.value } : x))); setSujo(true); }} />
                  <Selecao className="md:col-span-3" value={p.gatilho} disabled={L} aria-label={`Gatilho da parcela ${i + 1}`} onChange={(e) => { setParcelas((a) => a.map((x) => (x.chave === p.chave ? { ...x, gatilho: e.target.value } : x))); setSujo(true); }}>
                    {GATILHOS.map((g) => <option key={g} value={g}>{ROTULO_GATILHO[g]}</option>)}
                  </Selecao>
                  <Selecao className="md:col-span-3" value={p.forma} disabled={L} aria-label={`Forma da parcela ${i + 1}`} onChange={(e) => { setParcelas((a) => a.map((x) => (x.chave === p.chave ? { ...x, forma: e.target.value } : x))); setSujo(true); }}>
                    <option value="">Forma a definir</option>
                    {FORMAS_PAGAMENTO.map((m) => <option key={m} value={m}>{ROTULO_FORMA[m]}</option>)}
                  </Selecao>
                  {p.gatilho === "DATA_FIXA" ? <Input className="md:col-span-4" type="date" value={p.dataFixa} disabled={L} aria-label={`Data da parcela ${i + 1}`} onChange={(e) => { setParcelas((a) => a.map((x) => (x.chave === p.chave ? { ...x, dataFixa: e.target.value } : x))); setSujo(true); }} /> : null}
                  {p.gatilho === "DIAS_APOS_APROVACAO" ? <Input className="md:col-span-4" inputMode="numeric" value={p.diasApos} disabled={L} maxLength={3} placeholder="Dias após a aprovação" aria-label={`Dias da parcela ${i + 1}`} onChange={(e) => { setParcelas((a) => a.map((x) => (x.chave === p.chave ? { ...x, diasApos: e.target.value } : x))); setSujo(true); }} /> : null}
                  {p.forma === "CARTAO_CREDITO" ? <Input className="md:col-span-4" inputMode="numeric" value={p.parcelasCartao} disabled={L} maxLength={2} placeholder="Parcelas no cartão (até 12)" aria-label={`Parcelas do cartão da parcela ${i + 1}`} onChange={(e) => { setParcelas((a) => a.map((x) => (x.chave === p.chave ? { ...x, parcelasCartao: e.target.value } : x))); setSujo(true); }} /> : null}
                  {!L ? <Button type="button" variant="ghost" size="sm" className="md:col-span-1" aria-label={`Remover a parcela ${i + 1}`} onClick={() => { setParcelas((a) => a.filter((x) => x.chave !== p.chave)); setSujo(true); }}><Trash2 aria-hidden /></Button> : null}
                </div>
              ))}
              {!L ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="outline" size="sm" onClick={() => { setParcelas((a) => [...a, { chave: novaChave(), descricao: "", percentual: "", gatilho: "CONFIRMACAO", forma: "", diasApos: "", dataFixa: "", parcelasCartao: "" }]); setSujo(true); }}>
                    <Plus aria-hidden /> Parcela
                  </Button>
                  <span className={`text-sm ${parcelas.length > 0 && Math.abs(somaParcelas - 100) > 0.001 ? "text-destructive" : "text-muted-foreground"}`}>Soma: {somaParcelas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</span>
                </div>
              ) : null}
            </div>
          )}
          {campo("Dados para pagamento (aparecem nos termos)", f.dadosPagamento, (v) => set("dadosPagamento", v), { max: 500 })}
        </section>

        {/* ---------- Notas e PDF ---------- */}
        <section aria-labelledby="sec-notas" className="grid gap-3 rounded-xl border p-4">
          <h2 id="sec-notas" className="font-medium">
            Notas importantes e opções do PDF
          </h2>
          <label className="grid gap-1 text-sm">
            Notas (uma por linha; a numeração é automática)
            <AreaTexto value={f.notas} rows={8} disabled={L} aria-label="Notas importantes" onChange={(e) => set("notas", e.target.value)} />
          </label>
          <CaixaMarcacao id="exibirValorPorItem" rotulo="Mostrar o valor de cada item no PDF" checked={f.exibirValorPorItem} disabled={L} onChange={(e) => set("exibirValorPorItem", e.target.checked)} />
          <CaixaMarcacao id="descricoesMaiusculas" rotulo="Descrições em maiúsculas no PDF" checked={f.descricoesMaiusculas} disabled={L} onChange={(e) => set("descricoesMaiusculas", e.target.checked)} />
          <label className="grid gap-1 text-sm">
            Observações internas (nunca vão ao PDF)
            <AreaTexto value={f.observacoesInternas} rows={3} disabled={L} maxLength={2000} aria-label="Observações internas" onChange={(e) => set("observacoesInternas", e.target.value)} />
          </label>
        </section>

        {erroSalvar ? <p role="alert" className="text-destructive text-sm">{erroSalvar}</p> : null}
        {!L ? (
          <div className="bg-background/95 sticky bottom-14 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t px-1 py-3 backdrop-blur md:bottom-0">
            <Button type="button" onClick={salvar} disabled={pendente || !sujo}>
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Salvar proposta
            </Button>
            {sujo ? <span className="text-muted-foreground text-sm">Alterações não salvas.</span> : null}
          </div>
        ) : null}
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <PainelTotais
          propostaId={proposta.id}
          opcoes={proposta.opcoes}
          itens={totaisItens}
          comNotaFiscal={f.comNotaFiscal}
          acrescimoNotaPb={pbNota}
          comissaoArquitetoPb={Math.round((Number(f.comissaoArquiteto.replace(",", ".")) || 0) * 100)}
          comissaoIndicacaoPb={Math.round((Number(f.comissaoIndicacao.replace(",", ".")) || 0) * 100)}
          margemMinimaAlerta={opcoes.config.margemMinimaAlerta}
        />
      </div>

      <DialogoItem
        aberto={!!dialogoItem}
        aoFechar={() => setDialogoItem(null)}
        propostaId={proposta.id}
        opcaoId={opcaoAtual?.id ?? ""}
        grupoId={dialogoItem?.grupoId ?? null}
        grupos={proposta.grupos}
        opcoesDaProposta={proposta.opcoes}
        item={dialogoItem?.item ?? null}
        opcoes={opcoes}
        descricoesMaiusculas={f.descricoesMaiusculas}
        aoSalvar={() => router.refresh()}
      />
      <ConfirmarAcao aberto={!!removendoItem} aoFechar={() => setRemovendoItem(null)} titulo="Remover este item?" descricao="O item sai da proposta e os totais são recalculados." botao="Remover" pendente={pendente} aoConfirmar={() => removendoItem && chamar(() => removerItem(proposta.id, removendoItem.id), () => setRemovendoItem(null))} />
      <ConfirmarAcao aberto={confirmandoImportar} aoFechar={() => setConfirmandoImportar(false)} titulo="Importar as medidas da visita?" descricao="Esta opção já tem itens. A importação cria um item novo para CADA medida da visita (sem valor); se você já importou, os itens ficarão repetidos." botao="Importar mesmo assim" pendente={pendente} aoConfirmar={() => opcaoAtual && chamar(() => importarMedidasDaVisita(proposta.id, opcaoAtual.id), () => setConfirmandoImportar(false))} />
      <ConfirmarAcao aberto={removendoOpcao} aoFechar={() => setRemovendoOpcao(false)} titulo="Remover esta opção?" descricao="Todos os itens desta opção saem da proposta." botao="Remover opção" pendente={pendente} aoConfirmar={() => opcaoAtual && chamar(() => removerOpcao(proposta.id, opcaoAtual.id), () => { setRemovendoOpcao(false); setOpcaoAtiva(proposta.opcoes.find((o) => o.id !== opcaoAtual.id)?.id ?? ""); })} />
    </div>
  );
}
