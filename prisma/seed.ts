/**
 * Seed base (idempotente e seguro para produção). Uso: `npm run seed`.
 *
 * - Nunca sobrescreve edições do usuário (upsert com `update: {}`).
 * - Só cria o usuário `admin` se ainda não existir nenhum usuário, e nunca redefine senha.
 * - Não cria clientes fictícios nem valores de negócio (alíquota e margens ficam vazias).
 */
import { config } from "dotenv";

import { gerarHashSenha } from "../src/lib/auth/senha";
import { criarClientePrisma } from "../src/lib/db/criar-cliente";

import {
  ACABAMENTOS,
  CATEGORIAS_FINANCEIRAS,
  CATEGORIAS_PRODUTO,
  ESPESSURAS_VIDRO_MM,
  feriadosNacionais,
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

async function criarAdminInicial(): Promise<string> {
  const total = await prisma.usuario.count();
  if (total > 0) return "admin: já existem usuários, nada a fazer";

  await prisma.usuario.create({
    data: {
      nome: "Administrador",
      login: "admin",
      senhaHash: await gerarHashSenha("admin"),
      precisaTrocarSenha: true,
    },
  });
  return "admin: criado (senha inicial deve ser trocada no primeiro acesso)";
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
      telefone: "(22) 99958-3288",
      whatsapp: "(22) 99958-3288",
      emailContato: "vidracariapontual@gmail.com",
      emailPropostas: "vidracariapontual@gmail.com",
      siteUrl: "https://pontualmacae.com.br",
      instagramUrl: "https://www.instagram.com/pontualmacae",
      googlePerfilUrl: "https://share.google/TTMYvE7Tm6mf23uoM",
      corPrimaria: "#1d4ed8",
      consultorNome: "Marcelo Pinheiro",
      consultorCargo: "Gerente Comercial",
      // aliquotaImpostoPercentual, margemPadraoPercentual e margemMinimaAlertaPercentual: VAZIOS.
    },
  });
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

async function main() {
  const etapas = [criarAdminInicial, configuracaoEmpresa, catalogos, feriados, modelosTexto];
  for (const etapa of etapas) {
    console.log(await etapa());
  }
}

main()
  .catch((erro: unknown) => {
    // Nunca imprime a connection string; só o tipo do erro.
    const tipo = erro instanceof Error ? erro.name : "Erro";
    const codigo = (erro as { code?: string }).code;
    console.error(`Falha no seed: ${tipo}${codigo ? ` (${codigo})` : ""}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
