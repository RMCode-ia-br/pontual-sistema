"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { executar, falha, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { can } from "@/lib/permissoes";
import { campoIdObrigatorio } from "@/lib/validadores/campos";

import { restaurarDaLixeira } from "./restaurar";
import type { TipoDaLixeira } from "./tipos";

const idsSchema = z.array(campoIdObrigatorio()).min(1, "Escolha ao menos um item.").max(200, "Escolha no máximo 200 de uma vez.");

const CAMINHOS: Record<TipoDaLixeira, string[]> = {
  clientes: ["/clientes", "/parceiros"],
  fornecedores: ["/fornecedores"],
  funcionarios: ["/funcionarios", "/funcionarios/equipes"],
  produtos: ["/produtos"],
  equipes: ["/funcionarios/equipes", "/funcionarios"],
  projetos: ["/projetos", "/funil"],
};

async function restaurar(tipo: TipoDaLixeira, idsBrutos: string[]): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "restaurar", tipo)) return falha("Sem permissão.");
  const ids = idsSchema.safeParse(idsBrutos);
  if (!ids.success) return falha(ids.error.issues[0]?.message ?? "Seleção inválida.");

  return executar("lixeira.restaurar", async () => {
    const ip = extrairIp(await headers());
    const r = await restaurarDaLixeira({ usuario: { id: sessao.id, nome: sessao.nome }, tipo, ids: ids.data, ip });
    for (const caminho of [...CAMINHOS[tipo], "/lixeira"]) revalidatePath(caminho);
    revalidatePath("/", "layout");
    if (r.restaurados === 0 && r.conflitos.length > 0) return falha(`Nada foi restaurado. ${r.conflitos.join(" ")}`);
    const base = `${r.restaurados} ${r.restaurados === 1 ? "item restaurado" : "itens restaurados"}.`;
    return sucesso(undefined, r.conflitos.length > 0 ? `${base} Ficaram na lixeira: ${r.conflitos.join(" ")}` : base);
  });
}

export async function restaurarClientes(ids: string[]): Promise<ResultadoAcao> {
  return restaurar("clientes", ids);
}

export async function restaurarFornecedores(ids: string[]): Promise<ResultadoAcao> {
  return restaurar("fornecedores", ids);
}

export async function restaurarFuncionarios(ids: string[]): Promise<ResultadoAcao> {
  return restaurar("funcionarios", ids);
}

export async function restaurarProdutos(ids: string[]): Promise<ResultadoAcao> {
  return restaurar("produtos", ids);
}

export async function restaurarEquipes(ids: string[]): Promise<ResultadoAcao> {
  return restaurar("equipes", ids);
}

export async function restaurarProjetos(ids: string[]): Promise<ResultadoAcao> {
  return restaurar("projetos", ids);
}
