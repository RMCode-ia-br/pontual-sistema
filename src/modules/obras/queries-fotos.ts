import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { anoEmSaoPaulo } from "@/lib/dominio/codigo-projeto";
import {
  CATEGORIA_FOTO_DE_OBRA,
  listaEmTexto,
  MODELO_PADRAO_DA_LEGENDA,
  montarLegenda,
  selecionarParaPostagem,
  type MomentoDaFoto,
} from "@/lib/dominio/portfolio";
import { calcularPaginacao, TAMANHOS_DE_PAGINA, type Paginacao } from "@/lib/listas/parametros";
import { criarUrlsDeDownload } from "@/lib/storage";
import { ROTULO_TIPO_SERVICO, TIPOS_SERVICO } from "@/modules/projetos/schemas";

export type FotoDaObra = {
  id: string;
  nome: string;
  mime: string;
  /** Link assinado de curta duração; vazio se o arquivo não está no bucket. */
  url: string | null;
  momento: MomentoDaFoto | null;
  usarNoPortfolio: boolean;
  descricao: string | null;
  criadoEm: string;
};

const SELECAO = { id: true, nome: true, mime: true, caminho: true, momento: true, usarNoPortfolio: true, descricao: true, criadoEm: true, entidadeId: true } as const;
type Bruta = Prisma.AnexoGetPayload<{ select: typeof SELECAO }>;

/** Miniaturas: uma chamada ao Storage para todas. Se ela falhar, a tela segue sem as imagens (quadros vazios). */
async function comLinks(brutas: Bruta[]): Promise<Map<string, FotoDaObra>> {
  let links = new Map<string, string>();
  try {
    links = await criarUrlsDeDownload(brutas.map((b) => b.caminho));
  } catch {
    console.error(JSON.stringify({ evento: "obras.fotos_sem_links" }));
  }
  return new Map(
    brutas.map((b) => [
      b.id,
      { id: b.id, nome: b.nome, mime: b.mime, url: links.get(b.caminho) ?? null, momento: b.momento, usarNoPortfolio: b.usarNoPortfolio, descricao: b.descricao, criadoEm: b.criadoEm.toISOString() },
    ]),
  );
}

const LIMITE_DE_FOTOS_POR_OBRA = 300;

/** Fotos da obra (as enviadas na aba Fotos), da mais recente para a mais antiga. */
export async function listarFotosDaObra(projetoId: string): Promise<FotoDaObra[]> {
  const brutas = await prisma.anexo.findMany({
    where: { entidadeTipo: "Projeto", entidadeId: projetoId, categoria: CATEGORIA_FOTO_DE_OBRA, deletadoEm: null, mime: { startsWith: "image/" } },
    orderBy: { criadoEm: "desc" },
    take: LIMITE_DE_FOTOS_POR_OBRA,
    select: SELECAO,
  });
  const mapa = await comLinks(brutas);
  return brutas.map((b) => mapa.get(b.id)!);
}

// ---------------------------------------------------------------------------------------------------------
// Legenda sugerida
// ---------------------------------------------------------------------------------------------------------

export async function obterModeloDeLegenda(): Promise<string> {
  const m = await prisma.modeloTexto.findFirst({ where: { chave: "portfolio.legenda", ativo: true, deletadoEm: null }, select: { conteudo: true } });
  return m?.conteudo ?? MODELO_PADRAO_DA_LEGENDA;
}

type ProjetoParaLegenda = {
  tiposServico: string[];
  enderecoObra: { cidade: string | null; uf: string | null } | null;
  propostas: { opcaoAprovadaId: string | null; itens: { opcaoId: string; linha: { nome: string } | null }[] }[];
};

/** Só tipo de serviço, linha, cidade e UF: nada do cliente chega aqui (nem o nome, nem o telefone, nem o endereço). */
function legendaDoProjeto(p: ProjetoParaLegenda, modelo: string) {
  const tipos = TIPOS_SERVICO.filter((t) => p.tiposServico.includes(t)).map((t) => ROTULO_TIPO_SERVICO[t]);
  const linhas = [...new Set(p.propostas.flatMap((pr) => pr.itens.filter((i) => i.opcaoId === pr.opcaoAprovadaId && i.linha).map((i) => i.linha!.nome)))].sort();
  return montarLegenda(modelo, {
    tipoServico: tipos.length > 0 ? listaEmTexto(tipos) : null,
    linha: linhas.length > 0 ? listaEmTexto(linhas, { nomesProprios: true }) : null,
    cidade: p.enderecoObra?.cidade?.trim() || null,
    regiao: p.enderecoObra?.uf?.trim() || null,
  });
}

const SELECAO_PARA_LEGENDA = {
  tiposServico: true,
  enderecoObra: { select: { cidade: true, uf: true } },
  propostas: { where: { status: "APROVADA", deletadoEm: null }, select: { opcaoAprovadaId: true, itens: { where: { deletadoEm: null }, select: { opcaoId: true, linha: { select: { nome: true } } } } } },
} as const;

