import { z } from "zod";

import { TODOS_OS_GRUPOS_DRE, type GrupoDreChave } from "@/lib/dominio/dre";

/** Definição dos catálogos editáveis (spec seção 6). Sem dependências do servidor: serve ao cliente também. */
export type SlugCatalogo =
  | "linhas"
  | "acabamentos"
  | "tipos-vidro"
  | "espessuras-vidro"
  | "categorias-produto"
  | "motivos-perda"
  | "motivos-bloqueio"
  | "categorias-financeiras";

export type DefinicaoCatalogo = {
  slug: SlugCatalogo;
  titulo: string;
  /** Nome do modelo Prisma (também usado na auditoria). */
  entidade: string;
  singular: string;
  descricao: string;
  extra?: "justificado" | "financeira" | "espessura";
};

export const CATALOGOS: DefinicaoCatalogo[] = [
  { slug: "linhas", titulo: "Linhas de alumínio", entidade: "LinhaAluminio", singular: "linha", descricao: "Suprema, Gold, 23, 25, 28, 30, Euroshow…" },
  { slug: "acabamentos", titulo: "Acabamentos", entidade: "AcabamentoAluminio", singular: "acabamento", descricao: "Anodizado, revestido, amadeirado… A cor muda o preço por tabela própria." },
  { slug: "tipos-vidro", titulo: "Tipos de vidro", entidade: "TipoVidro", singular: "tipo de vidro", descricao: "Incolor, fumê, bronze, refletivo, laminado…" },
  { slug: "espessuras-vidro", titulo: "Espessuras de vidro", entidade: "EspessuraVidro", singular: "espessura", descricao: "Em milímetros: 6, 8, 10…", extra: "espessura" },
  { slug: "categorias-produto", titulo: "Categorias de produto", entidade: "CategoriaProduto", singular: "categoria", descricao: "Perfis, vidros, ferragens, borrachas…" },
  { slug: "motivos-perda", titulo: "Motivos de perda", entidade: "MotivoPerda", singular: "motivo", descricao: "Obrigatório ao marcar um projeto como perdido." },
  {
    slug: "motivos-bloqueio",
    titulo: "Motivos de bloqueio de etapa",
    entidade: "MotivoBloqueio",
    singular: "motivo",
    descricao: "Marque “justificado” quando o atraso não é culpa da Pontual: o prazo prometido é estendido.",
    extra: "justificado",
  },
  {
    slug: "categorias-financeiras",
    titulo: "Categorias financeiras",
    entidade: "CategoriaFinanceira",
    singular: "categoria",
    descricao: "Agrupam receitas e despesas no DRE gerencial.",
    extra: "financeira",
  },
];

export function definicaoPorSlug(slug: string | undefined): DefinicaoCatalogo | undefined {
  return CATALOGOS.find((c) => c.slug === slug);
}

export type ItemCatalogo = {
  id: string;
  /** Para espessuras, é o valor em mm como texto. */
  nome: string;
  ativo: boolean;
  ordem: number;
  justificado?: boolean;
  tipo?: "RECEITA" | "DESPESA";
  /** Grupo do DRE (lista fixa). */
  grupo?: GrupoDreChave | null;
};

export const slugSchema = z.enum([
  "linhas",
  "acabamentos",
  "tipos-vidro",
  "espessuras-vidro",
  "categorias-produto",
  "motivos-perda",
  "motivos-bloqueio",
  "categorias-financeiras",
]);

export const nomeCatalogoSchema = z.string().trim().min(1, "Informe o nome.").max(80, "Use no máximo 80 caracteres.");

export const espessuraSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}$/, "Informe a espessura em milímetros (número inteiro).")
  .transform(Number)
  .refine((n) => n >= 1 && n <= 100, "A espessura deve ficar entre 1 e 100 mm.");

export const dadosItemSchema = z.object({
  nome: z.string(),
  justificado: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  tipo: z.enum(["RECEITA", "DESPESA"]).optional(),
  grupo: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.enum(TODOS_OS_GRUPOS_DRE as [GrupoDreChave, ...GrupoDreChave[]], { message: "Escolha o grupo no DRE." }).optional())
    .optional(),
});
