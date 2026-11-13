"use client";

import { formatarMoeda } from "@/lib/formatadores";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Cores das séries, na ordem fixa: azul da marca e laranja (validados em claro e escuro, ver `--serie-2` em globals.css). */
const COR_DA_SERIE = ["var(--chart-1)", "var(--serie-2)"] as const;

export type SerieDoGrafico = { chave: string; rotulo: string };
export type DadoDoGrafico = { nome: string } & Record<string, number | string>;

type Props = {
  dados: DadoDoGrafico[];
  /** Uma ou duas séries (um gráfico com mais de duas barras por categoria vira tabela ou vários gráficos). */
  series: SerieDoGrafico[];
  /** Descrição para leitor de tela; a tabela do relatório traz os mesmos números. */
  descricao: string;
  /** "horizontal" (padrão): rótulos longos cabem no celular. "vertical": colunas, para meses e faixas. */
  orientacao?: "horizontal" | "vertical";
  /** Empilha as séries numa mesma barra (partes de um total). Padrão: lado a lado. */
  empilhado?: boolean;
  /**
   * Como mostrar os valores: "numero" (padrão) ou "reais" (os valores já vêm em REAIS, não em centavos: tooltip e rótulos em R$ completos,
   * eixo curto como "120 mil"). É um texto, e não uma função, porque a página (servidor) não pode passar função para este componente (cliente).
   */
  formato?: "numero" | "reais";
  /** Escreve o valor na ponta da barra (só para poucas barras; com muitas, use o tooltip e a tabela). */
  rotulosNasBarras?: boolean;
};

function DicaDoGrafico({ ativo, payload, label, formatarValor, series }: { ativo?: boolean; payload?: readonly { dataKey?: unknown; value?: unknown }[]; label?: unknown; formatarValor: (n: number) => string; series: SerieDoGrafico[] }) {
  if (!ativo || !payload || payload.length === 0) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{String(label ?? "")}</p>
      <ul className="grid gap-0.5">
        {series.map((s, i) => {
          const item = payload.find((p) => p.dataKey === s.chave);
          if (!item || typeof item.value !== "number") return null;
          return (
            <li key={s.chave} className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: COR_DA_SERIE[i] }} />
              <span className="text-muted-foreground">{s.rotulo}:</span>
              <span className="font-medium tabular-nums">{formatarValor(item.value)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Gráfico de barras dos relatórios. Complemento da tabela (a tabela traz os mesmos números e é o que se imprime e se
 * exporta). Marcas finas com ponta arredondada, 2 px de respiro entre barras, grade e eixos discretos, valor só no
 * tooltip (ou na ponta, quando poucas barras), texto sempre na cor de texto e legenda quando há mais de uma série.
 */
export function GraficoDeBarras({ dados, series, descricao, orientacao = "horizontal", empilhado = false, formato = "numero", rotulosNasBarras = false }: Props) {
  const formatarValor = formato === "reais" ? (n: number) => formatarMoeda(Math.round(n * 100)) : (n: number) => String(n);
  const formatarEixo = formato === "reais" ? (n: number) => (Math.abs(n) >= 1000 ? `${Math.round(n / 1000)} mil` : String(n)) : formatarValor;
  const horizontal = orientacao === "horizontal";
  // Com muitas colunas (12 meses) os rótulos do eixo se sobrepõem: giram para caber, também no celular.
  const muitasCategorias = !horizontal && dados.length > 6;
  const altura = horizontal ? Math.max(140, dados.length * (series.length > 1 && !empilhado ? 52 : 36) + 32) : muitasCategorias ? 310 : 280;
  const raio: [number, number, number, number] = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
  return (
    <figure className="w-full" aria-label={descricao}>
      {series.length > 1 ? (
        <ul className="text-muted-foreground mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legenda">
          {series.map((s, i) => (
            <li key={s.chave} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-sm" style={{ background: COR_DA_SERIE[i] }} />
              {s.rotulo}
            </li>
          ))}
        </ul>
      ) : null}
      <div role="img" aria-label={descricao} style={{ height: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: rotulosNasBarras ? 56 : 12, bottom: 4, left: 4 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid horizontal={!horizontal} vertical={horizontal} stroke="var(--border)" strokeDasharray="3 3" />
            {horizontal ? (
              <>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nome" width={132} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
              </>
            ) : (
              <>
                <XAxis dataKey="nome" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} interval={0} angle={muitasCategorias ? -40 : 0} textAnchor={muitasCategorias ? "end" : "middle"} height={muitasCategorias ? 56 : 30} />
                <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => formatarEixo(Number(v))} />
              </>
            )}
            <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.5 }} content={(p) => <DicaDoGrafico ativo={p.active} payload={p.payload} label={p.label} formatarValor={formatarValor} series={series} />} />
            {series.map((s, i) => (
              <Bar key={s.chave} dataKey={s.chave} name={s.rotulo} fill={COR_DA_SERIE[i]} stackId={empilhado ? "total" : undefined} radius={empilhado && i < series.length - 1 ? 0 : raio} maxBarSize={26} stroke="var(--background)" strokeWidth={empilhado ? 2 : 0} isAnimationActive={false}>
                {rotulosNasBarras ? <LabelList dataKey={s.chave} position={horizontal ? "right" : "top"} fontSize={12} fill="var(--foreground)" formatter={(v) => formatarValor(Number(v))} /> : null}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
