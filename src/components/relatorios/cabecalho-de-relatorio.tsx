import { Download } from "lucide-react";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { buttonVariants } from "@/components/ui/button";
import { formatarData } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { BotaoImprimir } from "@/modules/relatorios/components/botao-imprimir";

/**
 * Topo padrão de um relatório: título, descrição, os botões de CSV e de impressão e, só no papel, o período e a data de
 * emissão (para o papel dizer de que período é). Os filtros (`SeletorDePeriodo` e outros) entram como `children`.
 */
export function CabecalhoDeRelatorio({
  titulo,
  descricao,
  periodoRotulo,
  hrefCsv,
  children,
}: {
  titulo: string;
  descricao?: string;
  /** Período em texto ("novembro de 2026"); vai para o papel. */
  periodoRotulo?: string;
  /** Link do CSV com os MESMOS filtros da tela. */
  hrefCsv?: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <CabecalhoPagina
        titulo={titulo}
        descricao={descricao}
        acoes={
          <>
            {hrefCsv ? (
              <a href={hrefCsv} className={cn(buttonVariants({ variant: "outline" }), "print:hidden")}>
                <Download aria-hidden /> Exportar CSV
              </a>
            ) : null}
            <BotaoImprimir />
          </>
        }
      />
      <p className="mb-4 hidden text-sm print:block">
        {periodoRotulo ? `Período: ${periodoRotulo} · ` : ""}Emitido em {formatarData(new Date())}
      </p>
      {children}
    </>
  );
}

/** Tabela de relatório: rola na horizontal no celular (só ela, nunca a página) e leva a legenda para leitor de tela. */
export function TabelaDeRelatorio({ legenda, children, className }: { legenda: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border print:overflow-visible print:border-0", className)}>
      <table className="w-full text-sm">
        <caption className="sr-only">{legenda}</caption>
        {children}
      </table>
    </div>
  );
}
