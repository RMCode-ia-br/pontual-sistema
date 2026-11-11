"use client";

import { useDraggable } from "@dnd-kit/core";
import { CalendarClock, Clock } from "lucide-react";
import Link from "next/link";

import { Selecao } from "@/components/formulario";
import { COLUNAS_DO_FUNIL, ROTULO_STATUS_PROJETO, type StatusProjeto } from "@/lib/dominio/funil";
import { formatarMoeda } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

import type { CartaoDoFunil } from "../queries";
import { ROTULO_PORTE, ROTULO_TEMPERATURA } from "../schemas";

const COR_TEMPERATURA: Record<string, string> = {
  QUENTE: "bg-red-500/15 text-red-700 dark:text-red-300",
  MORNA: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  FRIA: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

/** Conteúdo do cartão (também usado como "fantasma" enquanto se arrasta). */
export function ConteudoDoCartao({ cartao, aoMover, mostrarMenu = true }: { cartao: CartaoDoFunil; aoMover?: (para: StatusProjeto) => void; mostrarMenu?: boolean }) {
  const parado = cartao.diasParado;
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-muted-foreground font-mono text-xs">{cartao.codigo}</span>
        <span className="flex flex-wrap justify-end gap-1">
          {cartao.temperatura ? (
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", COR_TEMPERATURA[cartao.temperatura])}>
              {ROTULO_TEMPERATURA[cartao.temperatura as keyof typeof ROTULO_TEMPERATURA] ?? cartao.temperatura}
            </span>
          ) : null}
          {cartao.porte ? (
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">{ROTULO_PORTE[cartao.porte as keyof typeof ROTULO_PORTE] ?? cartao.porte}</span>
          ) : null}
        </span>
      </div>
      <Link href={`/projetos/${cartao.id}`} className="mt-1 block text-sm leading-snug font-medium hover:underline">
        {cartao.titulo}
      </Link>
      <p className="text-muted-foreground truncate text-xs">{cartao.clienteNome}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <span className="font-medium tabular-nums">{cartao.valorEstimadoCentavos !== null ? formatarMoeda(cartao.valorEstimadoCentavos) : <span className="text-muted-foreground font-normal">Sem valor</span>}</span>
        <span className={cn("flex items-center gap-1", parado >= 7 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")} title="Dias desde a última mudança de fase">
          <Clock className="size-3" aria-hidden /> {parado === 0 ? "hoje" : `parado há ${parado} ${parado === 1 ? "dia" : "dias"}`}
        </span>
      </div>
      {cartao.proximaTarefa ? (
        <p className={cn("mt-1.5 flex items-start gap-1 text-xs", cartao.proximaTarefa.vencida ? "text-destructive" : "text-muted-foreground")}>
          <CalendarClock className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span className="min-w-0">
            {cartao.proximaTarefa.titulo}
            {cartao.proximaTarefa.vencimento ? ` · ${cartao.proximaTarefa.vencimento.split("-").reverse().join("/")}` : ""}
            {cartao.proximaTarefa.vencida ? " (vencida)" : ""}
          </span>
        </p>
      ) : null}
      {mostrarMenu && aoMover ? (
        // Alternativa ao arrasto (teclado, leitor de tela e celular): o mesmo movimento, com as mesmas regras.
        <Selecao
          aria-label={`Mover ${cartao.titulo} para outra fase`}
          value=""
          onChange={(e) => e.target.value && aoMover(e.target.value as StatusProjeto)}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="mt-2 h-8 text-xs"
        >
          <option value="">Mover para…</option>
          {COLUNAS_DO_FUNIL.filter((s) => s !== cartao.status).map((s) => (
            <option key={s} value={s}>
              {ROTULO_STATUS_PROJETO[s]}
            </option>
          ))}
        </Selecao>
      ) : null}
    </>
  );
}

export function CartaoArrastavel({ cartao, aoMover }: { cartao: CartaoDoFunil; aoMover: (para: StatusProjeto) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: cartao.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // Quem usa teclado ou leitor de tela move pelo menu "Mover para…" (mesmas regras); o cartão não vira
      // uma parada de foco extra nem um "botão" que contém outros controles.
      tabIndex={-1}
      role="group"
      aria-label={`Projeto ${cartao.codigo}`}
      // O gesto de arrastar é do cartão inteiro; o menu e o link continuam clicáveis (distância mínima de arrasto).
      className={cn("bg-card touch-manipulation rounded-lg border p-3 shadow-sm", isDragging && "opacity-40")}
      data-testid="cartao-projeto"
    >
      <ConteudoDoCartao cartao={cartao} aoMover={aoMover} />
    </div>
  );
}
