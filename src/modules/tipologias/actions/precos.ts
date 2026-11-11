"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ErroNegocio, executar, falha, falhaDeValidacao, formDataParaObjeto, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { extrairIp } from "@/lib/auth/autenticar";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissoes";
import { campoIdObrigatorio } from "@/lib/validadores/campos";

import { COBRANCAS, importacaoPrecosSchema, precoSchema } from "../schemas";
import { normalizarCabecalho } from "@/lib/dominio/mapeamento";
import { valorParaCentavos } from "@/lib/dominio/numeros";

const MENSAGEM_UNICA = "Já existe um preço para essa combinação (linha, acabamento, vidro e espessura). Edite o existente.";

const campos = {
  id: true,
  tipologiaId: true,
  linhaId: true,
  acabamentoId: true,
  tipoVidroId: true,
  espessuraVidroMm: true,
  cobranca: true,
  valorCentavos: true,
  vigenciaInicio: true,
  vigenciaFim: true,
} as const;

const paraData = (v: string | undefined) => (v ? new Date(`${v}T00:00:00.000Z`) : null);

/** Cada ID de catálogo vindo do navegador precisa existir. */
async function conferirCatalogos(v: { linhaId?: string; acabamentoId?: string; tipoVidroId?: string }) {
  const [linha, acabamento, vidro] = await Promise.all([
    v.linhaId ? prisma.linhaAluminio.count({ where: { id: v.linhaId, deletadoEm: null } }) : 1,
    v.acabamentoId ? prisma.acabamentoAluminio.count({ where: { id: v.acabamentoId, deletadoEm: null } }) : 1,
    v.tipoVidroId ? prisma.tipoVidro.count({ where: { id: v.tipoVidroId, deletadoEm: null } }) : 1,
  ]);
  if (!linha || !acabamento || !vidro) throw new ErroNegocio("Um dos itens escolhidos (linha, acabamento ou vidro) não foi encontrado.");
}

export async function salvarPreco(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "tipologia")) return falha("Sem permissão.");
  const dados = precoSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  const v = dados.data;
  if (v.vigenciaInicio && v.vigenciaFim && v.vigenciaFim < v.vigenciaInicio) return falha("A vigência termina antes de começar.", { vigenciaFim: "Deve ser depois do início." });

  return executar(
    "precos.salvar",
    async () => {
      const tipologia = await prisma.tipologia.findFirst({ where: { id: v.tipologiaId, deletadoEm: null }, select: { id: true } });
      if (!tipologia) throw new ErroNegocio("Tipologia não encontrada.");
      await conferirCatalogos(v);
      const ip = extrairIp(await headers());
      const dadosLinha = {
        linhaId: v.linhaId ?? null,
        acabamentoId: v.acabamentoId ?? null,
        tipoVidroId: v.tipoVidroId ?? null,
        espessuraVidroMm: v.espessuraVidroMm ?? null,
        cobranca: v.cobranca,
        valorCentavos: v.valor,
        vigenciaInicio: paraData(v.vigenciaInicio),
        vigenciaFim: paraData(v.vigenciaFim),
      };
      await prisma.$transaction(async (tx) => {
        if (v.id) {
          const antes = await tx.tabelaPreco.findFirst({ where: { id: v.id, tipologiaId: v.tipologiaId, deletadoEm: null }, select: campos });
          if (!antes) throw new ErroNegocio("Preço não encontrado.");
          const depois = await tx.tabelaPreco.update({ where: { id: v.id }, data: { ...dadosLinha, atualizadoPorId: sessao.id }, select: campos });
          await registrarAuditoria(tx, { usuario: sessao, entidade: "TabelaPreco", entidadeId: v.id, acao: "ATUALIZAR", antes, depois, ip });
        } else {
          const nova = await tx.tabelaPreco.create({ data: { tipologiaId: v.tipologiaId, ...dadosLinha, criadoPorId: sessao.id, atualizadoPorId: sessao.id }, select: campos });
          await registrarAuditoria(tx, { usuario: sessao, entidade: "TabelaPreco", entidadeId: nova.id, acao: "CRIAR", depois: nova, ip });
        }
      });
      revalidatePath(`/tipologias/${v.tipologiaId}`);
      return sucesso(undefined, v.id ? "Preço atualizado." : "Preço adicionado.");
    },
    MENSAGEM_UNICA,
  );
}

