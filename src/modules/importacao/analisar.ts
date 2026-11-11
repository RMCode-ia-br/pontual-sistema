import "server-only";

import { prisma } from "@/lib/db";
import { chavesDeDuplicidade, duplicadasNoArquivo } from "@/lib/dominio/duplicidade";
import { sugerirMapeamento } from "@/lib/dominio/mapeamento";

import { CAMPOS_POR_TIPO, type TipoDeImportacao } from "./campos";
import {
  chaveDeNome,
  validarCliente,
  validarFornecedor,
  validarProduto,
  type ClienteImportado,
  type ContextoDeImportacao,
  type FornecedorImportado,
  type ProdutoImportado,
  type Valores,
} from "./linhas";

export type ModoDuplicadas = "IGNORAR" | "ATUALIZAR";

/** Pedido de análise: a planilha já lida pelo navegador, e como as colunas casam com os campos. */
export type PedidoDeImportacao = {
  tipo: TipoDeImportacao;
  nomeArquivo: string;
  /** campo → índice da coluna (null = campo não vem na planilha) */
  mapeamento: Record<string, number | null>;
  linhas: string[][];
  modo: ModoDuplicadas;
};

export type StatusDaLinha = "NOVA" | "ATUALIZARA" | "DUPLICADA" | "ERRO";

type DadosPorTipo = { CLIENTES: ClienteImportado; FORNECEDORES: FornecedorImportado; PRODUTOS: ProdutoImportado };

export type LinhaAnalisada = {
  /** Número da linha na planilha (a primeira linha de dados é a 2, pois a 1 é o cabeçalho). */
  numero: number;
  status: StatusDaLinha;
  /** Texto curto para identificar a linha na tela. */
  resumo: string;
  /** Erros (status ERRO) ou o motivo da repetição (status DUPLICADA). */
  detalhe: string[];
  /** Cadastro que já existe (DUPLICADA ou ATUALIZARA). */
  idExistente?: string;
  /** Campos que vieram preenchidos na planilha (para atualizar só o que veio). */
  presentes: string[];
  dados?: DadosPorTipo[TipoDeImportacao];
};

export type Analise = {
  tipo: TipoDeImportacao;
  modo: ModoDuplicadas;
  linhas: LinhaAnalisada[];
  totais: { total: number; novas: number; atualizacoes: number; duplicadas: number; erros: number };
};

/** Carrega o que já está cadastrado e as planilhas podem referenciar (por nome). */
export async function carregarContexto(): Promise<ContextoDeImportacao> {
  const [categorias, linhas, acabamentos, fornecedores] = await Promise.all([
    prisma.categoriaProduto.findMany({ where: { ativo: true, deletadoEm: null }, select: { id: true, nome: true } }),
    prisma.linhaAluminio.findMany({ where: { ativo: true, deletadoEm: null }, select: { id: true, nome: true } }),
    prisma.acabamentoAluminio.findMany({ where: { ativo: true, deletadoEm: null }, select: { id: true, nome: true } }),
    prisma.fornecedor.findMany({ where: { ativo: true, deletadoEm: null }, select: { id: true, razaoSocial: true, nomeFantasia: true } }),
  ]);
  const porNome = (itens: { id: string; nome: string }[]) => new Map(itens.map((i) => [chaveDeNome(i.nome), i.id]));

  const mapaFornecedores = new Map<string, string>();
  const ambiguos = new Set<string>();
  for (const f of fornecedores) {
    for (const nome of [f.razaoSocial, f.nomeFantasia]) {
      if (!nome) continue;
      const chave = chaveDeNome(nome);
      if (!chave) continue;
      const existente = mapaFornecedores.get(chave);
      if (existente && existente !== f.id) ambiguos.add(chave);
      else mapaFornecedores.set(chave, f.id);
    }
  }
  return { categorias: porNome(categorias), linhas: porNome(linhas), acabamentos: porNome(acabamentos), fornecedores: mapaFornecedores, fornecedoresAmbiguos: ambiguos };
}

