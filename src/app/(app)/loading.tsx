import { Skeleton } from "@/components/ui/skeleton";

/**
 * Estado "carregando" da área logada (spec 0.5/11): aparece enquanto a página consulta o banco, que fica
 * em outra região. Mantém o menu e o topo na tela e reserva o espaço do conteúdo.
 */
export default function CarregandoAreaLogada() {
  return (
    <div role="status" aria-label="Carregando" className="grid gap-4">
      <span className="sr-only">Carregando...</span>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="mt-4 grid gap-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
