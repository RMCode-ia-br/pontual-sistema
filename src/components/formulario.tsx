import { cn } from "@/lib/utils";

import { Label } from "@/components/ui/label";

type CampoProps = {
  id: string;
  rotulo: string;
  erro?: string;
  dica?: string;
  obrigatorio?: boolean;
  className?: string;
  children: React.ReactNode;
};

/** Rótulo + controle + dica + erro, ligados por aria-describedby (chame `ariaDoCampo` no controle). */
export function Campo({ id, rotulo, erro, dica, obrigatorio, className, children }: CampoProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>
        {rotulo}
        {obrigatorio ? <span aria-hidden className="text-destructive"> *</span> : null}
      </Label>
      {children}
      {dica && !erro ? (
        <p id={`${id}-dica`} className="text-muted-foreground text-xs">
          {dica}
        </p>
      ) : null}
      {erro ? (
        <p id={`${id}-erro`} role="alert" className="text-destructive text-xs">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

/** Atributos de acessibilidade para o controle de um Campo. */
export function ariaDoCampo(id: string, erro?: string, dica?: string) {
  return {
    "aria-invalid": erro ? true : undefined,
    "aria-describedby": erro ? `${id}-erro` : dica ? `${id}-dica` : undefined,
  } as const;
}

const estiloControle =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-9 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:opacity-50";

/** `<select>` nativo: acessível, ótimo no celular e funciona direto com FormData. */
export function Selecao({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select className={cn(estiloControle, className)} {...props}>
      {children}
    </select>
  );
}

export function CaixaMarcacao({
  id,
  rotulo,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { id: string; rotulo: string }) {
  return (
    <label htmlFor={id} className={cn("flex min-h-9 cursor-pointer items-center gap-2 text-sm", className)}>
      <input id={id} type="checkbox" className="accent-primary size-4" {...props} />
      {rotulo}
    </label>
  );
}

export const estiloAreaTexto =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive min-h-24 w-full rounded-lg border px-2.5 py-2 text-sm outline-none focus-visible:ring-3 disabled:opacity-50";

export function AreaTexto({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(estiloAreaTexto, className)} {...props} />;
}
