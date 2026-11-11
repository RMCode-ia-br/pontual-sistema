/**
 * Seed base (idempotente e seguro para produção). Uso: `npm run seed`.
 *
 * - Nunca sobrescreve edições do usuário (upsert com `update: {}`).
 * - Só cria o usuário `admin` se ainda não existir nenhum usuário, e nunca redefine senha.
 * - Não cria clientes fictícios nem valores de negócio (alíquota e margens ficam vazias).
 */
import { config } from "dotenv";

import { gerarHashSenha, validarPoliticaSenha } from "../src/lib/auth/senha";
import { criarClientePrisma } from "../src/lib/db/criar-cliente";

import { semearPropostas } from "./seed-propostas";
import {
  ACABAMENTOS,
  CATEGORIAS_FINANCEIRAS,
  CATEGORIAS_PRODUTO,
  ESPESSURAS_VIDRO_MM,
  feriadosNacionais,
  FORNECEDORES,
  LINHAS,
  MODELOS_TEXTO,
  MOTIVOS_BLOQUEIO,
  MOTIVOS_PERDA,
  TIPOS_VIDRO,
} from "./seed-dados";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

// O seed usa a conexão direta (Session pooler): é um processo curto e sequencial.
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

/** Erro de configuração do seed com mensagem segura para mostrar (nunca contém segredos). */
class ErroDeSeed extends Error {}

async function criarAdminInicial(): Promise<string> {
  const total = await prisma.usuario.count();
  if (total > 0) return "admin: já existem usuários, nada a fazer";

  // A senha inicial "admin" (padrão da especificação) é PÚBLICA: serve só para desenvolvimento local.
  // Em ambiente hospedado, defina ADMIN_SENHA_INICIAL; o admin ainda assim precisa trocá-la no 1º acesso.
  const informada = process.env.ADMIN_SENHA_INICIAL;
  if (process.env.NODE_ENV === "production" && !informada) {
    throw new ErroDeSeed(
      "NODE_ENV=production sem ADMIN_SENHA_INICIAL: recusando criar o admin com a senha padrão pública. Defina ADMIN_SENHA_INICIAL.",
    );
  }
  if (informada) {
    const politica = validarPoliticaSenha(informada);
    if (!politica.valida) throw new ErroDeSeed(`ADMIN_SENHA_INICIAL inválida: ${politica.motivo}`);
  }

  await prisma.usuario.create({
    data: {
      nome: "Administrador",
      login: "admin",
      senhaHash: await gerarHashSenha(informada || "admin"),
      precisaTrocarSenha: true,
    },
  });
  return informada
    ? "admin: criado com a senha de ADMIN_SENHA_INICIAL (troca obrigatória no primeiro acesso)"
    : "admin: criado com a senha padrão PÚBLICA 'admin' (só para desenvolvimento; troca obrigatória no primeiro acesso)";
}

async function configuracaoEmpresa(): Promise<string> {
  // `update: {}` preserva tudo o que o gestor já editou em Configurações.
  await prisma.configuracaoEmpresa.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      razaoSocial: "Marcelo Pinheiro Nogueira",
      nomeFantasia: "Pontual Soluções em Esquadrias e Vidros",
      cnpj: "37.323.333/0001-61",
      // Número omitido de propósito: propostas trazem 185 e o site 195 (ver docs/PENDENCIAS.md).
      endereco: "Rua Eleosina Pereira de Queiroz Matoso, Sol y Mar",
      cidade: "Macaé",
      uf: "RJ",
      cep: "27940-050",
      telefone: "+5522999583288", // E.164, o mesmo formato gravado pelo formulário
      whatsapp: "+5522999583288",
      emailContato: "vidracariapontual@gmail.com",
      emailPropostas: "vidracariapontual@gmail.com",
      siteUrl: "https://pontualmacae.com.br",
      instagramUrl: "https://www.instagram.com/pontualmacae",
      googlePerfilUrl: "https://share.google/TTMYvE7Tm6mf23uoM",
      corPrimaria: "#1d4ed8",
      consultorNome: "Marcelo Pinheiro",
      consultorCargo: "Gerente Comercial",
      // Regra do dono (2026-11-13): a numeração das propostas começa em 2000 (o último real é próximo de 1200).
      proximoNumeroProposta: 2000,
      // aliquotaImpostoPercentual, margemPadraoPercentual e margemMinimaAlertaPercentual: VAZIOS.
    },
  });
  // Banco que já existia sem número configurado: aplica o início combinado (nunca altera um valor já definido).
  await prisma.configuracaoEmpresa.updateMany({ where: { id: "singleton", proximoNumeroProposta: null }, data: { proximoNumeroProposta: 2000 } });
  return "configuração da empresa: ok";
}

