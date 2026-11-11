import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { lerCsv } from "@/lib/csv/ler";
import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { registrarInteracao } from "@/modules/interacoes/registrar";
import { sugerirMapeamento } from "@/lib/dominio/mapeamento";
import { analisarImportacao, type ModoDuplicadas, type PedidoDeImportacao } from "@/modules/importacao/analisar";
import { aplicarImportacao, reverterLote } from "@/modules/importacao/aplicar";
import { CAMPOS_POR_TIPO, type TipoDeImportacao } from "@/modules/importacao/campos";

import { csvDaPlanilhaDeExemplo } from "../fixtures/planilha-de-produtos";
import { comConexao } from "./banco-teste";

const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const PREFIXO = "INT-IMP-";
const USUARIO = { id: "int-importador-id", nome: "Importador de Integração" };

async function limpar() {
  await comConexao(async (c) => {
    const lotes = `SELECT id FROM "LoteImportacao" WHERE "criadoPorId" = '${USUARIO.id}'`;
    await c.query(`DELETE FROM "HistoricoPreco" WHERE "produtoId" IN (SELECT id FROM "Produto" WHERE codigo LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "HistoricoPreco" WHERE "loteImportacaoId" IN (${lotes})`);
    await c.query(`DELETE FROM "Produto" WHERE codigo LIKE $1 OR "loteImportacaoId" IN (${lotes})`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Interacao" WHERE "clienteId" IN (SELECT id FROM "Cliente" WHERE "loteImportacaoId" IN (${lotes}))`);
    await c.query(`DELETE FROM "Cliente" WHERE "loteImportacaoId" IN (${lotes})`);
    await c.query(`DELETE FROM "Fornecedor" WHERE "loteImportacaoId" IN (${lotes})`);
    await c.query(`DELETE FROM "LoteImportacaoItem" WHERE "loteId" IN (${lotes})`);
    await c.query(`DELETE FROM "LoteImportacao" WHERE "criadoPorId" = $1`, [USUARIO.id]);
    await c.query(`DELETE FROM "LogAuditoria" WHERE "usuarioId" = $1`, [USUARIO.id]);
  });
}

beforeAll(limpar);
afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

function pedidoDeCsv(tipo: TipoDeImportacao, csv: string, modo: ModoDuplicadas = "IGNORAR"): PedidoDeImportacao {
  const planilha = lerCsv(csv);
  return { tipo, nomeArquivo: "teste.csv", mapeamento: sugerirMapeamento(planilha.cabecalho, CAMPOS_POR_TIPO[tipo]), linhas: planilha.linhas, modo };
}

const contarProdutos = () => prisma.produto.count({ where: { codigo: { startsWith: PREFIXO }, deletadoEm: null } });

describe("importar 300 produtos de exemplo (critério de aceite da Fase 1)", () => {
  const csv = csvDaPlanilhaDeExemplo({ prefixo: PREFIXO, comProblemas: true });
  let loteId = "";

  it("a análise valida a planilha toda: 300 boas, 4 com erro e 1 repetida no arquivo", async () => {
    const analise = await analisarImportacao(pedidoDeCsv("PRODUTOS", csv));
    expect(analise.totais).toEqual({ total: 305, novas: 300, atualizacoes: 0, duplicadas: 1, erros: 4 });
    const repetida = analise.linhas.find((l) => l.status === "DUPLICADA");
    expect(repetida?.detalhe[0]).toMatch(/Repetida no arquivo/);
    const erros = analise.linhas.filter((l) => l.status === "ERRO");
    expect(erros.map((l) => l.detalhe.join(" ")).join(" | ")).toMatch(/Custo unitário[\s\S]*Unidade "CAIXA"[\s\S]*código[\s\S]*Categoria "Categoria que não existe"/i);
    // A análise não grava nada.
    expect(await contarProdutos()).toBe(0);
  });

  it("com erros, só importa se a pessoa escolher importar as válidas", async () => {
    await expect(aplicarImportacao({ usuario: USUARIO, pedido: pedidoDeCsv("PRODUTOS", csv), importarValidas: false })).rejects.toThrow(/linhas com erro/);
    expect(await contarProdutos()).toBe(0);
  });

  it("grava os 300 produtos com custo em centavos, histórico de importação e lote", async () => {
    const r = await aplicarImportacao({ usuario: USUARIO, pedido: pedidoDeCsv("PRODUTOS", csv), importarValidas: true });
    loteId = r.loteId;
    expect(r).toMatchObject({ criados: 300, atualizados: 0, ignorados: 5 });
    expect(await contarProdutos()).toBe(300);

    const p = await prisma.produto.findFirstOrThrow({ where: { codigo: `${PREFIXO}0001` }, include: { fornecedorPrincipal: true, categoria: true } });
    expect(p.descricao).toBe("Item de exemplo 0001");
    expect(Number.isInteger(p.custoUnitarioCentavos)).toBe(true);
    expect(p.loteImportacaoId).toBe(loteId);
    expect(p.fornecedorPrincipal?.razaoSocial).toBeTruthy();

    // 300 produtos, 12 sem custo (1 a cada 25): só os 288 com custo geram histórico.
    expect(await prisma.historicoPreco.count({ where: { loteImportacaoId: loteId, origem: "IMPORTACAO" } })).toBe(288);
    expect(await prisma.produto.count({ where: { codigo: { startsWith: PREFIXO }, custoUnitarioCentavos: null } })).toBe(12);

    const lote = await prisma.loteImportacao.findUniqueOrThrow({ where: { id: loteId } });
    expect(lote).toMatchObject({ tipo: "PRODUTOS", status: "APLICADO", criados: 300, ignorados: 5, totalLinhas: 305 });
    expect(await prisma.loteImportacaoItem.count({ where: { loteId, acao: "CRIADO" } })).toBe(300);
    expect(await prisma.logAuditoria.count({ where: { entidade: "LoteImportacao", entidadeId: loteId, acao: "IMPORTAR" } })).toBe(1);
  });

  it("importar o mesmo arquivo de novo não duplica nada: tudo vira 'repetido'", async () => {
    const analise = await analisarImportacao(pedidoDeCsv("PRODUTOS", csv));
    expect(analise.totais.novas).toBe(0);
    expect(analise.totais.duplicadas).toBe(301);
    await expect(aplicarImportacao({ usuario: USUARIO, pedido: pedidoDeCsv("PRODUTOS", csv), importarValidas: true })).rejects.toThrow(/Nenhuma linha válida/);
    expect(await contarProdutos()).toBe(300);
  });

  it("modo atualizar: muda só o que veio preenchido, grava histórico e nunca apaga célula vazia", async () => {
    const cabecalho = "Código;Descrição;Custo unitário (R$);Localização";
    const atualizacao = `${cabecalho}\r\n${PREFIXO}0001;Item de exemplo 0001;777,00;\r\n${PREFIXO}0002;Item de exemplo 0002;;Prateleira Z9\r\n`;
    const antes2 = await prisma.produto.findFirstOrThrow({ where: { codigo: `${PREFIXO}0002` } });

    const analise = await analisarImportacao(pedidoDeCsv("PRODUTOS", atualizacao, "ATUALIZAR"));
    expect(analise.totais).toMatchObject({ novas: 0, atualizacoes: 2, erros: 0 });

    const r = await aplicarImportacao({ usuario: USUARIO, pedido: pedidoDeCsv("PRODUTOS", atualizacao, "ATUALIZAR"), importarValidas: false });
    expect(r).toMatchObject({ criados: 0, atualizados: 2 });

    const p1 = await prisma.produto.findFirstOrThrow({ where: { codigo: `${PREFIXO}0001` } });
    expect(p1.custoUnitarioCentavos).toBe(77700);
    const p2 = await prisma.produto.findFirstOrThrow({ where: { codigo: `${PREFIXO}0002` } });
    expect(p2.localizacao).toBe("Prateleira Z9");
    // Célula de custo vazia NÃO apagou o custo que o produto já tinha.
    expect(p2.custoUnitarioCentavos).toBe(antes2.custoUnitarioCentavos);

    const hist = await prisma.historicoPreco.findMany({ where: { produtoId: p1.id, loteImportacaoId: r.loteId } });
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ custoNovoCentavos: 77700, origem: "IMPORTACAO" });
    expect(hist[0].custoAnteriorCentavos).not.toBeNull();

    // Desfazer a atualização devolve o custo anterior e a localização vazia.
    const desfeito = await reverterLote({ usuario: USUARIO, loteId: r.loteId });
    expect(desfeito).toMatchObject({ restaurados: 2, naoRestaurados: 0, removidos: 0 });
    const volta = await prisma.produto.findFirstOrThrow({ where: { codigo: `${PREFIXO}0001` } });
    expect(volta.custoUnitarioCentavos).not.toBe(77700);
    expect((await prisma.produto.findFirstOrThrow({ where: { codigo: `${PREFIXO}0002` } })).localizacao).toBe(antes2.localizacao);
  });

  it("desfazer não passa por cima do que outra pessoa alterou depois", async () => {
    const atualizacao = `Código;Descrição;Custo unitário (R$)\r\n${PREFIXO}0003;Item de exemplo 0003;555,00\r\n`;
    const r = await aplicarImportacao({ usuario: USUARIO, pedido: pedidoDeCsv("PRODUTOS", atualizacao, "ATUALIZAR"), importarValidas: false });
    await prisma.produto.updateMany({ where: { codigo: `${PREFIXO}0003` }, data: { custoUnitarioCentavos: 66600 } }); // outra pessoa mexeu
    const desfeito = await reverterLote({ usuario: USUARIO, loteId: r.loteId });
    expect(desfeito).toMatchObject({ restaurados: 0, naoRestaurados: 1 });
    expect((await prisma.produto.findFirstOrThrow({ where: { codigo: `${PREFIXO}0003` } })).custoUnitarioCentavos).toBe(66600);
  });

  it("desfazer o lote principal manda para a lixeira o que ficou como estava; o que foi atualizado depois fica e é contado", async () => {
    const r = await reverterLote({ usuario: USUARIO, loteId });
    // Os produtos 0001, 0002 e 0003 foram atualizados por outros lotes depois: não saem.
    expect(r).toMatchObject({ removidos: 297, naoRemovidos: 3, restaurados: 0 });
    expect(await contarProdutos()).toBe(3);
    // Nada foi apagado de verdade: o histórico de preço continua lá.
    expect(await prisma.produto.count({ where: { codigo: { startsWith: PREFIXO } } })).toBe(300);
    expect((await prisma.loteImportacao.findUniqueOrThrow({ where: { id: loteId } })).status).toBe("REVERTIDO");
    await expect(reverterLote({ usuario: USUARIO, loteId })).rejects.toThrow(/já foi desfeita/);
  });

  it("depois de desfeita, a mesma planilha pode ser importada de novo (os códigos ficaram livres)", async () => {
    const analise = await analisarImportacao(pedidoDeCsv("PRODUTOS", csv));
    expect(analise.totais.novas).toBe(297); // os 3 que ficaram continuam cadastrados (repetidos)
  });
});

