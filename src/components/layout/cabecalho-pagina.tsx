import { cn } from "@/lib/utils";

type Props = {
  titulo: string;
  descricao?: string;
  /** Botões de ação do canto direito. */
  acoes?: React.ReactNode;
  className?: string;
};

export function CabecalhoPagina({ titulo, descricao, acoes, className }: Props) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descricao ? <p className="text-muted-foreground mt-1 text-sm">{descricao}</p> : null}
      </div>
      {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
    </div>
  );
}
