"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { executar, falha, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { sugerirCustoPorM2, type SugestaoDeMaoDeObra } from "@/lib/dominio/mao-de-obra";
import { can } from "@/lib/permissoes";

/** Calcula a sugestão a partir dos salários da fábrica e da instalação (funcionários ativos) e da capacidade mensal. Não grava nada. Interna: só as ações abaixo (que exigem sessão) a chamam. */
async function calcularSugestaoDeMaoDeObra(): Promise<SugestaoDeMaoDeObra> {
  const [funcionarios, config] = await Promise.all([
    prisma.funcionario.findMany({ where: { ativo: true, deletadoEm: null, demissaoEm: null, funcao: { in: ["FABRICA", "INSTALACAO"] } }, select: { salarioBaseCentavos: true } }),
    prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { capacidadeProducaoM2Mes: true } }),
  ]);
  return sugerirCustoPorM2(
    funcionarios.map((f) => f.salarioBaseCentavos),
    config?.capacidadeProducaoM2Mes ?? null,
  );
}

export async function verSugestaoDeMaoDeObra(): Promise<ResultadoAcao<SugestaoDeMaoDeObra>> {
  await exigirSessao();
  return sucesso(await calcularSugestaoDeMaoDeObra());
}

/** Aplica a sugestão em Configurações (o servidor recalcula: nunca confia no valor que a tela mostrou). Auditado. */
export async function aplicarSugestaoDeMaoDeObra(): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "configuracao")) return falha("Sem permissão.");
  return executar("obras.mao-de-obra.aplicar", async () => {
    const s = await calcularSugestaoDeMaoDeObra();
    if (!s.ok) return falha(s.motivo);
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const antes = await tx.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { custoMaoDeObraPorM2Centavos: true } });
      await tx.configuracaoEmpresa.update({ where: { id: "singleton" }, data: { custoMaoDeObraPorM2Centavos: s.centavosPorM2, atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "ConfiguracaoEmpresa", entidadeId: "singleton", acao: "ATUALIZAR", antes: { custoMaoDeObraPorM2Centavos: antes?.custoMaoDeObraPorM2Centavos ?? null }, depois: { custoMaoDeObraPorM2Centavos: s.centavosPorM2, origem: "sugestão pelos salários", funcionarios: s.funcionarios, capacidadeM2Mes: s.capacidadeM2Mes }, ip });
    });
    revalidatePath("/obras", "layout");
    revalidatePath("/configuracoes", "layout");
    return sucesso(undefined, "Custo de mão de obra por m² definido.");
  });
}
