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
  // Obras da demonstração (Fase 4): chamados, parcelas, etapas e pausas saem antes das obras.
  await prisma.chamado.deleteMany({ where: { clienteId: { in: ids } } });
  await prisma.$executeRaw`UPDATE "ContadorSequencia" SET "valor" = coalesce((SELECT max("numero") FROM "Chamado"), 0) WHERE "chave" = 'chamado'`;
  await prisma.contaReceber.deleteMany({ where: { projetoId: { in: projetos } } });
  await prisma.etapaProjeto.deleteMany({ where: { projetoId: { in: projetos } } });
  await prisma.pausaProjeto.deleteMany({ where: { projetoId: { in: projetos } } });
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
  const obras = await criarObrasDeDemonstracao();
  console.log(`Demonstração criada: 40 clientes, 30 projetos com visitas, ${obras} obras com etapas, 4 fornecedores e 60 produtos (todos fictícios).`);
}

/**
 * Obras de demonstração (Fase 4), uma por situação que o painel precisa mostrar. Os dias e prazos abaixo são
 * FICTÍCIOS (só para a demonstração) e nunca vão para a seed real; as etapas copiam o modelo padrão.
 * Cada etapa dura 4 dias corridos a partir da vizinha: a etapa atual tem a data de fim dada e as demais são
 * calculadas para trás (concluídas, no prazo) e para a frente (pendentes).
 */
const OBRAS_DE_DEMONSTRACAO = [
  { nome: "recém-aprovada", atual: 0, status: "PENDENTE", fimAtual: 5 },
  { nome: "no prazo", atual: 1, status: "EM_ANDAMENTO", fimAtual: 9 },
  { nome: "vence em breve", atual: 2, status: "EM_ANDAMENTO", fimAtual: 2 },
  { nome: "atrasada", atual: 2, status: "EM_ANDAMENTO", fimAtual: -6 },
  { nome: "bloqueada com pausa", atual: 4, status: "BLOQUEADA", fimAtual: 1 },
  { nome: "concluída no prazo", atual: 9, status: "CONCLUIDA", fimAtual: -12, atrasoDias: 0 },
  { nome: "concluída atrasada", atual: 9, status: "CONCLUIDA", fimAtual: -20, atrasoDias: 6 },
] as const;