/** Linha da planilha → valores por campo, segundo o mapeamento escolhido. */
function valoresDaLinha(tipo: TipoDeImportacao, linha: string[], mapeamento: Record<string, number | null>): Valores {
  const valores: Valores = {};
  for (const campo of CAMPOS_POR_TIPO[tipo]) {
    const indice = mapeamento[campo.chave];
    valores[campo.chave] = indice === null || indice === undefined ? "" : (linha[indice] ?? "").trim();
  }
  return valores;
}

/** Quais campos obrigatórios ficaram sem coluna no mapeamento (a análise nem começa). */
export function camposObrigatoriosSemColuna(tipo: TipoDeImportacao, mapeamento: Record<string, number | null>): string[] {
  return CAMPOS_POR_TIPO[tipo].filter((c) => c.obrigatorio && (mapeamento[c.chave] === null || mapeamento[c.chave] === undefined)).map((c) => c.rotulo);
}

export { sugerirMapeamento };

/**
 * Lê as linhas, valida cada uma, procura repetidas (dentro do arquivo e contra o que já existe) e diz
 * o que cada linha viraria. Não grava nada. A confirmação roda esta MESMA função de novo no servidor.
 */
export async function analisarImportacao(pedido: PedidoDeImportacao): Promise<Analise> {
  const { tipo, modo } = pedido;
  const contexto = await carregarContexto();
  const analisadas: LinhaAnalisada[] = pedido.linhas.map((linha, i) => {
    const valores = valoresDaLinha(tipo, linha, pedido.mapeamento);
    const presentes = Object.entries(valores).filter(([, v]) => v !== "").map(([k]) => k);
    const numero = i + 2;
    const base = { numero, presentes, detalhe: [] as string[] };

    if (tipo === "CLIENTES") {
      const r = validarCliente(valores);
      return r.ok
        ? { ...base, status: "NOVA" as const, resumo: r.dados.nome, dados: r.dados }
        : { ...base, status: "ERRO" as const, resumo: valores.nome || "(sem nome)", detalhe: r.erros };
    }
    if (tipo === "FORNECEDORES") {
      const r = validarFornecedor(valores, contexto);
      return r.ok
        ? { ...base, status: "NOVA" as const, resumo: r.dados.razaoSocial, dados: r.dados }
        : { ...base, status: "ERRO" as const, resumo: valores.razaoSocial || "(sem nome)", detalhe: r.erros };
    }
    const r = validarProduto(valores, contexto);
    return r.ok
      ? { ...base, status: "NOVA" as const, resumo: `${r.dados.codigo} — ${r.dados.descricao}`, dados: r.dados }
      : { ...base, status: "ERRO" as const, resumo: [valores.codigo, valores.descricao].filter(Boolean).join(" — ") || "(linha vazia)", detalhe: r.erros };
  });

  await marcarRepetidas(tipo, modo, analisadas);

  const conta = (s: StatusDaLinha) => analisadas.filter((l) => l.status === s).length;
  return {
    tipo,
    modo,
    linhas: analisadas,
    totais: { total: analisadas.length, novas: conta("NOVA"), atualizacoes: conta("ATUALIZARA"), duplicadas: conta("DUPLICADA"), erros: conta("ERRO") },
  };
}

/** Rótulo curto da chave de repetição, para a mensagem ("mesmo CPF/CNPJ", "mesmo código"). */
type Chave = { chave: string; rotulo: string };

function chavesDaLinha(tipo: TipoDeImportacao, l: LinhaAnalisada): Chave[] {
  if (!l.dados) return [];
  if (tipo === "CLIENTES") {
    const d = l.dados as ClienteImportado;
    const k = chavesDeDuplicidade({ cpfCnpj: d.cpfCnpj, telefone: d.telefone, whatsapp: d.whatsapp });
    return [...(k.documento ? [{ chave: `d:${k.documento}`, rotulo: "CPF/CNPJ" }] : []), ...k.telefones.map((t) => ({ chave: `t:${t}`, rotulo: "telefone" }))];
  }
  if (tipo === "FORNECEDORES") {
    const d = l.dados as FornecedorImportado;
    return d.cnpj ? [{ chave: `c:${d.cnpj}`, rotulo: "CNPJ" }] : [];
  }
  return [{ chave: `p:${(l.dados as ProdutoImportado).codigo.toLowerCase()}`, rotulo: "código" }];
}