export async function excluirPreco(tipologiaIdBruto: string, idBruto: string): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "tipologia")) return falha("Sem permissão.");
  const tipologiaId = campoIdObrigatorio().safeParse(tipologiaIdBruto);
  const id = campoIdObrigatorio().safeParse(idBruto);
  if (!tipologiaId.success || !id.success) return falha("Registro inválido.");

  return executar("precos.excluir", async () => {
    const ip = extrairIp(await headers());
    await prisma.$transaction(async (tx) => {
      const antes = await tx.tabelaPreco.findFirst({ where: { id: id.data, tipologiaId: tipologiaId.data, deletadoEm: null }, select: campos });
      if (!antes) throw new ErroNegocio("Preço não encontrado.");
      await tx.tabelaPreco.update({ where: { id: id.data }, data: { deletadoEm: new Date(), atualizadoPorId: sessao.id } });
      await registrarAuditoria(tx, { usuario: sessao, entidade: "TabelaPreco", entidadeId: id.data, acao: "EXCLUIR", antes, ip });
    });
    revalidatePath(`/tipologias/${tipologiaId.data}`);
    return sucesso(undefined, "Preço removido.");
  });
}

// ----- Importação (CSV/XLSX lido no navegador) -----

const semAcento = (t: string) => normalizarCabecalho(t.replace("²", "2"));

const COBRANCA_POR_TEXTO: Record<string, (typeof COBRANCAS)[number]> = {
  porm2: "POR_M2",
  m2: "POR_M2",
  porunidade: "POR_UNIDADE",
  unidade: "POR_UNIDADE",
  un: "POR_UNIDADE",
  pormetrolinear: "POR_METRO_LINEAR",
  metrolinear: "POR_METRO_LINEAR",
  ml: "POR_METRO_LINEAR",
};

export type ResultadoImportacaoPrecos = { criados: number; atualizados: number };

/**
 * Importa linhas de preço da tipologia: colunas Linha; Acabamento; Vidro; Espessura (mm); Cobrança; Valor.
 * Tudo ou nada: se qualquer linha tiver erro, nada é gravado e a mensagem lista as linhas com problema.
 * Linha que repete uma combinação existente atualiza o valor.
 */
