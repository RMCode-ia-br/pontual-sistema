import { ArrowDown, ArrowUp, Equal } from "lucide-react";
import Link from "next/link";

import { variacaoEntre } from "@/lib/periodo/variacao";
import { cn } from "@/lib/utils";

import { ComoECalculado } from "./como-e-calculado";

export type Comparativo = {
  /** Contra o quê: "o mês anterior", "novembro do ano passado". */
  rotulo: string;
  atual: number | null;
  comparacao: number | null;
  /** Mostra o valor de comparação (ex.: formatarMoeda). */
  formatar: (n: number) => string;
};

function LinhaDeComparacao({ c }: { c: Comparativo }) {
  const v = variacaoEntre(c.atual, c.comparacao);
  const valor = c.comparacao === null ? "" : ` (${c.formatar(c.comparacao)})`;
  if (v.tipo === "sem-base") {
    return <li className="text-muted-foreground">Sem base para comparar com {c.rotulo}.</li>;
  }
  if (v.tipo === "igual") {
    return (
      <li className="text-muted-foreground flex items-center gap-1">
        <Equal className="size-3.5 shrink-0" aria-hidden /> Igual a {c.rotulo}
        {valor}
      </li>
    );
  }
  const Icone = v.tipo === "subiu" ? ArrowUp : ArrowDown;
  return (
    <li className="text-muted-foreground flex items-center gap-1">
      <Icone className="size-3.5 shrink-0" aria-hidden />
      <span>
        <span className="text-foreground font-medium">{v.tipo === "subiu" ? "Acima" : "Abaixo"} {v.percentual}%</span> de {c.rotulo}
        {valor}
      </span>
    </li>
  );
}

/**
 * Um número do painel: o valor em destaque, de onde ele vem (link para a lista filtrada que o explica, e que bate com
 * o relatório) e "como é calculado". O cartão inteiro é o link; o botão da definição fica por cima dele.
 */
export function NumeroDoPainel({
  titulo,
  valor,
  href,
  definicao,
  detalhe,
  comparativos,
  alerta = false,
  grande = false,
  className,
}: {
  titulo: string;
  valor: React.ReactNode;
  /** Lista que explica o número. Sem link, o cartão só mostra o número (resumo dentro de um relatório). */
  href?: string;
  definicao: string;
  detalhe?: React.ReactNode;
  comparativos?: Comparativo[];
  alerta?: boolean;
  grande?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative flex flex-col rounded-xl border p-4 transition-colors", href && "hover:bg-accent/50", alerta && "border-destructive/40 bg-destructive/5", className)}>
      {href ? (
        <Link href={href} className="text-muted-foreground text-sm font-medium after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
          {titulo}
        </Link>
      ) : (
        <p className="text-muted-foreground text-sm font-medium">{titulo}</p>
      )}
      <p className={cn("mt-2 font-semibold tabular-nums [overflow-wrap:anywhere]", grande ? "text-3xl sm:text-4xl" : "text-2xl", alerta && "text-destructive")}>{valor}</p>
      {detalhe ? <div className="text-muted-foreground mt-1 text-xs">{detalhe}</div> : null}
      {comparativos && comparativos.length > 0 ? (
        <ul className="mt-2 grid gap-0.5 text-xs">
          {comparativos.map((c) => (
            <LinhaDeComparacao key={c.rotulo} c={c} />
          ))}
        </ul>
      ) : null}
      <ComoECalculado texto={definicao} className="mt-2 -ml-1" />
    </div>
  );
}
