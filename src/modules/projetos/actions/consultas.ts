"use server";

import { falha, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirSessao } from "@/lib/auth/sessao";
import { can } from "@/lib/permissoes";
import { prisma } from "@/lib/db";
import { campoIdObrigatorio } from "@/lib/validadores/campos";
import { resumoDoEndereco } from "@/modules/clientes/schemas";

export type EnderecoParaEscolha = { id: string; rotulo: string };

/** Endereços do cliente, para escolher o local da obra enquanto o projeto é preenchido. */
export async function listarEnderecosDoCliente(clienteIdBruto: string): Promise<ResultadoAcao<EnderecoParaEscolha[]>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "ver", "cliente")) return falha("Sem permissão.");
  const clienteId = campoIdObrigatorio().safeParse(clienteIdBruto);
  if (!clienteId.success) return sucesso([]);
  const enderecos = await prisma.enderecoCliente.findMany({
    where: { clienteId: clienteId.data, deletadoEm: null },
    orderBy: [{ tipo: "desc" }, { criadoEm: "asc" }],
    select: { id: true, tipo: true, apelido: true, logradouro: true, numero: true, bairro: true, cidade: true, uf: true },
    take: 50,
  });
  return sucesso(
    enderecos.map((e) => ({
      id: e.id,
      rotulo: [e.apelido, resumoDoEndereco(e)].filter(Boolean).join(" — ") || (e.tipo === "OBRA" ? "Endereço da obra" : "Endereço de cobrança"),
    })),
  );
}
