import "server-only";

import type { Prisma } from "@/generated/prisma/client";
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

export type FiltrosDaGaleria = { tipo?: (typeof TIPOS_SERVICO)[number]; cidade?: string; ano?: number; publicada?: "sim" | "nao" };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Tudo que vem da URL é dado não confiável: cada filtro é validado contra o que a galeria aceita. */
export function lerFiltrosDaGaleria(brutos: Record<string, string | string[] | undefined>): FiltrosDaGaleria {
  const tipo = um(brutos.tipo);
  const ano = Number.parseInt(um(brutos.ano) ?? "", 10);
  const publicada = um(brutos.publicada);
  const cidade = (um(brutos.cidade) ?? "").trim().slice(0, 80);
  return {
    tipo: (TIPOS_SERVICO as readonly string[]).includes(tipo ?? "") ? (tipo as FiltrosDaGaleria["tipo"]) : undefined,
    cidade: cidade || undefined,
    ano: Number.isInteger(ano) && ano >= 2000 && ano <= 2100 ? ano : undefined,
    publicada: publicada === "sim" || publicada === "nao" ? publicada : undefined,
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

/** A galeria é uma vitrine interna: limita o que carrega de uma vez. */
export const LIMITE_DE_FOTOS_NA_GALERIA = 600;
const STATUS_DE_OBRA = ["APROVADO", "EM_EXECUCAO", "CONCLUIDO"] as const;

/**
 * Fotos marcadas para o portfólio, de obras cujo cliente autoriza o uso (R18). Só entram as fotos de obra
 * (categoria própria, com momento), nunca outras imagens do projeto (documentos, plantas, comprovantes).
 */
export async function listarGaleria(filtros: FiltrosDaGaleria): Promise<{ obras: ObraDaGaleria[]; opcoes: { cidades: string[]; anos: number[] }; truncado: boolean }> {
  const brutas = await prisma.anexo.findMany({
    where: { entidadeTipo: "Projeto", categoria: CATEGORIA_FOTO_DE_OBRA, deletadoEm: null, usarNoPortfolio: true, momento: { not: null }, mime: { startsWith: "image/" } },
    orderBy: { criadoEm: "desc" },
    take: LIMITE_DE_FOTOS_NA_GALERIA,
    select: SELECAO,
  });
  const ids = [...new Set(brutas.map((b) => b.entidadeId))];
  const [projetos, modelo] = await Promise.all([
    prisma.projeto.findMany({
      where: { id: { in: ids }, deletadoEm: null, autorizaPortfolio: true, status: { in: [...STATUS_DE_OBRA] } },
      select: { id: true, codigo: true, titulo: true, publicadoInstagramEm: true, cliente: { select: { nome: true } }, ...SELECAO_PARA_LEGENDA },
    }),
    obterModeloDeLegenda(),
  ]);
  const porProjeto = new Map(projetos.map((p) => [p.id, p]));
  const doProjeto = (id: string) => brutas.filter((b) => b.entidadeId === id);

  // Opções dos filtros: do conjunto inteiro (antes de filtrar), para o gestor sempre ver o que existe.
  const cidades = [...new Set(projetos.flatMap((p) => (p.enderecoObra?.cidade?.trim() ? [p.enderecoObra.cidade.trim()] : [])))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const anos = [...new Set(brutas.filter((b) => porProjeto.has(b.entidadeId)).map((b) => anoEmSaoPaulo(b.criadoEm)))].sort((a, b) => b - a);

  const escolhidas: { projeto: (typeof projetos)[number]; fotos: Bruta[] }[] = [];
  for (const p of projetos) {
    if (filtros.tipo && !p.tiposServico.includes(filtros.tipo)) continue;
    if (filtros.cidade && (p.enderecoObra?.cidade ?? "").trim().toLowerCase() !== filtros.cidade.toLowerCase()) continue;
    if (filtros.publicada === "sim" && !p.publicadoInstagramEm) continue;
    if (filtros.publicada === "nao" && p.publicadoInstagramEm) continue;
    const fotos = doProjeto(p.id).filter((f) => !filtros.ano || anoEmSaoPaulo(f.criadoEm) === filtros.ano);
    if (fotos.length > 0) escolhidas.push({ projeto: p, fotos });
  }

  const mapa = await comLinks(escolhidas.flatMap((e) => e.fotos));
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
  // A obra com a foto mais recente primeiro.
  obras.sort((a, b) => (a.fotos[0].criadoEm < b.fotos[0].criadoEm ? 1 : -1));
  return { obras, opcoes: { cidades, anos }, truncado: brutas.length >= LIMITE_DE_FOTOS_NA_GALERIA };
}