describe("importar clientes e fornecedores", () => {
  it("clientes: valida, ignora quem já existe pelo CPF ou telefone e registra a linha do tempo", async () => {
    await prisma.cliente.create({ data: { nome: "Int Imp Já existe", cpfCnpj: "52998224725", loteImportacaoId: null } });
    const csv = [
      "Nome;CPF/CNPJ;Telefone;E-mail;Origem;É arquiteto/designer",
      "Int Imp Ana;390.533.447-05;(22) 98888-1111;ana@exemplo.com;Instagram;Não",
      "Int Imp Repetido por CPF;529.982.247-25;;;;",
      "Int Imp Arq;;(22) 97777-2222;;Indicação de cliente;Sim",
      "Int Imp Telefone repetido no arquivo;;(22) 97777-2222;;;",
      "Int Imp CPF inválido;111.111.111-11;;;;",
    ].join("\r\n");
    const analise = await analisarImportacao(pedidoDeCsv("CLIENTES", csv));
    expect(analise.totais).toMatchObject({ total: 5, novas: 2, duplicadas: 2, erros: 1 });

    const r = await aplicarImportacao({ usuario: USUARIO, pedido: pedidoDeCsv("CLIENTES", csv), importarValidas: true });
    expect(r).toMatchObject({ criados: 2, ignorados: 3 });
    const arq = await prisma.cliente.findFirstOrThrow({ where: { nome: "Int Imp Arq" }, include: { interacoes: true } });
    expect(arq).toMatchObject({ arquiteto: true, clienteFinal: false, origem: "INDICACAO_CLIENTE", telefone: "+5522977772222", loteImportacaoId: r.loteId });
    expect(arq.interacoes[0]?.texto).toMatch(/importação/);

    // Alguém anota uma ligação no cliente importado: desfazer a importação não pode mandá-lo para a lixeira.
    await registrarInteracao(prisma, { tipo: "LIGACAO", texto: "Liguei e pediu proposta.", clienteId: arq.id });
    const desfeito = await reverterLote({ usuario: USUARIO, loteId: r.loteId });
    expect(desfeito).toMatchObject({ removidos: 1, naoRemovidos: 1 });
    expect((await prisma.cliente.findUniqueOrThrow({ where: { id: arq.id } })).deletadoEm).toBeNull();
    expect(await prisma.cliente.count({ where: { nome: { startsWith: "Int Imp " }, deletadoEm: null } })).toBe(2); // o que já existia + o que ganhou anotação
    await comConexao((c) => c.query(`DELETE FROM "Cliente" WHERE nome = 'Int Imp Já existe'`));
  });

  it("fornecedores: liga as categorias e ignora CNPJ já cadastrado", async () => {
    const csv = [
      "Razão social;CNPJ;O que fornece;Prazo de entrega (dias)",
      "Int Imp Forn A;11.222.333/0001-81;Perfis, Vidros;7",
      "Int Imp Forn B;;Ferragens e acessórios;",
      "Int Imp Forn C;11.222.333/0001-81;;",
    ].join("\r\n");
    const analise = await analisarImportacao(pedidoDeCsv("FORNECEDORES", csv));
    expect(analise.totais).toMatchObject({ novas: 2, duplicadas: 1, erros: 0 });
    const r = await aplicarImportacao({ usuario: USUARIO, pedido: pedidoDeCsv("FORNECEDORES", csv), importarValidas: false });
    expect(r.criados).toBe(2);
    const a = await prisma.fornecedor.findFirstOrThrow({ where: { razaoSocial: "Int Imp Forn A" }, include: { categorias: true } });
    expect(a.categorias.map((c) => c.nome).sort()).toEqual(["Perfis", "Vidros"]);
    expect(a.prazoEntregaDias).toBe(7);
    await reverterLote({ usuario: USUARIO, loteId: r.loteId });
    expect(await prisma.fornecedor.count({ where: { razaoSocial: { startsWith: "Int Imp Forn" }, deletadoEm: null } })).toBe(0);
  });
});
