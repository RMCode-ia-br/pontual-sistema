/**
 * Validação de UMA linha da planilha, para cada tipo. Código puro (sem banco): quem chama entrega o
 * contexto (categorias, fornecedores... já cadastrados) e recebe os dados prontos para gravar, ou a
 * lista de problemas em português, um por campo. Reaproveita os mesmos validadores dos formulários,
 * então planilha e tela seguem exatamente as mesmas regras.
 */
import { z } from "zod";

import { normalizarCabecalho } from "@/lib/dominio/mapeamento";
import { textoParaBooleano } from "@/lib/dominio/numeros";
import {
  campoCnpj,
  campoDecimalOpcional,
  campoEmail,
  campoInteiroOpcional,
  campoMoedaOpcional,
  campoTelefone,
  campoTexto,
  campoTextoOpcional,
} from "@/lib/validadores/campos";
import { CUSTO_MAXIMO_CENTAVOS } from "@/lib/dominio/reajuste";
import { somenteDigitos, validarCnpj, validarCpf } from "@/lib/validadores";

import { COMPRIMENTO_BARRA_PADRAO_MM, UNIDADES } from "../produtos/schemas";
import { ORIGENS, ROTULO_ORIGEM } from "../clientes/schemas";
import type { TipoDeImportacao } from "./campos";

/** Nome sem acento, caixa ou pontuação: chave para casar "Ferragens e Acessórios" com "ferragens e acessorios". */
export const chaveDeNome = normalizarCabecalho;

export type ContextoDeImportacao = {
  /** nome normalizado → id */
  categorias: Map<string, string>;
  linhas: Map<string, string>;
  acabamentos: Map<string, string>;
  fornecedores: Map<string, string>;
  /** Nomes de fornecedor que casam com mais de um cadastro (a planilha não consegue escolher). */
  fornecedoresAmbiguos: Set<string>;
};

export type Valores = Record<string, string>;

export type ResultadoDaLinha<T> = { ok: true; dados: T } | { ok: false; erros: string[] };

export type ClienteImportado = {
  tipoPessoa: "PF" | "PJ";
  nome: string;
  nomeFantasia?: string;
  cpfCnpj?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  origem?: (typeof ORIGENS)[number];
  clienteFinal: boolean;
  arquiteto: boolean;
  construtora: boolean;
  observacoes?: string;
};

export type FornecedorImportado = {
  razaoSocial: string;
  nomeFantasia?: string;
  cnpj?: string;
  categoriaIds: string[];
  vendedorNome?: string;
  telefone?: string;
  email?: string;
  condicoesPagamento?: string;
  prazoEntregaDias?: number;
  observacoes?: string;
};

export type ProdutoImportado = {
  codigo: string;
  descricao: string;
  unidade: (typeof UNIDADES)[number];
  categoriaId?: string;
  fornecedorPrincipalId?: string;
  linhaId?: string;
  acabamentoId?: string;
  custoCentavos?: number;
  comprimentoBarraMm?: number;
  pesoKgPorMetro?: number;
  estoqueMinimo?: number;
  localizacao?: string;
};

/** Coletor de erros de uma linha: cada campo validado devolve o valor ou registra a mensagem. */
class Coletor {
  readonly erros: string[] = [];

  campo<S extends z.ZodType>(esquema: S, texto: string | undefined, rotulo: string): z.output<S> | undefined {
    const r = esquema.safeParse((texto ?? "").trim());
    if (r.success) return r.data as z.output<S> | undefined;
    const mensagem = r.error.issues[0]?.message ?? "valor inválido.";
    this.erros.push(mensagem.toLowerCase().includes(rotulo.toLowerCase()) ? mensagem : `${rotulo}: ${mensagem}`);
    return undefined;
  }

  erro(mensagem: string) {
    this.erros.push(mensagem);
  }
}

const vazio = (v: string | undefined) => (v ?? "").trim() === "";

function lerBooleano(c: Coletor, texto: string | undefined, rotulo: string): boolean {
  if (vazio(texto)) return false;
  const b = textoParaBooleano(texto as string);
  if (b === undefined) c.erro(`${rotulo}: use Sim ou Não.`);
  return b ?? false;
}

// ----------------------------- Clientes -----------------------------

const ORIGEM_POR_NOME = new Map<string, (typeof ORIGENS)[number]>(
  ORIGENS.flatMap((o) => [
    [chaveDeNome(o), o],
    [chaveDeNome(ROTULO_ORIGEM[o]), o],
  ]),
);

