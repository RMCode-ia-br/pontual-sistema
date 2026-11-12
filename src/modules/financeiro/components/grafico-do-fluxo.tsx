"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatarMoeda } from "@/lib/formatadores";

export type PontoDoFluxo = { rotulo: string; entradasCentavos: number; saidasCentavos: number; saldoCentavos: number };

const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/**
 * Entradas e saídas por período (barras) e o saldo projetado (linha), numa ÚNICA escala em reais. É um complemento: a tabela ao
 * lado traz os mesmos números. Entradas e saídas usam duas cores de série distintas, com legenda de texto (nunca só cor).
 */
export function GraficoDoFluxo({ pontos, descricao }: { pontos: PontoDoFluxo[]; descricao: string }) {
  const dados = pontos.map((p) => ({ nome: p.rotulo, Entradas: p.entradasCentavos / 100, Saídas: p.saidasCentavos / 100, "Saldo projetado": p.saldoCentavos / 100 }));
  return (
    <div role="img" aria-label={descricao} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="nome" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={80} tickFormatter={(v: number) => `R$ ${compacto.format(v)}`} />
          <Tooltip cursor={{ fill: "rgba(0,0,0,0.05)" }} formatter={(v) => formatarMoeda(Math.round(Number(v) * 100))} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Entradas" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          <Bar dataKey="Saídas" fill="var(--chart-4)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          <Line type="monotone" dataKey="Saldo projetado" stroke="var(--foreground)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "var(--background)" }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
