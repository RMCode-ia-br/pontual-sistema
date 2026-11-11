import type { LucideIcon } from "lucide-react";

type Props = {
  icone: LucideIcon;
  titulo: string;
  /** Orienta o próximo passo (regra da spec: estado vazio sempre ensina). */
  descricao: string;
  acao?: React.ReactNode;
};

export function EstadoVazio({ icone: Icone, titulo, descricao, acao }: Props) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center">
      <span className="bg-muted text-muted-foreground mb-3 flex size-12 items-center justify-center rounded-full">
        <Icone className="size-6" aria-hidden />
      </span>
      <h2 className="font-medium">{titulo}</h2>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">{descricao}</p>
      {acao ? <div className="mt-4">{acao}</div> : null}
    </div>
  );
}
