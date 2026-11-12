// Sugestão do custo de mão de obra por m² (R15): salários da área operacional ÷ capacidade mensal em m². Função pura.
//
// É SÓ uma sugestão que o gestor confirma (nada é gravado sozinho). Sem salário cadastrado ou sem capacidade válida, não sugere
// nada: o sistema não inventa o custo.

export type SugestaoDeMaoDeObra = { ok: true; centavosPorM2: number; somaCentavos: number; funcionarios: number; capacidadeM2Mes: number } | { ok: false; motivo: string };

export function sugerirCustoPorM2(salariosCentavos: readonly (number | null)[], capacidadeM2Mes: number | null): SugestaoDeMaoDeObra {
  const validos = salariosCentavos.filter((s): s is number => s !== null && Number.isInteger(s) && s > 0);
  if (validos.length === 0) return { ok: false, motivo: "Nenhum funcionário de fábrica ou instalação tem salário cadastrado." };
  if (capacidadeM2Mes === null || !Number.isFinite(capacidadeM2Mes) || capacidadeM2Mes <= 0) return { ok: false, motivo: "A capacidade de produção por mês (m²) não está definida." };
  const soma = validos.reduce((s, v) => s + v, 0);
  return { ok: true, centavosPorM2: Math.round(soma / capacidadeM2Mes), somaCentavos: soma, funcionarios: validos.length, capacidadeM2Mes };
}