/** Legenda sugerida de uma obra (usada também no ZIP do kit). */
export async function legendaDaObra(projetoId: string): Promise<{ texto: string; faltando: string[] } | null> {
  const [p, modelo] = await Promise.all([prisma.projeto.findFirst({ where: { id: projetoId, deletadoEm: null }, select: SELECAO_PARA_LEGENDA }), obterModeloDeLegenda()]);
  return p ? legendaDoProjeto(p, modelo) : null;
}

// ---------------------------------------------------------------------------------------------------------
// Galeria de obras (portfólio)
// ---------------------------------------------------------------------------------------------------------

export type FiltrosDaGaleria = { tipo?: (typeof TIPOS_SERVICO)[number]; cidade?: string; ano?: number; publicada?: "sim" | "nao"; pagina?: number; tamanho?: number };

/** Obras por página da galeria quando a URL não diz (cada obra traz as fotos e os links assinados dela). */
export const TAMANHO_PADRAO_DA_GALERIA = 25;

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Tudo que vem da URL é dado não confiável: cada filtro é validado contra o que a galeria aceita. */
export function lerFiltrosDaGaleria(brutos: Record<string, string | string[] | undefined>): FiltrosDaGaleria {
  const tipo = um(brutos.tipo);
  const ano = Number.parseInt(um(brutos.ano) ?? "", 10);
  const publicada = um(brutos.publicada);
  const cidade = (um(brutos.cidade) ?? "").trim().slice(0, 80);
  const pagina = Number.parseInt(um(brutos.pagina) ?? "", 10);
  const tamanho = Number.parseInt(um(brutos.tamanho) ?? "", 10);
  return {
    tipo: (TIPOS_SERVICO as readonly string[]).includes(tipo ?? "") ? (tipo as FiltrosDaGaleria["tipo"]) : undefined,
    cidade: cidade || undefined,
    ano: Number.isInteger(ano) && ano >= 2000 && ano <= 2100 ? ano : undefined,
    publicada: publicada === "sim" || publicada === "nao" ? publicada : undefined,
    pagina: Number.isInteger(pagina) && pagina >= 1 && pagina <= 100_000 ? pagina : undefined,
    tamanho: (TAMANHOS_DE_PAGINA as readonly number[]).includes(tamanho) ? tamanho : undefined,
  };
}

export type ObraDaGaleria = {
  id: string;
  codigo: string;
  titulo: string;
  /** Só para a equipe (a tela é interna): a legenda e o kit nunca levam o nome do cliente. */
  clienteNome: string;
  tiposServico: string[];
  cidade: string | null;
  uf: string | null;
  publicadoInstagramEm: string | null;
  fotos: FotoDaObra[];
  legenda: { texto: string; faltando: string[] };
  /** Fotos sugeridas para a postagem (o par antes/depois, quando há). */
  sugeridas: string[];
};

const STATUS_DE_OBRA = ["APROVADO", "EM_EXECUCAO", "CONCLUIDO"] as const;

/** Condição SQL (alias `p` = Projeto, `a` = Anexo, `e` = endereço da obra) das fotos e obras que a galeria pode mostrar. */
const FOTO_DE_PORTFOLIO = Prisma.sql`a."entidadeTipo" = 'Projeto' AND a."entidadeId" = p.id AND a."categoria" = ${CATEGORIA_FOTO_DE_OBRA} AND a."deletadoEm" IS NULL
  AND a."usarNoPortfolio" AND a."momento" IS NOT NULL AND a."mime" LIKE 'image/%'`;
const OBRA_ELEGIVEL = Prisma.sql`p."deletadoEm" IS NULL AND p."autorizaPortfolio" AND p.status::text = ANY(${[...STATUS_DE_OBRA]})`;
const ANO_DA_FOTO = Prisma.sql`extract(year FROM (a."criadoEm" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::int`;

/**
 * Galeria paginada: os filtros (tipo, cidade, ano da foto, publicada) valem NO BANCO, antes de contar e de paginar, e só as obras
 * da página buscam as fotos e geram os links assinados do Storage. Fotos de obra (categoria própria, com momento) marcadas para o
 * portfólio, de obras cujo cliente autoriza o uso (R18); nunca outras imagens do projeto.
 */