async function criarObrasDeDemonstracao(): Promise<number> {
  const modelo = await prisma.modeloEtapas.findFirst({ where: { padrao: true, deletadoEm: null }, select: { itens: { where: { deletadoEm: null, ativo: true }, orderBy: { ordem: "asc" } } } });
  if (!modelo || modelo.itens.length === 0) {
    console.log("Sem modelo de etapas padrão: obras de demonstração não criadas (rode a seed antes).");
    return 0;
  }
  const itens = modelo.itens;
  const clientes = await prisma.cliente.findMany({ where: { nome: { startsWith: "[Demo] " } }, orderBy: { nome: "asc" }, skip: 30, take: OBRAS_DE_DEMONSTRACAO.length, select: { id: true, nome: true } });
  const usuario = await prisma.usuario.findFirst({ where: { ativo: true, deletadoEm: null }, select: { id: true } });
  const motivo = await prisma.motivoBloqueio.findFirst({ where: { ativo: true, justificado: true }, select: { id: true } });
  const ano = new Date().getFullYear();
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);
  const dia = (deslocamento: number) => new Date(hoje.getTime() + deslocamento * 86_400_000);

  for (const [i, cenario] of OBRAS_DE_DEMONSTRACAO.entries()) {
    const cliente = clientes[i];
    if (!cliente) break;
    const concluida = cenario.status === "CONCLUIDA";
    // Fim previsto da etapa k: a atual tem o dado; as outras andam 4 dias por etapa (a "atual" das concluídas é a última).
    const referencia = concluida ? itens.length - 1 : cenario.atual;
    const fimPrevisto = (k: number) => cenario.fimAtual + (k - referencia) * 4;
    const atraso = "atrasoDias" in cenario ? cenario.atrasoDias : 0;
    const ultimoFim = fimPrevisto(itens.length - 1);

    await prisma.$transaction(async (tx) => {
      const [{ valor }] = await tx.$queryRaw<{ valor: number }[]>`INSERT INTO "ContadorSequencia" ("chave", "valor", "atualizadoEm") VALUES (${`projeto:${ano}`}, 1, now()) ON CONFLICT ("chave") DO UPDATE SET "valor" = "ContadorSequencia"."valor" + 1 RETURNING "valor"`;
      const medicaoConcluida = concluida || cenario.atual > 0;
      const projeto = await tx.projeto.create({
        data: {
          codigo: `P-${ano}-${String(valor).padStart(4, "0")}`,
          titulo: `[Demo] Obra — ${cenario.nome}`,
          clienteId: cliente.id,
          responsavelId: usuario?.id,
          status: concluida ? "CONCLUIDO" : cenario.atual === 0 ? "APROVADO" : "EM_EXECUCAO",
          valorFechadoCentavos: 1_500_000 + i * 100_000,
          prazoModo: "TOTAL",
          // Prazo prometido = do início da medição ao fim previsto da última etapa (assim "no prazo" é de fato no prazo).
          prazoDias: Math.max(1, ultimoFim - fimPrevisto(0)),
          tipoDiasPrazo: "CORRIDOS",
          dataInicioPrazo: medicaoConcluida ? dia(fimPrevisto(0)) : null,
          prazoFinalPrometido: dia(ultimoFim),
          diasPausaJustificada: cenario.nome === "bloqueada com pausa" ? 3 : 0,
          dataConclusao: concluida ? dia(ultimoFim + atraso) : null,
          autorizaPortfolio: true,
        },
        select: { id: true },
      });

      const etapas: { id: string; liberaGatilho: string | null; concluida: boolean; fimReal: Date | null }[] = [];
      for (const [k, item] of itens.entries()) {
        const encerrada = k < cenario.atual || concluida;
        const status = encerrada ? "CONCLUIDA" : k === cenario.atual ? cenario.status : "PENDENTE";
        const fim = fimPrevisto(k);
        const fimReal = encerrada ? dia(fim + (concluida && k === itens.length - 1 ? atraso : 0)) : null;
        const criada = await tx.etapaProjeto.create({
          data: {
            projetoId: projeto.id,
            tipo: item.tipo,
            nome: item.nome,
            ordem: k + 1,
            grupoPrazo: item.grupoPrazo,
            peso: item.peso,
            liberaGatilho: item.liberaGatilho,
            marcoGarantia: item.marcoGarantia,
            status,
            inicioPrevisto: dia(fim - 3),
            fimPrevisto: dia(fim),
            provisoria: !medicaoConcluida,
            inicioReal: encerrada || status === "EM_ANDAMENTO" ? dia(fim - 3) : null,
            fimReal,
            motivoBloqueioId: status === "BLOQUEADA" ? motivo?.id : null,
            detalheBloqueio: status === "BLOQUEADA" ? "Demonstração: aguardando a alvenaria." : null,
            responsavelId: usuario?.id,
          },
          select: { id: true },
        });
        etapas.push({ id: criada.id, liberaGatilho: item.liberaGatilho, concluida: encerrada, fimReal });
      }

      // Parcelas 50/25/25: a do sinal está aberta; as por gatilho abrem quando a etapa que as libera termina.
      const total = 1_500_000 + i * 100_000;
      const parcelas = [
        { descricao: "Sinal", valorCentavos: Math.round(total / 2), gatilho: "CONFIRMACAO" as const },
        { descricao: "Entrega do material", valorCentavos: Math.round(total / 4), gatilho: "ENTREGA_MATERIAL" as const },
        { descricao: "Vidros e instalação", valorCentavos: total - Math.round(total / 2) - Math.round(total / 4), gatilho: "ENTREGA_E_INSTALACAO" as const },
      ];
      for (const [ordem, p] of parcelas.entries()) {
        const etapa = etapas.find((e) => e.liberaGatilho === p.gatilho);
        const aberta = p.gatilho === "CONFIRMACAO" || !!etapa?.concluida;
        await tx.contaReceber.create({
          data: { projetoId: projeto.id, clienteId: cliente.id, ordem: ordem + 1, ...p, status: aberta ? "ABERTA" : "AGUARDANDO_GATILHO", vencimento: aberta ? (etapa?.fimReal ?? dia(fimPrevisto(0))) : null, etapaProjetoId: aberta ? (etapa?.id ?? null) : null },
        });
      }

      if (cenario.nome === "bloqueada com pausa" && motivo) {
        await tx.pausaProjeto.create({ data: { projetoId: projeto.id, inicio: dia(-6), fim: dia(-4), motivoBloqueioId: motivo.id, justificada: true, observacao: "Demonstração: chuva forte." } });
      }

      // Assistência de demonstração nas obras concluídas: uma em garantia (regulagem) e uma fora (vidro, visita cobrada).
      if (concluida) {
        const [{ valor: numero }] = await tx.$queryRaw<{ valor: number }[]>`INSERT INTO "ContadorSequencia" ("chave", "valor", "atualizadoEm") VALUES ('chamado', 1, now()) ON CONFLICT ("chave") DO UPDATE SET "valor" = "ContadorSequencia"."valor" + 1, "atualizadoEm" = now() RETURNING "valor"`;
        const foraDaGarantia = atraso > 0;
        await tx.chamado.create({
          data: {
            numero: Number(numero),
            clienteId: cliente.id,
            projetoId: projeto.id,
            descricao: foraDaGarantia ? "Demonstração: vidro com infiltração no encontro." : "Demonstração: janela raspando no trilho.",
            tipoProblema: foraDaGarantia ? "VIDRO" : "REGULAGEM",
            classificacaoSugerida: foraDaGarantia ? "FORA_DA_GARANTIA" : "EM_GARANTIA",
            classificacao: foraDaGarantia ? "FORA_DA_GARANTIA" : "EM_GARANTIA",
            motivoClassificacao: foraDaGarantia ? "A garantia dos vidros vale só até a instalação (demonstração)." : "Dentro da garantia de regulagem (demonstração).",
            cobrarVisita: foraDaGarantia,
          },
        });
      }
    });
  }
  return Math.min(clientes.length, OBRAS_DE_DEMONSTRACAO.length);
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
