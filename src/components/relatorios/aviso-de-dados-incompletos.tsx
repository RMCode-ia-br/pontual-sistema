import { AlertTriangle } from "lucide-react";

/** Aviso no lugar de um número bloqueado porque falta valor gravado no aceite de proposta aprovada (decisão 151). */
export function AvisoDeDadosIncompletos({ mensagem }: { mensagem: string }) {
  return (
    <p role="alert" className="border-destructive/50 bg-destructive/10 flex items-start gap-2 rounded-lg border p-3 text-sm">
      <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{mensagem}</span>
    </p>
  );
}
