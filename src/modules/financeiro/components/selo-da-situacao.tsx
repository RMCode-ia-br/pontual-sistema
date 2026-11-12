import { AlarmClock, CheckCircle2, CircleDashed, Clock, Hourglass, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ResumoDoTitulo } from "@/lib/dominio/titulos";

/** Situação derivada de uma conta (nunca gravada): sempre com texto e ícone, nunca só cor. */
export function SeloDaSituacao({ resumo }: { resumo: ResumoDoTitulo }) {
  switch (resumo.situacao) {
    case "ATRASADO":
      return (
        <Badge variant="destructive">
          <AlarmClock aria-hidden /> Atrasada há {resumo.diasEmAtraso} dia{resumo.diasEmAtraso === 1 ? "" : "s"}
        </Badge>
      );
    case "VENCE_HOJE":
      return (
        <Badge>
          <Clock aria-hidden /> Vence hoje
        </Badge>
      );
    case "A_VENCER":
      return (
        <Badge variant="outline">
          <CircleDashed aria-hidden /> {resumo.diasParaVencer === null ? "A vencer" : resumo.diasParaVencer === 1 ? "Vence amanhã" : `Vence em ${resumo.diasParaVencer} dias`}
        </Badge>
      );
    case "AGUARDANDO_ETAPA":
      return (
        <Badge variant="outline">
          <Hourglass aria-hidden /> Aguardando etapa
        </Badge>
      );
    case "PAGO":
      return (
        <Badge variant="secondary">
          <CheckCircle2 aria-hidden /> Paga
        </Badge>
      );
    case "CANCELADO":
      return (
        <Badge variant="outline">
          <XCircle aria-hidden /> Cancelada
        </Badge>
      );
  }
}

/** Texto curto da situação (para células de lista e CSV). */
export function textoDaSituacao(resumo: ResumoDoTitulo): string {
  const base = (() => {
    switch (resumo.situacao) {
      case "ATRASADO":
        return `Atrasada há ${resumo.diasEmAtraso} dia${resumo.diasEmAtraso === 1 ? "" : "s"}`;
      case "VENCE_HOJE":
        return "Vence hoje";
      case "A_VENCER":
        return resumo.diasParaVencer === null ? "A vencer" : resumo.diasParaVencer === 1 ? "Vence amanhã" : `Vence em ${resumo.diasParaVencer} dias`;
      case "AGUARDANDO_ETAPA":
        return "Aguardando etapa";
      case "PAGO":
        return "Paga";
      case "CANCELADO":
        return "Cancelada";
    }
  })();
  return resumo.parcial ? `${base} · parcial` : base;
}