export function validarCliente(v: Valores): ResultadoDaLinha<ClienteImportado> {
  const c = new Coletor();
  const nome = c.campo(campoTexto("o nome", 160), v.nome, "Nome");

  let cpfCnpj: string | undefined;
  let tipoPessoa: "PF" | "PJ" = "PF";
  if (!vazio(v.documento)) {
    const digitos = somenteDigitos(v.documento);
    if (digitos.length === 11) {
      if (validarCpf(digitos)) cpfCnpj = digitos;
      else c.erro("CPF inválido. Confira os 11 números.");
    } else if (digitos.length === 14) {
      tipoPessoa = "PJ";
      if (validarCnpj(digitos)) cpfCnpj = digitos;
      else c.erro("CNPJ inválido. Confira os 14 números.");
    } else {
      c.erro("CPF/CNPJ: use 11 números (CPF) ou 14 (CNPJ).");
    }
  }

  let origem: (typeof ORIGENS)[number] | undefined;
  if (!vazio(v.origem)) {
    origem = ORIGEM_POR_NOME.get(chaveDeNome(v.origem));
    if (!origem) c.erro(`Origem "${v.origem.trim()}" não existe. Use uma das opções do modelo.`);
  }

  const arquiteto = lerBooleano(c, v.arquiteto, "É arquiteto/designer");
  const construtora = lerBooleano(c, v.construtora, "É construtora");
  const dados = {
    nomeFantasia: c.campo(campoTextoOpcional(160), v.nomeFantasia, "Nome fantasia"),
    telefone: c.campo(campoTelefone("Telefone"), v.telefone, "Telefone"),
    whatsapp: c.campo(campoTelefone("WhatsApp"), v.whatsapp, "WhatsApp"),
    email: c.campo(campoEmail(), v.email, "E-mail"),
    observacoes: c.campo(campoTextoOpcional(4000), v.observacoes, "Observações"),
  };

  if (c.erros.length > 0 || nome === undefined) return { ok: false, erros: c.erros };
  return {
    ok: true,
    dados: { tipoPessoa, nome, cpfCnpj, origem, arquiteto, construtora, clienteFinal: !arquiteto && !construtora, ...dados },
  };
}

// --------------------------- Fornecedores ---------------------------

export function validarFornecedor(v: Valores, ctx: ContextoDeImportacao): ResultadoDaLinha<FornecedorImportado> {
  const c = new Coletor();
  const razaoSocial = c.campo(campoTexto("a razão social ou o nome", 160), v.razaoSocial, "Razão social");
  const categoriaIds: string[] = [];
  if (!vazio(v.categorias)) {
    for (const nome of v.categorias.split(/[,;|/]/).map((n) => n.trim()).filter(Boolean)) {
      const id = ctx.categorias.get(chaveDeNome(nome));
      if (!id) c.erro(`Categoria "${nome}" não está cadastrada (Cadastros → Catálogos).`);
      else if (!categoriaIds.includes(id)) categoriaIds.push(id);
    }
  }
  const dados = {
    nomeFantasia: c.campo(campoTextoOpcional(160), v.nomeFantasia, "Nome fantasia"),
    cnpj: c.campo(campoCnpj("CNPJ"), v.cnpj, "CNPJ"),
    vendedorNome: c.campo(campoTextoOpcional(160), v.vendedorNome, "Vendedor"),
    telefone: c.campo(campoTelefone("Telefone"), v.telefone, "Telefone"),
    email: c.campo(campoEmail(), v.email, "E-mail"),
    condicoesPagamento: c.campo(campoTextoOpcional(300), v.condicoesPagamento, "Condições de pagamento"),
    prazoEntregaDias: c.campo(campoInteiroOpcional("Prazo de entrega", 365), v.prazoEntregaDias, "Prazo de entrega"),
    observacoes: c.campo(campoTextoOpcional(4000), v.observacoes, "Observações"),
  };
  if (c.erros.length > 0 || razaoSocial === undefined) return { ok: false, erros: c.erros };
  return { ok: true, dados: { razaoSocial, categoriaIds, ...dados } };
}

// ----------------------------- Produtos -----------------------------

