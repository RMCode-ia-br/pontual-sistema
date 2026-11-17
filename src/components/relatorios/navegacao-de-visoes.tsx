import Link from "next/link";

import { montarConsulta } from "@/lib/listas/parametros";
import { cn } from "@/lib/utils";

export type Visao = { valor: string; titulo: string };

/**
 * Abas de um relatório com várias visões (uma por vez, para poucos números por tela). Cada aba é um link `?visao=...` que
 * preserva os outros filtros (período etc.); como é link, funciona sem JavaScript e a visão escolhida vai para o CSV e para a impressão.
 */
export function NavegacaoDeVisoes({ visoes, atual, parametros, rotulo }: { visoes: readonly Visao[]; atual: string; parametros: Record<string, string>; rotulo: string }) {
  return (
    <nav aria-label={rotulo} className="mb-5 flex flex-wrap gap-1.5 print:hidden">
      {visoes.map((v) => (
        <Link
          key={v.valor}
          href={`?${montarConsulta({ ...parametros, visao: v.valor }).slice(1)}`}
          aria-current={atual === v.valor ? "page" : undefined}
          className={cn("inline-flex min-h-9 items-center rounded-full border px-3 text-sm", atual === v.valor ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")}
        >
          {v.titulo}
        </Link>
      ))}
    </nav>
  );
}

/** Lê a visão da URL: só vale uma das conhecidas; qualquer outra coisa volta à primeira. */
export function lerVisao(bruto: string | string[] | undefined, visoes: readonly Visao[]): string {
  const v = Array.isArray(bruto) ? bruto[0] : bruto;
  return visoes.find((x) => x.valor === v)?.valor ?? visoes[0].valor;
}
