import { ALTURA_QUADRO, gerarDesenho, LARGURA_QUADRO, type EntradaDesenho } from "@/lib/dominio/desenho";
import { cn } from "@/lib/utils";

type Props = EntradaDesenho & { className?: string; titulo?: string };

/** Desenho esquemático da esquadria em SVG (mesmas formas do PDF). Decorativo: o texto da descrição é o conteúdo. */
export function DesenhoEsquadria({ className, titulo, ...entrada }: Props) {
  const formas = gerarDesenho(entrada);
  return (
    <svg viewBox={`0 0 ${LARGURA_QUADRO} ${ALTURA_QUADRO}`} className={cn("text-foreground h-auto w-full", className)} role={titulo ? "img" : undefined} aria-label={titulo} aria-hidden={titulo ? undefined : true}>
      {formas.map((f, i) =>
        f.t === "rect" ? (
          <rect key={i} x={f.x} y={f.y} width={f.w} height={f.h} fill={f.vidro ? "rgba(96,165,250,0.18)" : "none"} stroke="currentColor" strokeWidth={0.9} />
        ) : (
          <line key={i} x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} stroke="currentColor" strokeWidth={0.7} strokeDasharray={f.tracejada ? "2 1.6" : undefined} />
        ),
      )}
    </svg>
  );
}
