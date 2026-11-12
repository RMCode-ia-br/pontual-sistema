"use client";

import { CalendarClock, CheckCircle2, Loader2, Lock, Pencil, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { AreaTexto, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ROTULO_GATILHO_DE_ETAPA, ROTULO_GRUPO_PRAZO, ROTULO_STATUS_ETAPA } from "@/lib/dominio/etapas";
import { formatarDataCalendario } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

import { editarEtapaDaObra, mudarEtapa, sugerirDatas } from "../actions/obra";
import type { EtapaDaObra } from "../queries";
import { DialogoDatasSugeridas, type SugestaoDaObra } from "./dialogo-datas-sugeridas";
import { SemaforoTag } from "./semaforo-tag";

type Modo = "iniciar" | "concluir" | "bloquear" | "desbloquear" | "dispensar" | "reabrir" | "reativar" | "editar";

const TITULO: Record<Modo, string> = {
  iniciar: "Iniciar etapa",
  concluir: "Concluir etapa",
  bloquear: "Bloquear etapa",
  desbloquear: "Desbloquear etapa",
  dispensar: "Dispensar etapa",
  reabrir: "Reabrir etapa",
  reativar: "Reativar etapa",
  editar: "Editar etapa",
};

const BOTAO: Record<Modo, string> = { iniciar: "Iniciar", concluir: "Concluir", bloquear: "Bloquear", desbloquear: "Desbloquear", dispensar: "Dispensar", reabrir: "Reabrir", reativar: "Reativar", editar: "Editar" };

/** O que cada estado permite fazer (a matriz completa está em `transicaoPermitida`, no domínio). */
const ACOES: Record<EtapaDaObra["status"], Modo[]> = {
  PENDENTE: ["iniciar", "concluir", "bloquear", "dispensar", "editar"],
  EM_ANDAMENTO: ["concluir", "bloquear", "editar"],
  BLOQUEADA: ["desbloquear", "dispensar", "editar"],
  CONCLUIDA: ["reabrir"],
  DISPENSADA: ["reativar"],
};

const fmt = (d: string | null) => (d ? formatarDataCalendario(d) : null);
const periodo = (i: string | null, f: string | null) => (i && f ? (i === f ? fmt(i) : `${fmt(i)} a ${fmt(f)}`) : (fmt(i) ?? fmt(f)));

type Opcoes = {
  motivos: { id: string; nome: string; justificado: boolean }[];
  usuarios: { id: string; nome: string }[];
  equipes: { id: string; nome: string }[];
  hoje: string;
  condominioPendente: boolean;
};

type Props = Opcoes & {
  projetoId: string;
  etapas: EtapaDaObra[];
  /** A obra tem prazo em dias: habilita "Recalcular datas". */
  temPrazo: boolean;
};

export function EtapasDaObra({ projetoId, etapas, temPrazo, ...opcoes }: Props) {
  const [alvo, setAlvo] = useState<{ etapa: EtapaDaObra; modo: Modo } | null>(null);
  const [sugestao, setSugestao] = useState<SugestaoDaObra | null>(null);
  const [calculando, iniciarCalculo] = useTransition();
  const nomes = Object.fromEntries(etapas.map((e) => [e.id, e.nome]));

  function recalcular() {
    iniciarCalculo(async () => {
      const r = await sugerirDatas({ projetoId });
      if (r.ok && r.dados) setSugestao({ tipo: "CALCULO", itens: r.dados.itens });
      else if (!r.ok) toast.error(r.erro);
    });
  }

  return (
    <section aria-labelledby="titulo-etapas" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-etapas" className="font-medium">
          Etapas
        </h2>
        {temPrazo && etapas.some((e) => e.status !== "CONCLUIDA" && e.status !== "DISPENSADA") ? (
          <Button type="button" variant="outline" size="sm" onClick={recalcular} disabled={calculando}>
            {calculando ? <Loader2 className="animate-spin" aria-hidden /> : <CalendarClock aria-hidden />} Recalcular datas
          </Button>
        ) : null}
      </div>

      <ol className="grid gap-2">
        {etapas.map((e) => {
          const previsto = periodo(e.inicioPrevisto, e.fimPrevisto);
          const real = periodo(e.inicioReal, e.fimReal);
          return (
            <li key={e.id} className={cn("grid gap-2 rounded-xl border p-3", e.status === "DISPENSADA" && "bg-muted/40", e.atrasada && "border-destructive/40")} aria-label={`Etapa ${e.ordem}: ${e.nome}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground w-5 text-sm tabular-nums">{e.ordem}</span>
                <p className="font-medium">{e.nome}</p>
                <Badge variant={e.status === "BLOQUEADA" ? "destructive" : e.status === "EM_ANDAMENTO" ? "default" : e.status === "CONCLUIDA" ? "secondary" : "outline"}>
                  {e.status === "CONCLUIDA" ? <CheckCircle2 aria-hidden /> : e.status === "BLOQUEADA" ? <Lock aria-hidden /> : null}
                  {ROTULO_STATUS_ETAPA[e.status]}
                </Badge>
                {e.semaforo ? <SemaforoTag semaforo={e.semaforo} /> : null}
                {e.liberaGatilho ? <Badge variant="outline">Libera: {ROTULO_GATILHO_DE_ETAPA[e.liberaGatilho]}</Badge> : null}
                {e.marcoGarantia ? <Badge variant="outline">Inicia a garantia</Badge> : null}
              </div>

              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground text-xs">Previsto{e.provisoria && previsto ? " (provisório)" : ""}</dt>
                  <dd>{previsto ?? <span className="text-muted-foreground">Sem data</span>}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Realizado</dt>
                  <dd>{real ?? <span className="text-muted-foreground">—</span>}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Responsável</dt>
                  <dd>{e.responsavel?.nome ?? <span className="text-muted-foreground">—</span>}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Equipe</dt>
                  <dd>{e.equipe?.nome ?? <span className="text-muted-foreground">—</span>}</dd>
                </div>
              </dl>
              {e.grupoPrazo ? <p className="text-muted-foreground text-xs">Prazo: {ROTULO_GRUPO_PRAZO[e.grupoPrazo]}</p> : null}

              {e.status === "BLOQUEADA" ? (
                <p className="text-destructive text-sm">
                  Bloqueada: {e.motivoBloqueio ?? "sem motivo"}
                  {e.detalheBloqueio ? ` — ${e.detalheBloqueio}` : ""}
                </p>
              ) : null}
              {e.observacao ? <p className="text-muted-foreground text-sm whitespace-pre-line">{e.observacao}</p> : null}

              <div className="flex flex-wrap gap-2">
                {ACOES[e.status].map((modo, i) => (
                  <Button key={modo} type="button" size="sm" variant={i === 0 && modo !== "editar" ? "default" : "outline"} onClick={() => setAlvo({ etapa: e, modo })} aria-label={`${BOTAO[modo]}: ${e.nome}`}>
                    {modo === "editar" ? <Pencil aria-hidden /> : modo === "reabrir" ? <RotateCcw aria-hidden /> : null}
                    {BOTAO[modo]}
                  </Button>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      {alvo ? (
        <DialogoDaEtapa
          key={`${alvo.etapa.id}-${alvo.modo}`}
          etapa={alvo.etapa}
          modo={alvo.modo}
          {...opcoes}
          aoFechar={() => setAlvo(null)}
          aoSugerir={(s) => {
            setAlvo(null);
            setSugestao(s);
          }}
        />
      ) : null}
      <DialogoDatasSugeridas projetoId={projetoId} sugestao={sugestao} nomes={nomes} aoFechar={() => setSugestao(null)} />
    </section>
  );
}

type DialogoProps = Opcoes & {
  etapa: EtapaDaObra;
  modo: Modo;
  aoFechar: () => void;
  aoSugerir: (s: SugestaoDaObra) => void;
};

const ESTADO_ALVO = (modo: Modo, etapa: EtapaDaObra) =>
  ({
    iniciar: "EM_ANDAMENTO",
    concluir: "CONCLUIDA",
    bloquear: "BLOQUEADA",
    desbloquear: etapa.inicioReal ? "EM_ANDAMENTO" : "PENDENTE",
    dispensar: "DISPENSADA",
    reabrir: "EM_ANDAMENTO",
    reativar: "PENDENTE",
    editar: "PENDENTE",
  })[modo] as "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA" | "BLOQUEADA" | "DISPENSADA";

function DialogoDaEtapa({ etapa, modo, motivos, usuarios, equipes, hoje, condominioPendente, aoFechar, aoSugerir }: DialogoProps) {
  const router = useRouter();
  const [data, setData] = useState(hoje);
  const [vencimento, setVencimento] = useState("");
  const [motivoId, setMotivoId] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const [responsavelId, setResponsavelId] = useState(etapa.responsavel?.id ?? "");
  const [equipeId, setEquipeId] = useState(etapa.equipe?.id ?? "");
  const [inicio, setInicio] = useState(etapa.inicioPrevisto ?? "");
  const [fim, setFim] = useState(etapa.fimPrevisto ?? "");
  const [observacao, setObservacao] = useState(etapa.observacao ?? "");
  const [erro, setErro] = useState<{ geral?: string; campos?: Record<string, string> }>({});
  const [pendente, iniciar] = useTransition();

  const usaData = modo === "iniciar" || modo === "concluir";
  const liberaParcela = etapa.liberaGatilho && (modo === "concluir" || modo === "dispensar");
  const devolveParcela = etapa.liberaGatilho && (modo === "reabrir" || modo === "reativar");
  const campos = erro.campos ?? {};

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro({});
    iniciar(async () => {
      if (modo === "editar") {
        const r = await editarEtapaDaObra({ etapaId: etapa.id, responsavelId: responsavelId || null, equipeId: equipeId || null, inicioPrevisto: inicio || null, fimPrevisto: fim || null, observacao: observacao.trim() || null });
        if (r.ok) {
          toast.success(r.mensagem ?? "Salvo.");
          aoFechar();
          router.refresh();
        } else setErro({ geral: r.erro, campos: r.campos });
        return;
      }
      const r = await mudarEtapa({
        etapaId: etapa.id,
        para: ESTADO_ALVO(modo, etapa),
        data: usaData ? data : undefined,
        vencimentoDasParcelas: modo === "concluir" && vencimento ? vencimento : undefined,
        motivoBloqueioId: modo === "bloquear" ? motivoId || null : undefined,
        detalheBloqueio: modo === "bloquear" ? detalhe.trim() || null : undefined,
      });
      if (!r.ok) return setErro({ geral: r.erro, campos: r.campos });
      toast.success(r.mensagem ?? "Pronto.");
      router.refresh();
      const s = r.dados?.sugestoes;
      if (s && s.itens.length > 0) aoSugerir({ tipo: s.tipo, itens: s.itens });
      else aoFechar();
    });
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !pendente && aoFechar()}>
      <DialogContent>
        <form onSubmit={enviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{TITULO[modo]}</DialogTitle>
            <DialogDescription>{etapa.nome}</DialogDescription>
          </DialogHeader>

          {modo === "concluir" && etapa.tipo === "MEDICAO_EXATA" ? (
            <p className="bg-muted/50 rounded-lg p-3 text-sm">O prazo da obra começa a contar a partir desta data.</p>
          ) : null}
          {modo === "iniciar" && etapa.tipo.startsWith("INSTALACAO") && condominioPendente ? (
            <p role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              O condomínio ainda não aprovou a mudança da fachada. Confirme antes de instalar.
            </p>
          ) : null}
          {modo === "reabrir" && etapa.tipo === "MEDICAO_EXATA" ? <p className="bg-muted/50 rounded-lg p-3 text-sm">O relógio do prazo para e as datas voltam a ser provisórias.</p> : null}

          {usaData ? (
            <Campo id="data" rotulo={modo === "iniciar" ? "Data de início" : "Data de conclusão"} erro={campos.data} obrigatorio>
              <Input id="data" type="date" value={data} max={hoje} required onChange={(e) => setData(e.target.value)} {...ariaDoCampo("data", campos.data)} />
            </Campo>
          ) : null}

          {modo === "concluir" && liberaParcela ? (
            <Campo id="vencimento" rotulo="Vencimento da parcela liberada" dica={`Ao concluir, a parcela “${ROTULO_GATILHO_DE_ETAPA[etapa.liberaGatilho!]}” passa a ser cobrada. Em branco = a data de conclusão.`}>
              <Input id="vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </Campo>
          ) : null}
          {modo === "dispensar" ? (
            <p className="text-muted-foreground text-sm">
              A etapa deixa de valer para esta obra: não recebe data e não atrasa. {liberaParcela ? `A parcela “${ROTULO_GATILHO_DE_ETAPA[etapa.liberaGatilho!]}” será liberada para cobrança hoje.` : "Você pode reativá-la depois."}
            </p>
          ) : null}
          {devolveParcela ? <p className="text-muted-foreground text-sm">A parcela liberada por esta etapa volta a aguardar (só se ainda não tiver pagamento).</p> : null}
          {modo === "desbloquear" ? <p className="text-muted-foreground text-sm">A etapa volta ao andamento e o motivo do bloqueio é limpo.</p> : null}
          {modo === "reabrir" && !devolveParcela && etapa.tipo !== "MEDICAO_EXATA" ? <p className="text-muted-foreground text-sm">A etapa volta a “Em andamento” e a data de conclusão é apagada.</p> : null}
          {modo === "reativar" && !devolveParcela ? <p className="text-muted-foreground text-sm">A etapa volta a “Pendente”. Use “Recalcular datas” para dar datas a ela.</p> : null}

          {modo === "bloquear" ? (
            <>
              <Campo id="motivo" rotulo="Motivo do bloqueio" erro={campos.motivoBloqueioId} obrigatorio>
                <Selecao id="motivo" value={motivoId} required onChange={(e) => setMotivoId(e.target.value)} {...ariaDoCampo("motivo", campos.motivoBloqueioId)}>
                  <option value="" disabled>
                    Escolha o motivo
                  </option>
                  {motivos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo id="detalhe" rotulo="Detalhes (opcional)" erro={campos.detalheBloqueio}>
                <AreaTexto id="detalhe" rows={3} maxLength={500} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} />
              </Campo>
              <p className="text-muted-foreground text-xs">O bloqueio não muda o prazo sozinho. Se o motivo não for culpa da Pontual, registre uma pausa da obra para estender o prazo prometido.</p>
            </>
          ) : null}

          {modo === "editar" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo id="responsavel" rotulo="Responsável" erro={campos.responsavelId}>
                  <Selecao id="responsavel" value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
                    <option value="">Ninguém</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
                <Campo id="equipe" rotulo="Equipe" erro={campos.equipeId}>
                  <Selecao id="equipe" value={equipeId} onChange={(e) => setEquipeId(e.target.value)}>
                    <option value="">Nenhuma</option>
                    {equipes.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.nome}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
                <Campo id="inicio" rotulo="Início previsto" erro={campos.inicioPrevisto}>
                  <Input id="inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
                </Campo>
                <Campo id="fim" rotulo="Término previsto" erro={campos.fimPrevisto}>
                  <Input id="fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
                </Campo>
              </div>
              <Campo id="observacao" rotulo="Observação (opcional)" erro={campos.observacao}>
                <AreaTexto id="observacao" rows={3} maxLength={500} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
              </Campo>
            </>
          ) : null}

          {erro.geral && Object.keys(campos).length === 0 ? (
            <p role="alert" className="text-destructive text-sm">
              {erro.geral}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} {modo === "editar" ? "Salvar" : BOTAO[modo]}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