export async function listarGaleria(filtros: FiltrosDaGaleria): Promise<{ obras: ObraDaGaleria[]; opcoes: { cidades: string[]; anos: number[] }; paginacao: Paginacao; tamanho: number }> {
  const tamanho = filtros.tamanho ?? TAMANHO_PADRAO_DA_GALERIA;
  const condicoes = [
    OBRA_ELEGIVEL,
    ...(filtros.tipo ? [Prisma.sql`${filtros.tipo}::"TipoServico" = ANY(p."tiposServico")`] : []),
    ...(filtros.cidade ? [Prisma.sql`lower(btrim(e."cidade")) = lower(${filtros.cidade})`] : []),
    ...(filtros.publicada === "sim" ? [Prisma.sql`p."publicadoInstagramEm" IS NOT NULL`] : filtros.publicada === "nao" ? [Prisma.sql`p."publicadoInstagramEm" IS NULL`] : []),
    ...(filtros.ano ? [Prisma.sql`${ANO_DA_FOTO} = ${filtros.ano}`] : []),
  ];
  const onde = Prisma.join(condicoes, " AND ");
  const juncoes = Prisma.sql`FROM "Projeto" p JOIN "Anexo" a ON ${FOTO_DE_PORTFOLIO} LEFT JOIN "EnderecoCliente" e ON e.id = p."enderecoObraId"`;

  const [contagem, opcoesCidades, opcoesAnos] = await Promise.all([
    prisma.$queryRaw<{ total: number }[]>`SELECT count(DISTINCT p.id)::int AS total ${juncoes} WHERE ${onde}`,
    // Opções dos filtros: do conjunto inteiro de obras elegíveis (antes de filtrar), para o gestor sempre ver o que existe.
    prisma.$queryRaw<{ cidade: string }[]>`SELECT DISTINCT btrim(e."cidade") AS cidade ${juncoes} WHERE ${OBRA_ELEGIVEL} AND btrim(coalesce(e."cidade", '')) <> '' ORDER BY 1`,
    prisma.$queryRaw<{ ano: number }[]>`SELECT DISTINCT ${ANO_DA_FOTO} AS ano ${juncoes} WHERE ${OBRA_ELEGIVEL} ORDER BY 1 DESC`,
  ]);
  const paginacao = calcularPaginacao(contagem[0]?.total ?? 0, filtros.pagina ?? 1, tamanho);
  const opcoes = { cidades: opcoesCidades.map((c) => c.cidade).sort((a, b) => a.localeCompare(b, "pt-BR")), anos: opcoesAnos.map((a) => a.ano) };

  // A obra com a foto mais recente primeiro (desempate pelo id: a ordem não muda entre páginas).
  const daPagina = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id ${juncoes} WHERE ${onde} GROUP BY p.id ORDER BY max(a."criadoEm") DESC, p.id LIMIT ${paginacao.take} OFFSET ${paginacao.skip}`;
  const ids = daPagina.map((l) => l.id);
  if (ids.length === 0) return { obras: [], opcoes, paginacao, tamanho };

  const [projetos, brutas, modelo] = await Promise.all([
    prisma.projeto.findMany({ where: { id: { in: ids } }, select: { id: true, codigo: true, titulo: true, publicadoInstagramEm: true, cliente: { select: { nome: true } }, ...SELECAO_PARA_LEGENDA } }),
    prisma.anexo.findMany({
      where: { entidadeTipo: "Projeto", entidadeId: { in: ids }, categoria: CATEGORIA_FOTO_DE_OBRA, deletadoEm: null, usarNoPortfolio: true, momento: { not: null }, mime: { startsWith: "image/" } },
      orderBy: { criadoEm: "desc" },
      take: LIMITE_DE_FOTOS_POR_OBRA * ids.length,
      select: SELECAO,
    }),
    obterModeloDeLegenda(),
  ]);
  const porProjeto = new Map(projetos.map((p) => [p.id, p]));
  const fotosDe = (id: string) => brutas.filter((b) => b.entidadeId === id && (!filtros.ano || anoEmSaoPaulo(b.criadoEm) === filtros.ano));

  const escolhidas = ids.flatMap((id) => {
    const p = porProjeto.get(id);
    const fotos = fotosDe(id);
    return p && fotos.length > 0 ? [{ projeto: p, fotos }] : [];
  });
  const mapa = await comLinks(escolhidas.flatMap((e) => e.fotos)); // links assinados só das fotos desta página
  const obras: ObraDaGaleria[] = escolhidas.map(({ projeto: p, fotos }) => {
    const lista = fotos.map((f) => mapa.get(f.id)!);
    return {
      id: p.id,
      codigo: p.codigo,
      titulo: p.titulo,
      clienteNome: p.cliente.nome,
      tiposServico: TIPOS_SERVICO.filter((t) => p.tiposServico.includes(t)).map((t) => ROTULO_TIPO_SERVICO[t]),
      cidade: p.enderecoObra?.cidade?.trim() || null,
      uf: p.enderecoObra?.uf?.trim() || null,
      publicadoInstagramEm: p.publicadoInstagramEm ? p.publicadoInstagramEm.toISOString().slice(0, 10) : null,
      fotos: lista,
      legenda: legendaDoProjeto(p, modelo),
      sugeridas: selecionarParaPostagem(lista),
    };
  });
  return { obras, opcoes, paginacao, tamanho };
}
