/**
 * Dados de DEMONSTRAÇÃO (spec seção 13): cadastros claramente fictícios para testar listas, busca,
 * importação e reajuste com volume. Uso: `npm run seed:demo` e, para remover tudo, `npm run seed:demo -- --limpar`.
 *
 * SÓ para desenvolvimento: recusa rodar com NODE_ENV=production ou sem ALLOW_DEMO_SEED=true, para nunca
 * misturar dados inventados com os reais. Tudo que cria é identificado ("[Demo]" no nome, "DEMO-" no
 * código) e a limpeza só apaga isso. Fase 2: projetos em todas as fases do funil (com histórico, perdas com motivo e
 * visitas na agenda). Financeiro das fases seguintes entra depois.
 */
import { config } from "dotenv";

import { criarClientePrisma } from "../src/lib/db/criar-cliente";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEMO_SEED !== "true") {
  console.error("seed:demo recusado: só roda em desenvolvimento, com ALLOW_DEMO_SEED=true e sem NODE_ENV=production.");
  process.exit(1);
}

const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

const NOMES = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gisele", "Hugo", "Irene", "João", "Karen", "Leandro", "Marta", "Nilton", "Olívia", "Paulo"];
const SOBRENOMES = ["Almeida", "Barbosa", "Cardoso", "Domingues", "Esteves", "Ferraz", "Gouveia", "Holanda", "Ibrahim", "Junqueira"];
const ORIGENS = ["GOOGLE", "INDICACAO_CLIENTE", "INSTAGRAM", "WHATSAPP", "SITE", "PLACA_NA_OBRA"] as const;

const FASES = ["NOVO_LEAD", "VISITA_AGENDADA", "ELABORANDO_PROPOSTA", "PROPOSTA_ENVIADA", "NEGOCIACAO", "PERDIDO"] as const;

async function limpar() {
  const clientes = await prisma.cliente.findMany({ where: { nome: { startsWith: "[Demo] " } }, select: { id: true } });
  const ids = clientes.map((c) => c.id);
  const projetos = (await prisma.projeto.findMany({ where: { clienteId: { in: ids } }, select: { id: true } })).map((p) => p.id);
  await prisma.medidaRascunho.deleteMany({ where: { projetoId: { in: projetos } } });
  await prisma.eventoAgenda.deleteMany({ where: { OR: [{ projetoId: { in: projetos } }, { clienteId: { in: ids } }] } });
  await prisma.tarefa.deleteMany({ where: { OR: [{ projetoId: { in: projetos } }, { clienteId: { in: ids } }] } });
  await prisma.interacao.deleteMany({ where: { OR: [{ projetoId: { in: projetos } }, { clienteId: { in: ids } }] } });
  await prisma.historicoFaseProjeto.deleteMany({ where: { projetoId: { in: projetos } } });
  await prisma.projeto.deleteMany({ where: { id: { in: projetos } } });
  // Devolve o contador de códigos ao maior que sobrou (a demonstração não deixa buracos na numeração real).
  await prisma.$executeRaw`UPDATE "ContadorSequencia" SET "valor" = coalesce((SELECT max(substring("codigo" from 8)::int) FROM "Projeto" WHERE "codigo" LIKE 'P-' || substring("chave" from 9) || '-%'), 0) WHERE "chave" LIKE 'projeto:%'`;
  await prisma.enderecoCliente.deleteMany({ where: { clienteId: { in: ids } } });
  await prisma.contatoCliente.deleteMany({ where: { clienteId: { in: ids } } });
  await prisma.cliente.updateMany({ where: { id: { in: ids } }, data: { indicadoPorId: null } });
  const c = await prisma.cliente.deleteMany({ where: { id: { in: ids } } });
  const produtos = await prisma.produto.findMany({ where: { codigo: { startsWith: "DEMO-" } }, select: { id: true } });
  await prisma.historicoPreco.deleteMany({ where: { produtoId: { in: produtos.map((p) => p.id) } } });
  const p = await prisma.produto.deleteMany({ where: { codigo: { startsWith: "DEMO-" } } });
  const f = await prisma.fornecedor.deleteMany({ where: { razaoSocial: { startsWith: "[Demo] " } } });
  console.log(`Demonstração removida: ${c.count} clientes, ${f.count} fornecedores, ${p.count} produtos.`);
}

