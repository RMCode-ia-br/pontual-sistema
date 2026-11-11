"use server";

import { z } from "zod";

import { sucesso, type ResultadoAcao } from "@/lib/acoes";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { formatarDataHora, instanteParaInputDataHora } from "@/lib/formatadores";
import { padraoLike } from "@/lib/listas/parametros";

import { horariosLivresDoDia } from "../queries";

export type ProjetoParaEscolha = { id: string; rotulo: string; clienteId: string; clienteNome: string; enderecoObraId: string | null };

/** Busca de projetos enquanto a pessoa digita (campo "Projeto" do compromisso). Ignora acentos e maiúsculas. */
export async function buscarProjetosParaAgenda(termo: string): Promise<ResultadoAcao<ProjetoParaEscolha[]>> {
  await exigirSessao();
  const texto = z.string().trim().min(2).max(80).safeParse(termo);
  if (!texto.success) return sucesso([]);
  const padrao = padraoLike(texto.data.toLowerCase());
  const linhas = await prisma.$queryRaw<{ id: string; codigo: string; titulo: string; clienteId: string; cliente: string; enderecoObraId: string | null }[]>`
    SELECT p.id, p.codigo, p.titulo, p."clienteId", c.nome AS cliente, p."enderecoObraId"
      FROM "Projeto" p JOIN "Cliente" c ON c.id = p."clienteId"
     WHERE p."deletadoEm" IS NULL AND p.status NOT IN ('PERDIDO', 'CANCELADO')
       AND ( public.f_unaccent(lower(p."codigo" || ' ' || p."titulo")) LIKE public.f_unaccent(${padrao})
          OR public.f_unaccent(lower(c."nome" || ' ' || coalesce(c."nomeFantasia", ''))) LIKE public.f_unaccent(${padrao}) )
     ORDER BY p."criadoEm" DESC LIMIT 8`;
  return sucesso(linhas.map((l) => ({ id: l.id, rotulo: `${l.codigo} · ${l.titulo} — ${l.cliente}`, clienteId: l.clienteId, clienteNome: l.cliente, enderecoObraId: l.enderecoObraId })));
}

const entradaHorarios = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duracaoMin: z.number().int().min(5).max(24 * 60),
  responsavelId: z.string().max(64).optional(),
  equipeId: z.string().max(64).optional(),
});

export type HorarioLivre = { valor: string; rotulo: string };

/** Horários livres do dia (expediente, agenda do responsável/equipe e feriados), para o "Ver horários livres". */
export async function sugerirHorarios(entrada: unknown): Promise<ResultadoAcao<HorarioLivre[]>> {
  await exigirSessao();
  const lido = entradaHorarios.safeParse(entrada);
  if (!lido.success) return sucesso([]);
  const livres = await horariosLivresDoDia({ ...lido.data, responsavelId: lido.data.responsavelId || null, equipeId: lido.data.equipeId || null });
  return sucesso(livres.map((d) => ({ valor: instanteParaInputDataHora(d), rotulo: formatarDataHora(d).slice(11) })));
}