async function marcarRepetidas(tipo: TipoDeImportacao, modo: ModoDuplicadas, linhas: LinhaAnalisada[]) {
  const validas = linhas.filter((l) => l.status === "NOVA");

  // 1) Repetidas dentro do próprio arquivo: a primeira vale, as seguintes são ignoradas.
  const dentro = duplicadasNoArquivo(validas.map((l) => chavesDaLinha(tipo, l)));
  for (const d of dentro) {
    const l = validas[d.indice];
    const primeira = validas[d.duplicadaDe];
    l.status = "DUPLICADA";
    l.detalhe = [`Repetida no arquivo: mesmo ${d.motivo} da linha ${primeira.numero}.`];
  }

  // 2) Contra o que já está cadastrado (consultas em lote, não uma por linha).
  const restantes = validas.filter((l) => l.status === "NOVA");
  if (restantes.length === 0) return;

  if (tipo === "CLIENTES") {
    const chaves = restantes.map((l) => chavesDaLinha(tipo, l));
    const docs = Array.from(new Set(chaves.flat().filter((k) => k.chave.startsWith("d:")).map((k) => k.chave.slice(2))));
    const tels = Array.from(new Set(chaves.flat().filter((k) => k.chave.startsWith("t:")).map((k) => k.chave.slice(2))));
    const existentes = await prisma.cliente.findMany({
      where: { deletadoEm: null, OR: [{ cpfCnpj: { in: docs } }, { telefone: { in: tels } }, { whatsapp: { in: tels } }] },
      select: { id: true, nome: true, cpfCnpj: true, telefone: true, whatsapp: true },
    });
    restantes.forEach((l, i) => {
      for (const k of chaves[i]) {
        const valor = k.chave.slice(2);
        const achado = existentes.find((e) => (k.chave.startsWith("d:") ? e.cpfCnpj === valor : e.telefone === valor || e.whatsapp === valor));
        if (achado) {
          l.status = "DUPLICADA";
          l.idExistente = achado.id;
          l.detalhe = [`Já cadastrado: ${achado.nome} (mesmo ${k.rotulo}).`];
          return;
        }
      }
    });
    return;
  }

  if (tipo === "FORNECEDORES") {
    const cnpjs = Array.from(new Set(restantes.map((l) => (l.dados as FornecedorImportado).cnpj).filter((c): c is string => !!c)));
    if (cnpjs.length === 0) return;
    const existentes = await prisma.fornecedor.findMany({ where: { deletadoEm: null, cnpj: { in: cnpjs } }, select: { id: true, razaoSocial: true, cnpj: true } });
    for (const l of restantes) {
      const achado = existentes.find((e) => e.cnpj === (l.dados as FornecedorImportado).cnpj);
      if (achado) {
        l.status = "DUPLICADA";
        l.idExistente = achado.id;
        l.detalhe = [`Já cadastrado: ${achado.razaoSocial} (mesmo CNPJ).`];
      }
    }
    return;
  }

  // Produtos: o código é a chave (sem diferenciar maiúsculas).
  const codigos = Array.from(new Set(restantes.map((l) => (l.dados as ProdutoImportado).codigo.toLowerCase())));
  const existentes = await prisma.$queryRaw<{ id: string; codigo: string; descricao: string }[]>`
    SELECT id, codigo, descricao FROM "Produto" WHERE "deletadoEm" IS NULL AND lower("codigo") = ANY(${codigos}::text[])`;
  const porCodigo = new Map(existentes.map((e) => [e.codigo.toLowerCase(), e]));
  for (const l of restantes) {
    const achado = porCodigo.get((l.dados as ProdutoImportado).codigo.toLowerCase());
    if (!achado) continue;
    l.idExistente = achado.id;
    if (modo === "ATUALIZAR") {
      l.status = "ATUALIZARA";
      l.detalhe = [`Atualiza o produto existente: ${achado.descricao}.`];
    } else {
      l.status = "DUPLICADA";
      l.detalhe = [`Já cadastrado: ${achado.descricao} (mesmo código).`];
    }
  }
}
