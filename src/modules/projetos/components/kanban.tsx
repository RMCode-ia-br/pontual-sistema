"use client";

import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { avaliarMovimento, ROTULO_STATUS_PROJETO, type StatusProjeto } from "@/lib/dominio/funil";
import { formatarMoeda } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

import { moverProjeto } from "../actions/funil";
import type { CartaoDoFunil, ColunaDoFunil } from "../queries";
import { CartaoArrastavel, ConteudoDoCartao } from "./cartao-projeto";
import { DialogoPerda } from "./dialogo-perda";

type Props = {
  colunas: ColunaDoFunil[];
  motivos: { id: string; nome: string }[];
  /** Há filtro ou busca ativos (muda o texto das colunas vazias). */
  filtrado: boolean;
};

const DICA_DA_COLUNA: Partial<Record<StatusProjeto, string>> = {
  APROVADO: "Entra aqui quando uma proposta é aprovada.",
  PERDIDO: "Arraste para cá e informe o motivo.",
};

function Coluna({ coluna, cartoes, total, valor, filtrado, aoMover }: { coluna: StatusProjeto; cartoes: CartaoDoFunil[]; total: number; valor: number; filtrado: boolean; aoMover: (id: string, para: StatusProjeto) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna });
  const fechada = coluna === "APROVADO" || coluna === "PERDIDO";
  return (
    <section
      aria-labelledby={`coluna-${coluna}`}
      className={cn("bg-muted/40 flex w-[82vw] max-w-80 shrink-0 snap-start flex-col rounded-xl border sm:w-72", isOver && "ring-primary/60 bg-primary/5 ring-2")}
    >
      <header className="px-3 pt-3 pb-2">
        <h2 id={`coluna-${coluna}`} className="flex items-center justify-between gap-2 text-sm font-semibold">
          <span className="flex items-center gap-1.5">
            {coluna === "APROVADO" ? <Lock className="text-muted-foreground size-3.5" aria-hidden /> : null}
            {coluna === "PERDIDO" ? "Perdidos" : ROTULO_STATUS_PROJETO[coluna]}
          </span>
          <span className="bg-background text-muted-foreground rounded-full border px-2 text-xs tabular-nums" aria-label={`${total} projetos`}>
            {total}
          </span>
        </h2>
        <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">{valor > 0 ? formatarMoeda(valor) : "Sem valor estimado"}</p>
      </header>
      <div ref={setNodeRef} className="grid min-h-24 flex-1 content-start gap-2 px-2 pb-2 md:max-h-[calc(100vh-17rem)] md:overflow-y-auto">
        {cartoes.length === 0 ? (
          <p className="text-muted-foreground px-1 py-4 text-center text-xs">
            {filtrado ? "Nenhum projeto com esses filtros." : (DICA_DA_COLUNA[coluna] ?? "Nenhum projeto aqui.")}
          </p>
        ) : (
          cartoes.map((c) => <CartaoArrastavel key={c.id} cartao={c} aoMover={(para) => aoMover(c.id, para)} />)
        )}
        {fechada && total > cartoes.length ? (
          <Link href={`/projetos?status=${coluna}`} className="text-primary px-1 text-center text-xs hover:underline">
            Ver todos os {total} na lista
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Funil em Kanban. Arrastar (mouse ou toque longo) ou usar o menu "Mover para…" aplica as MESMAS regras
 * (`avaliarMovimento`, no domínio) que o servidor confere de novo: o cliente só antecipa a resposta.
 */
export function Kanban({ colunas, motivos, filtrado }: Props) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  // Movimentos ainda não confirmados pelos dados do servidor (id → fase). Zera quando chegam dados novos.
  const [otimistas, setOtimistas] = useState<Record<string, StatusProjeto>>({});
  const [colunasVistas, setColunasVistas] = useState(colunas);
  const [arrastando, setArrastando] = useState<CartaoDoFunil | null>(null);
  const [perdendo, setPerdendo] = useState<{ id: string; titulo: string } | null>(null);

  if (colunasVistas !== colunas) {
    setColunasVistas(colunas);
    setOtimistas({});
  }

  // Mouse: precisa arrastar alguns pixels (o clique no cartão continua abrindo o projeto). Toque: segurar um instante,
  // para a rolagem horizontal das colunas no celular não virar arrasto sem querer.
  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const todos = colunas.flatMap((c) => c.cartoes);
  const statusDe = (c: CartaoDoFunil) => otimistas[c.id] ?? c.status;

  const exibidas = colunas.map((coluna) => {
    let total = coluna.total;
    let valor = coluna.valorEstimadoCentavos;
    // Cartões que saíram/entraram por movimento otimista ajustam contagem e valor da coluna.
    for (const c of todos) {
      const novo = otimistas[c.id];
      if (!novo || novo === c.status) continue;
      const v = c.valorEstimadoCentavos ?? 0;
      if (c.status === coluna.status) {
        total -= 1;
        valor -= v;
      }
      if (novo === coluna.status) {
        total += 1;
        valor += v;
      }
    }
    const daColuna = todos.filter((c) => statusDe(c) === coluna.status);
    const movidosParaCa = daColuna.filter((c) => otimistas[c.id] === coluna.status && c.status !== coluna.status);
    const resto = daColuna.filter((c) => !movidosParaCa.includes(c));
    return { status: coluna.status, cartoes: [...movidosParaCa, ...resto].map((c) => ({ ...c, status: statusDe(c) })), total, valor };
  });

  function mover(id: string, para: StatusProjeto) {
    setOtimistas((o) => ({ ...o, [id]: para }));
    iniciar(async () => {
      const r = await moverProjeto({ id, para });
      if (r.ok) {
        toast.success(r.mensagem ?? "Projeto movido.");
        router.refresh();
      } else {
        setOtimistas((o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== id)));
        toast.error(r.erro);
      }
    });
  }

  function tentarMover(id: string, para: StatusProjeto) {
    const cartao = todos.find((c) => c.id === id);
    if (!cartao) return;
    const de = statusDe(cartao);
    if (de === para) return;
    const r = avaliarMovimento(de, para);
    if (!r.ok) {
      toast.error(r.motivo);
      return;
    }
    if (r.exigeMotivo) {
      setPerdendo({ id, titulo: cartao.titulo });
      return;
    }
    mover(id, para);
  }

  function aoComecar(e: DragStartEvent) {
    setArrastando(todos.find((c) => c.id === e.active.id) ?? null);
  }

  function aoSoltar(e: DragEndEvent) {
    setArrastando(null);
    if (!e.over) return;
    tentarMover(String(e.active.id), e.over.id as StatusProjeto);
  }

  return (
    <>
      <DndContext sensors={sensores} onDragStart={aoComecar} onDragEnd={aoSoltar} onDragCancel={() => setArrastando(null)}>
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0" data-testid="funil">
          {exibidas.map((c) => (
            <Coluna key={c.status} coluna={c.status} cartoes={c.cartoes} total={c.total} valor={c.valor} filtrado={filtrado} aoMover={tentarMover} />
          ))}
        </div>
        <DragOverlay>
          {arrastando ? (
            <div className="bg-card w-72 rotate-1 rounded-lg border p-3 shadow-lg">
              <ConteudoDoCartao cartao={arrastando} mostrarMenu={false} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <DialogoPerda
        projeto={perdendo}
        motivos={motivos}
        aoFechar={() => setPerdendo(null)}
        aoConcluir={(id) => {
          setOtimistas((o) => ({ ...o, [id]: "PERDIDO" }));
          setPerdendo(null);
          toast.success("Projeto marcado como perdido.");
          router.refresh();
        }}
      />
    </>
  );
}