export async function importarPrecos(entrada: { tipologiaId: string; linhas: string[][] }): Promise<ResultadoAcao<ResultadoImportacaoPrecos>> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "tipologia")) return falha("Sem permissão.");
  const lido = importacaoPrecosSchema.safeParse(entrada);
  if (!lido.success) return falha(lido.error.issues[0]?.message ?? "Dados inválidos.");

  return executar("precos.importar", async () => {
    const tipologiaId = lido.data.tipologiaId;
    const tipologia = await prisma.tipologia.findFirst({ where: { id: tipologiaId, deletadoEm: null }, select: { id: true } });
    if (!tipologia) throw new ErroNegocio("Tipologia não encontrada.");

    const [linhas, acabamentos, vidros, existentes] = await Promise.all([
      prisma.linhaAluminio.findMany({ where: { deletadoEm: null }, select: { id: true, nome: true } }),
      prisma.acabamentoAluminio.findMany({ where: { deletadoEm: null }, select: { id: true, nome: true } }),
      prisma.tipoVidro.findMany({ where: { deletadoEm: null }, select: { id: true, nome: true } }),
      prisma.tabelaPreco.findMany({ where: { tipologiaId, deletadoEm: null }, select: { id: true, linhaId: true, acabamentoId: true, tipoVidroId: true, espessuraVidroMm: true } }),
    ]);
    const porNome = (lista: { id: string; nome: string }[]) => new Map(lista.map((x) => [semAcento(x.nome), x.id]));
    const mLinhas = porNome(linhas);
    const mAcab = porNome(acabamentos);
    const mVidros = porNome(vidros);
    const chave = (l: string | null, a: string | null, v: string | null, e: number | null) => `${l ?? ""}|${a ?? ""}|${v ?? ""}|${e ?? ""}`;
    const idPorChave = new Map(existentes.map((e) => [chave(e.linhaId, e.acabamentoId, e.tipoVidroId, e.espessuraVidroMm), e.id]));

    const erros: string[] = [];
    const prontas = new Map<string, { linhaId: string | null; acabamentoId: string | null; tipoVidroId: string | null; espessuraVidroMm: number | null; cobranca: (typeof COBRANCAS)[number]; valorCentavos: number }>();
    for (const [i, c] of lido.data.linhas.entries()) {
      const n = i + 1;
      const errosAntes = erros.length;
      const [tLinha = "", tAcab = "", tVidro = "", tEsp = "", tCob = "", tValor = ""] = c.map((x) => x.trim());
      const linhaId = tLinha ? (mLinhas.get(semAcento(tLinha)) ?? null) : null;
      const acabamentoId = tAcab ? (mAcab.get(semAcento(tAcab)) ?? null) : null;
      const tipoVidroId = tVidro ? (mVidros.get(semAcento(tVidro)) ?? null) : null;
      if (tLinha && !linhaId) erros.push(`Linha ${n}: a linha "${tLinha}" não existe nos catálogos.`);
      if (tAcab && !acabamentoId) erros.push(`Linha ${n}: o acabamento "${tAcab}" não existe nos catálogos.`);
      if (tVidro && !tipoVidroId) erros.push(`Linha ${n}: o vidro "${tVidro}" não existe nos catálogos.`);
      let espessura: number | null = null;
      if (tEsp) {
        espessura = /^\d{1,2}$/.test(tEsp) ? Number(tEsp) : null;
        if (espessura === null || espessura < 1) erros.push(`Linha ${n}: espessura "${tEsp}" inválida (use mm, ex.: 8).`);
      }
      const chaveCobranca = semAcento(tCob);
      const cobranca = Object.hasOwn(COBRANCA_POR_TEXTO, chaveCobranca) ? COBRANCA_POR_TEXTO[chaveCobranca] : undefined;
      if (!cobranca) erros.push(`Linha ${n}: cobrança "${tCob}" inválida (use "por m²", "por unidade" ou "por metro linear").`);
      const valor = valorParaCentavos(tValor);
      if (valor === null || valor <= 0 || valor > 2_000_000_000) erros.push(`Linha ${n}: valor "${tValor}" inválido.`);
      if (erros.length === errosAntes && cobranca && valor !== null) {
        prontas.set(chave(linhaId, acabamentoId, tipoVidroId, espessura), { linhaId, acabamentoId, tipoVidroId, espessuraVidroMm: espessura, cobranca, valorCentavos: valor });
      }
      if (erros.length >= 20) {
        erros.push("Há mais erros; corrija estes e envie de novo.");
        break;
      }
    }
    if (erros.length > 0) throw new ErroNegocio(erros.join(" "));

    const ip = extrairIp(await headers());
    let criados = 0;
    let atualizados = 0;
    await prisma.$transaction(async (tx) => {
      for (const [k, p] of prontas) {
        const existente = idPorChave.get(k);
        if (existente) {
          await tx.tabelaPreco.update({ where: { id: existente }, data: { cobranca: p.cobranca, valorCentavos: p.valorCentavos, atualizadoPorId: sessao.id } });
          atualizados++;
        } else {
          await tx.tabelaPreco.create({ data: { tipologiaId, ...p, criadoPorId: sessao.id, atualizadoPorId: sessao.id } });
          criados++;
        }
      }
      await registrarAuditoria(tx, { usuario: sessao, entidade: "Tipologia", entidadeId: tipologiaId, acao: "IMPORTAR_PRECOS", depois: { criados, atualizados } , ip });
    });
    revalidatePath(`/tipologias/${tipologiaId}`);
    return sucesso({ criados, atualizados }, `Importação concluída: ${criados} novo(s) e ${atualizados} atualizado(s).`);
  });
}
