import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarClientePrisma } from "@/lib/db/criar-cliente";
import { lerParametrosLista } from "@/lib/listas/parametros";
import { registrarInteracao } from "@/modules/interacoes/registrar";
import { buscarDuplicados, CONFIG_LISTA_CLIENTES, listarClientes, lerFiltrosClientes } from "@/modules/clientes/queries";

import { comConexao } from "./banco-teste";

const PREFIXO = "Int Cli";
const prisma = criarClientePrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

async function limpar() {
  await comConexao(async (c) => {
    await c.query(`DELETE FROM "Interacao" WHERE "clienteId" IN (SELECT id FROM "Cliente" WHERE nome LIKE $1)`, [`${PREFIXO}%`]);
    await c.query(`DELETE FROM "Cliente" WHERE nome LIKE $1`, [`${PREFIXO}%`]);
  });
}

const lista = (brutos: Record<string, string>) => listarClientes(lerParametrosLista(brutos, CONFIG_LISTA_CLIENTES), lerFiltrosClientes(brutos));

let idJoao: string;
let idExcluido: string;

beforeAll(async () => {
  await limpar();
  const joao = await prisma.cliente.create({
    data: { nome: `${PREFIXO} João Conceição`, tipoPessoa: "PF", cpfCnpj: "52998224725", telefone: "+5522999583288", email: "joao.int@exemplo.com", arquiteto: true },
  });
  idJoao = joao.id;
  await prisma.cliente.create({
    data: { nome: `${PREFIXO} Construtora Ação Ltda`, nomeFantasia: "Ação Obras", tipoPessoa: "PJ", cpfCnpj: "11222333000181", whatsapp: "+5522988887777", construtora: true },
  });
  const excluido = await prisma.cliente.create({
    data: { nome: `${PREFIXO} Removido`, cpfCnpj: "39053344705", telefone: "+5522977776666", deletadoEm: new Date() },
  });
  idExcluido = excluido.id;
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("linha do tempo (registrarInteracao)", () => {
  it("grava a interação ligada ao cliente, com quem registrou", async () => {
    const id = await registrarInteracao(prisma, { tipo: "NOTA", texto: "  Pediu proposta para 4 janelas.  ", clienteId: idJoao });
    const gravada = await prisma.interacao.findUniqueOrThrow({ where: { id } });
    expect(gravada).toMatchObject({ tipo: "NOTA", texto: "Pediu proposta para 4 janelas.", clienteId: idJoao });
  });

  it("recusa texto vazio, texto gigante e interação sem cliente nem projeto", async () => {
    await expect(registrarInteracao(prisma, { tipo: "NOTA", texto: "   ", clienteId: idJoao })).rejects.toThrow(/texto/);
    await expect(registrarInteracao(prisma, { tipo: "NOTA", texto: "x".repeat(4001), clienteId: idJoao })).rejects.toThrow(/4\.000/);
    await expect(registrarInteracao(prisma, { tipo: "NOTA", texto: "solta" })).rejects.toThrow(/cliente ou de um projeto/);
  });

  it("o banco recusa interação de cliente inexistente (chave estrangeira)", async () => {
    await expect(registrarInteracao(prisma, { tipo: "SISTEMA", texto: "órfã", clienteId: "nao-existe" })).rejects.toThrow();
  });
});

describe("duplicidade de cliente", () => {
  it("acha pelo mesmo CPF, mesmo escrito com máscara", async () => {
    const r = await buscarDuplicados({ cpfCnpj: "529.982.247-25" });
    expect(r.map((d) => d.id)).toContain(idJoao);
    expect(r.find((d) => d.id === idJoao)?.motivo).toBe("mesmo CPF/CNPJ");
  });

  it("acha pelo mesmo telefone, inclusive quando está no campo de WhatsApp do outro cadastro", async () => {
    const porTelefone = await buscarDuplicados({ telefone: "(22) 99958-3288" });
    expect(porTelefone.map((d) => d.id)).toContain(idJoao);
    const cruzado = await buscarDuplicados({ telefone: "22 98888-7777" });
    expect(cruzado.some((d) => d.motivo === "mesmo telefone")).toBe(true);
  });

  it("não considera cliente na lixeira nem o próprio cadastro", async () => {
    const r = await buscarDuplicados({ cpfCnpj: "390.533.447-05", telefone: "22977776666" });
    expect(r.map((d) => d.id)).not.toContain(idExcluido);
    const semOProprio = await buscarDuplicados({ cpfCnpj: "52998224725" }, idJoao);
    expect(semOProprio.map((d) => d.id)).not.toContain(idJoao);
  });

  it("na edição só avisa do que mudou: repetição que já existia não pede confirmação de novo", async () => {
    const gemeo = await prisma.cliente.create({ data: { nome: `${PREFIXO} Gêmeo`, cpfCnpj: "52998224725", telefone: "+5522955554444" } });
    // Mesmo CPF do João, sem mudar nada: sem aviso.
    expect(await buscarDuplicados({ cpfCnpj: "52998224725", telefone: "22955554444" }, gemeo.id)).toEqual([]);
    // Trocou o telefone para o de outro cliente: avisa só do telefone novo.
    const r = await buscarDuplicados({ cpfCnpj: "52998224725", telefone: "22999583288" }, gemeo.id);
    expect(r.map((d) => d.motivo)).toEqual(["mesmo telefone"]);
    await prisma.cliente.delete({ where: { id: gemeo.id } }); // não atrapalha as contagens dos testes seguintes
  });

  it("dados vazios ou inválidos não geram falsos avisos", async () => {
    expect(await buscarDuplicados({})).toEqual([]);
    expect(await buscarDuplicados({ cpfCnpj: "123", telefone: "99" })).toEqual([]);
  });
});

describe("lista de clientes com busca", () => {
  it("a busca ignora acentos e maiúsculas: 'joao conceicao' acha 'João Conceição'", async () => {
    for (const termo of ["joao conceicao", "JOÃO CONCEIÇÃO", "joão", "conceicao"]) {
      const { linhas } = await lista({ busca: termo });
      expect(linhas.map((c) => c.id), termo).toContain(idJoao);
    }
  });

  it("acha pelo nome fantasia, por pedaço do CPF/CNPJ, do telefone e do e-mail", async () => {
    expect((await lista({ busca: "acao obras" })).linhas.some((c) => c.nome.includes("Construtora"))).toBe(true);
    expect((await lista({ busca: "11.222.333" })).linhas.some((c) => c.nome.includes("Construtora"))).toBe(true);
    expect((await lista({ busca: "99958" })).linhas.map((c) => c.id)).toContain(idJoao);
    expect((await lista({ busca: "joao.int@" })).linhas.map((c) => c.id)).toContain(idJoao);
  });

  it("curingas do LIKE digitados valem como texto, não como padrão", async () => {
    expect((await lista({ busca: `${PREFIXO} %%` })).linhas).toHaveLength(0);
    expect((await lista({ busca: "_____________" })).linhas.filter((c) => c.nome.startsWith(PREFIXO))).toHaveLength(0);
  });

  it("não lista cliente na lixeira", async () => {
    const { linhas } = await lista({ busca: `${PREFIXO} Removido` });
    expect(linhas).toHaveLength(0);
  });

  it("filtra por marcação e por tipo de pessoa, e a visão de parceiros traz só arquitetos e construtoras", async () => {
    const arquitetos = await lista({ busca: PREFIXO, marcacao: "arquiteto" });
    expect(arquitetos.linhas.map((c) => c.id)).toEqual([idJoao]);
    const juridicas = await lista({ busca: PREFIXO, tipo: "PJ" });
    expect(juridicas.linhas.every((c) => c.tipoPessoa === "PJ")).toBe(true);

    const parametros = lerParametrosLista({ busca: PREFIXO }, CONFIG_LISTA_CLIENTES);
    const parceiros = await listarClientes(parametros, lerFiltrosClientes({}), { soParceiros: true });
    expect(parceiros.linhas).toHaveLength(2);
  });

  it("pagina no servidor e ordena", async () => {
    const pagina1 = await lista({ busca: PREFIXO, tamanho: "25", ordem: "nome", direcao: "desc" });
    const nomes = pagina1.linhas.map((c) => c.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => b.localeCompare(a, "pt-BR")));
    expect(pagina1.paginacao.total).toBe(2);
  });
});