async function criar() {
  if ((await prisma.cliente.count({ where: { nome: { startsWith: "[Demo] " } } })) > 0) {
    console.log("Já existem dados de demonstração. Use --limpar antes de criar de novo.");
    return;
  }
  const categorias = await prisma.categoriaProduto.findMany({ select: { id: true } });

  const fornecedores = await Promise.all(
    ["Alumínios Modelo", "Vidros Exemplo", "Ferragens Teste", "Acessórios Fictícios"].map((nome, i) =>
      prisma.fornecedor.create({
        data: { razaoSocial: `[Demo] ${nome}`, prazoEntregaDias: 3 + i * 4, condicoesPagamento: "28 dias (demonstração)", categorias: { connect: categorias[i] ? [{ id: categorias[i].id }] : [] } },
        select: { id: true },
      }),
    ),
  );

  for (let i = 0; i < 40; i++) {
    const nome = `[Demo] ${NOMES[i % NOMES.length]} ${SOBRENOMES[i % SOBRENOMES.length]} ${i + 1}`;
    await prisma.cliente.create({
      data: {
        nome,
        telefone: `+55229${String(80000000 + i * 137).padStart(8, "0")}`,
        email: `demo${i + 1}@exemplo.invalid`,
        origem: ORIGENS[i % ORIGENS.length],
        arquiteto: i % 8 === 0,
        construtora: i % 13 === 0,
        clienteFinal: i % 8 !== 0 && i % 13 !== 0,
        // Alguns "antigos", para a lista de clientes sem contato ter o que mostrar.
        criadoEm: i % 5 === 0 ? new Date(Date.now() - 400 * 86_400_000) : undefined,
      },
    });
  }

  for (let i = 1; i <= 60; i++) {
    const n = String(i).padStart(3, "0");
    const centavos = 1500 + ((i * 7919) % 90000);
    const produto = await prisma.produto.create({
      data: {
        codigo: `DEMO-${n}`,
        descricao: `Produto de demonstração ${n}`,
        unidade: i % 3 === 0 ? "BARRA" : "UN",
        categoriaId: categorias[i % Math.max(1, categorias.length)]?.id,
        fornecedorPrincipalId: fornecedores[i % fornecedores.length].id,
        custoUnitarioCentavos: i % 12 === 0 ? undefined : centavos,
        custoAtualizadoEm: i % 12 === 0 ? undefined : new Date(Date.now() - (i % 4 === 0 ? 120 : 10) * 86_400_000),
      },
    });
    if (i % 12 !== 0) {
      await prisma.historicoPreco.create({ data: { produtoId: produto.id, custoNovoCentavos: centavos, origem: "MANUAL", fornecedorId: fornecedores[i % fornecedores.length].id, observacao: "Demonstração" } });
    }
  }
  await criarProjetosDeDemonstracao();
  console.log("Demonstração criada: 40 clientes, 30 projetos com visitas, 4 fornecedores e 60 produtos (todos fictícios).");
}

async function criarProjetosDeDemonstracao() {
  const clientes = await prisma.cliente.findMany({ where: { nome: { startsWith: "[Demo] " } }, orderBy: { nome: "asc" }, take: 30, select: { id: true, origem: true } });
  const usuario = await prisma.usuario.findFirst({ where: { ativo: true, deletadoEm: null }, select: { id: true } });
  const motivo = await prisma.motivoPerda.findFirst({ where: { ativo: true }, select: { id: true } });
  const ano = new Date().getFullYear();

  for (const [i, cliente] of clientes.entries()) {
    const status = FASES[i % FASES.length];
    const dias = (i * 5) % 70;
    const criadoEm = new Date(Date.now() - (dias + 10) * 86_400_000);
    const movidoEm = new Date(Date.now() - dias * 86_400_000);
    await prisma.$transaction(async (tx) => {
      const [{ valor }] = await tx.$queryRaw<{ valor: number }[]>`INSERT INTO "ContadorSequencia" ("chave", "valor", "atualizadoEm") VALUES (${`projeto:${ano}`}, 1, now()) ON CONFLICT ("chave") DO UPDATE SET "valor" = "ContadorSequencia"."valor" + 1 RETURNING "valor"`;
      const projeto = await tx.projeto.create({
        data: {
          codigo: `P-${ano}-${String(valor).padStart(4, "0")}`,
          titulo: `[Demo] Esquadrias — obra ${i + 1}`,
          clienteId: cliente.id,
          responsavelId: usuario?.id,
          status,
          origem: cliente.origem,
          porte: (["PEQUENO", "MEDIO", "GRANDE"] as const)[i % 3],
          temperatura: (["FRIA", "MORNA", "QUENTE"] as const)[i % 3],
          valorEstimadoCentavos: 500_000 + i * 137_000,
          criadoEm,
          ultimaMovimentacaoEm: movidoEm,
          ...(status === "PERDIDO" && motivo ? { motivoPerdaId: motivo.id, perdidoEm: movidoEm } : {}),
        },
        select: { id: true },
      });
      const caminho = FASES.slice(0, FASES.indexOf(status) + 1);
      await tx.historicoFaseProjeto.createMany({ data: caminho.map((para, k) => ({ projetoId: projeto.id, de: k === 0 ? null : caminho[k - 1], para, criadoEm: new Date(criadoEm.getTime() + k * 2 * 86_400_000) })) });
      if (status !== "NOVO_LEAD") {
        const inicio = new Date(Date.now() + ((i % 9) - 3) * 86_400_000);
        inicio.setUTCHours(13 + (i % 4), 0, 0, 0);
        await tx.eventoAgenda.create({ data: { tipo: "VISITA_TECNICA", inicio, fim: new Date(inicio.getTime() + 3_600_000), projetoId: projeto.id, clienteId: cliente.id, responsavelId: usuario?.id, status: inicio < new Date() ? "REALIZADO" : "AGENDADO", realizadoEm: inicio < new Date() ? inicio : null, titulo: "[Demo] Visita técnica" } });
      }
    });
  }
}

(process.argv.includes("--limpar") ? limpar() : criar())
  .catch((erro: unknown) => {
    console.error(`Falha no seed de demonstração: ${erro instanceof Error ? erro.name : "Erro"}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