const UNIDADE_POR_NOME = new Map<string, (typeof UNIDADES)[number]>([
  ["un", "UN"], ["unid", "UN"], ["unidade", "UN"], ["pc", "UN"], ["peca", "UN"],
  ["m", "M"], ["metro", "M"], ["mt", "M"], ["ml", "M"],
  ["m2", "M2"], ["metroquadrado", "M2"],
  ["kg", "KG"], ["quilo", "KG"], ["quilograma", "KG"],
  ["barra", "BARRA"], ["br", "BARRA"], ["bar", "BARRA"],
  ["l", "L"], ["lt", "L"], ["litro", "L"],
  ["par", "PAR"],
  ["cj", "CJ"], ["conjunto", "CJ"], ["jogo", "CJ"], ["kit", "CJ"],
]);

/** "m²" vira "m2" antes de normalizar (a normalização apaga o "²" e confundiria com metro). */
const chaveDeUnidade = (texto: string) => chaveDeNome(texto.replace(/²/g, "2"));

function achar(c: Coletor, mapa: Map<string, string>, texto: string | undefined, rotulo: string, ambiguos?: Set<string>): string | undefined {
  if (vazio(texto)) return undefined;
  const chave = chaveDeNome(texto as string);
  if (ambiguos?.has(chave)) {
    c.erro(`${rotulo} "${(texto as string).trim()}" existe mais de uma vez no cadastro. Use o nome completo ou ajuste o cadastro.`);
    return undefined;
  }
  const id = mapa.get(chave);
  if (!id) c.erro(`${rotulo} "${(texto as string).trim()}" não está cadastrado.`);
  return id;
}

export function validarProduto(v: Valores, ctx: ContextoDeImportacao): ResultadoDaLinha<ProdutoImportado> {
  const c = new Coletor();
  const codigo = c.campo(campoTexto("o código do produto", 40, 1), v.codigo, "Código");
  const descricao = c.campo(campoTexto("a descrição", 200), v.descricao, "Descrição");

  let unidade: (typeof UNIDADES)[number] = "UN";
  if (!vazio(v.unidade)) {
    const achada = UNIDADE_POR_NOME.get(chaveDeUnidade(v.unidade));
    if (achada) unidade = achada;
    else c.erro(`Unidade "${v.unidade.trim()}" não existe. Use UN, M, M2, KG, BARRA, L, PAR ou CJ.`);
  }

  const categoriaId = achar(c, ctx.categorias, v.categoria, "Categoria");
  const fornecedorPrincipalId = achar(c, ctx.fornecedores, v.fornecedor, "Fornecedor", ctx.fornecedoresAmbiguos);
  const linhaId = achar(c, ctx.linhas, v.linha, "Linha");
  const acabamentoId = achar(c, ctx.acabamentos, v.acabamento, "Acabamento");

  const custoCentavos = c.campo(campoMoedaOpcional("Custo unitário", CUSTO_MAXIMO_CENTAVOS), v.custo, "Custo unitário");
  const comprimentoLido = c.campo(campoInteiroOpcional("Comprimento da barra", 20000), v.comprimentoBarraMm, "Comprimento da barra");
  const pesoKgPorMetro = c.campo(campoDecimalOpcional("Peso por metro", 1000, 3), v.pesoKgPorMetro, "Peso por metro");
  const estoqueMinimo = c.campo(campoDecimalOpcional("Estoque mínimo", 1_000_000, 3), v.estoqueMinimo, "Estoque mínimo");
  const localizacao = c.campo(campoTextoOpcional(120), v.localizacao, "Localização");

  if (c.erros.length > 0 || codigo === undefined || descricao === undefined) return { ok: false, erros: c.erros };
  return {
    ok: true,
    dados: {
      codigo,
      descricao,
      unidade,
      categoriaId,
      fornecedorPrincipalId,
      linhaId,
      acabamentoId,
      custoCentavos,
      comprimentoBarraMm: comprimentoLido ?? (unidade === "BARRA" ? COMPRIMENTO_BARRA_PADRAO_MM : undefined),
      pesoKgPorMetro,
      estoqueMinimo,
      localizacao,
    },
  };
}

export type ValidacaoPorTipo = {
  CLIENTES: ResultadoDaLinha<ClienteImportado>;
  FORNECEDORES: ResultadoDaLinha<FornecedorImportado>;
  PRODUTOS: ResultadoDaLinha<ProdutoImportado>;
};

export function validarLinha<T extends TipoDeImportacao>(tipo: T, valores: Valores, ctx: ContextoDeImportacao): ValidacaoPorTipo[T];
export function validarLinha(tipo: TipoDeImportacao, valores: Valores, ctx: ContextoDeImportacao) {
  if (tipo === "CLIENTES") return validarCliente(valores);
  if (tipo === "FORNECEDORES") return validarFornecedor(valores, ctx);
  return validarProduto(valores, ctx);
}