async function catalogos(): Promise<string> {
  // createMany + skipDuplicates = INSERT ... ON CONFLICT DO NOTHING: não sobrescreve edições do usuário
  // e usa uma ida ao banco por tabela (o banco está em us-east-1; upserts sequenciais ficam lentos).
  const comOrdem = <T>(itens: T[]) => itens.map((item, ordem) => ({ item, ordem }));

  await prisma.linhaAluminio.createMany({
    data: comOrdem(LINHAS).map(({ item: nome, ordem }) => ({ nome, ordem })),
    skipDuplicates: true,
  });
  await prisma.acabamentoAluminio.createMany({
    data: comOrdem(ACABAMENTOS).map(({ item: nome, ordem }) => ({ nome, ordem })),
    skipDuplicates: true,
  });
  await prisma.tipoVidro.createMany({
    data: comOrdem(TIPOS_VIDRO).map(({ item: nome, ordem }) => ({ nome, ordem })),
    skipDuplicates: true,
  });
  await prisma.espessuraVidro.createMany({
    data: comOrdem(ESPESSURAS_VIDRO_MM).map(({ item: mm, ordem }) => ({ mm, ordem })),
    skipDuplicates: true,
  });
  await prisma.categoriaProduto.createMany({
    data: comOrdem(CATEGORIAS_PRODUTO).map(({ item: nome, ordem }) => ({ nome, ordem })),
    skipDuplicates: true,
  });
  await prisma.motivoPerda.createMany({
    data: comOrdem(MOTIVOS_PERDA).map(({ item: nome, ordem }) => ({ nome, ordem })),
    skipDuplicates: true,
  });
  await prisma.motivoBloqueio.createMany({
    data: comOrdem(MOTIVOS_BLOQUEIO).map(({ item, ordem }) => ({ ...item, ordem })),
    skipDuplicates: true,
  });
  await prisma.categoriaFinanceira.createMany({
    data: comOrdem(CATEGORIAS_FINANCEIRAS).map(({ item, ordem }) => ({ ...item, ordem })),
    skipDuplicates: true,
  });
  return "catálogos: ok";
}

async function feriados(): Promise<string> {
  const anoAtual = new Date().getUTCFullYear();
  const lista = feriadosNacionais(anoAtual, anoAtual + 4);
  await prisma.feriado.createMany({ data: lista, skipDuplicates: true });
  return `feriados nacionais: ${lista.length} (${anoAtual} a ${anoAtual + 4})`;
}

async function modelosTexto(): Promise<string> {
  await prisma.modeloTexto.createMany({
    data: MODELOS_TEXTO.map((m, ordem) => ({ ...m, ordem })),
    skipDuplicates: true,
  });
  return `modelos de texto: ${MODELOS_TEXTO.length}`;
}

async function fornecedores(): Promise<string> {
  // Fornecedor não tem nome único no banco; a idempotência é aqui: quem já existe (inclusive na
  // lixeira, para não ressuscitar o que alguém removeu) não é recriado nem alterado.
  const existentes = await prisma.fornecedor.findMany({
    where: { razaoSocial: { in: FORNECEDORES.map((f) => f.razaoSocial) } },
    select: { razaoSocial: true },
  });
  const jaTem = new Set(existentes.map((f) => f.razaoSocial));
  const categorias = await prisma.categoriaProduto.findMany({ select: { id: true, nome: true } });
  const idDaCategoria = new Map(categorias.map((c) => [c.nome, c.id]));

  let criados = 0;
  for (const f of FORNECEDORES) {
    if (jaTem.has(f.razaoSocial)) continue;
    await prisma.fornecedor.create({
      data: {
        razaoSocial: f.razaoSocial,
        categorias: { connect: f.categorias.flatMap((nome) => (idDaCategoria.has(nome) ? [{ id: idDaCategoria.get(nome)! }] : [])) },
      },
    });
    criados++;
  }
  return `fornecedores: ${criados} criado(s), ${FORNECEDORES.length - criados} já existiam`;
}

async function main() {
  const etapas = [criarAdminInicial, configuracaoEmpresa, catalogos, feriados, modelosTexto, fornecedores, () => semearPropostas(prisma)];
  for (const etapa of etapas) {
    console.log(await etapa());
  }
}

main()
  .catch((erro: unknown) => {
    if (erro instanceof ErroDeSeed) {
      console.error(`Falha no seed: ${erro.message}`);
      process.exitCode = 1;
      return;
    }
    // Nunca imprime a connection string; só o tipo do erro.
    const tipo = erro instanceof Error ? erro.name : "Erro";
    const codigo = (erro as { code?: string }).code;
    console.error(`Falha no seed: ${tipo}${codigo ? ` (${codigo})` : ""}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
