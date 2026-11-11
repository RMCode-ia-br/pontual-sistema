/**
 * Dados de DEMONSTRAÇÃO (spec seção 13): cadastros claramente fictícios para testar listas, busca,
 * importação e reajuste com volume. Uso: `npm run seed:demo` e, para remover tudo, `npm run seed:demo -- --limpar`.
 *
 * SÓ para desenvolvimento: recusa rodar com NODE_ENV=production ou sem ALLOW_DEMO_SEED=true, para nunca
 * misturar dados inventados com os reais. Tudo que cria é identificado ("[Demo]" no nome, "DEMO-" no
 * código) e a limpeza só apaga isso. Clientes, projetos e financeiro das fases seguintes entram depois.
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

async function limpar() {
  const clientes = await prisma.cliente.findMany({ where: { nome: { startsWith: "[Demo] " } }, select: { id: true } });
  const ids = clientes.map((c) => c.id);
  await prisma.interacao.deleteMany({ where: { clienteId: { in: ids } } });
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
  console.log("Demonstração criada: 40 clientes, 4 fornecedores e 60 produtos (todos fictícios).");
}

(process.argv.includes("--limpar") ? limpar() : criar())
  .catch((erro: unknown) => {
    console.error(`Falha no seed de demonstração: ${erro instanceof Error ? erro.name : "Erro"}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
