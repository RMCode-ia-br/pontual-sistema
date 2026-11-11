"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Dado = { nome: string; valor: number };

/** Barras horizontais (rótulos longos cabem no celular). O gráfico é um complemento: a tabela ao lado traz os mesmos números. */
export function GraficoDeBarras({ dados, descricao }: { dados: Dado[]; descricao: string }) {
  const altura = Math.max(120, dados.length * 36 + 24);
  return (
    <div role="img" aria-label={descricao} style={{ height: altura }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 4 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "rgba(0,0,0,0.05)" }} formatter={(v) => [String(v), "Projetos"]} />
          <Bar dataKey="valor" fill="var(--primary)" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="valor" position="right" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
