import { z } from "zod";

/**
 * Regra PURA de permissões da Pontual (Fase 7C, decisões 176 a 184). Sem banco, sem sessão, sem I/O.
 *
 * Modelo: perfil pronto (papel) + ajuste por módulo guardado no usuário. Resultado = `PermissoesEfetivas`.
 * `decidir` responde a uma pergunta "pode `acao` em `recurso`?" a partir desse resultado.
 *
 * FALHA FECHADA: ação ou recurso sem mapeamento = negado; ajuste inválido = sem acesso a nada (exceto ADMIN, que volta ao
 * perfil puro para o administrador nunca ficar trancado para fora). O teste `tests/unit/permissoes-*.test.ts` obriga
 * todo par `can(...)` do código a ter mapeamento.
 */

export const MODULOS = [
  "PAINEL",
  "AGENDA",
  "COMERCIAL",
  "CLIENTES",
  "OBRAS",
  "FINANCEIRO",
  "ESTOQUE",
  "CADASTROS",
  "RELATORIOS",
  "CONFIGURACOES",
] as const;
export type Modulo = (typeof MODULOS)[number];

export const ROTULO_DO_MODULO: Record<Modulo, string> = {
  PAINEL: "Painel",
  AGENDA: "Agenda e tarefas",
  COMERCIAL: "Comercial",
  CLIENTES: "Clientes",
  OBRAS: "Obras",
  FINANCEIRO: "Financeiro",
  ESTOQUE: "Estoque e compras",
  CADASTROS: "Cadastros",
  RELATORIOS: "Relatórios",
  CONFIGURACOES: "Configurações",
};

export const NIVEIS = ["SEM_ACESSO", "VER", "ALTERAR"] as const;
export type Nivel = (typeof NIVEIS)[number];

export const ROTULO_DO_NIVEL: Record<Nivel, string> = { SEM_ACESSO: "Sem acesso", VER: "Pode ver", ALTERAR: "Pode alterar" };

export const PAPEIS = ["ADMIN", "ESCRITORIO", "CAMPO"] as const;
export type Papel = (typeof PAPEIS)[number];

export const ROTULO_DO_PAPEL: Record<Papel, string> = { ADMIN: "Dono/Gestão", ESCRITORIO: "Escritório", CAMPO: "Campo" };

export type PermissaoDoModulo = { nivel: Nivel; destrutivo: boolean };

export type PermissoesEfetivas = {
  modulos: Record<Modulo, PermissaoDoModulo>;
  /** Vê quanto custa e quanto vale (propostas, parcelas, contas, valor fechado...). */
  verValores: boolean;
  /** Vê custo dos materiais, margem das obras e repasses de nota e de cartão. Exige `verValores`. */
  verCustoMargem: boolean;
  /** O ajuste guardado no usuário não passou na validação estrita (ver `permissoesEfetivas`). */
  ajustesInvalidos: boolean;
};

// ---------------------------------------------------------------------------------------------------------------------
// Perfis prontos (decisão 177)
// ---------------------------------------------------------------------------------------------------------------------

const SEM: PermissaoDoModulo = { nivel: "SEM_ACESSO", destrutivo: false };
const VER: PermissaoDoModulo = { nivel: "VER", destrutivo: false };
const ALT: PermissaoDoModulo = { nivel: "ALTERAR", destrutivo: false };
const ALT_DEST: PermissaoDoModulo = { nivel: "ALTERAR", destrutivo: true };

type PerfilPronto = { modulos: Record<Modulo, PermissaoDoModulo>; verValores: boolean; verCustoMargem: boolean };

export const PERFIS: Record<Papel, PerfilPronto> = {
  ADMIN: {
    modulos: {
      PAINEL: VER,
      AGENDA: ALT_DEST,
      COMERCIAL: ALT_DEST,
      CLIENTES: ALT_DEST,
      OBRAS: ALT_DEST,
      FINANCEIRO: ALT_DEST,
      ESTOQUE: ALT_DEST,
      CADASTROS: ALT_DEST,
      RELATORIOS: VER,
      CONFIGURACOES: ALT_DEST,
    },
    verValores: true,
    verCustoMargem: true,
  },
  ESCRITORIO: {
    modulos: {
      PAINEL: VER,
      AGENDA: ALT,
      COMERCIAL: ALT_DEST,
      CLIENTES: ALT,
      OBRAS: ALT_DEST,
      FINANCEIRO: ALT_DEST,
      ESTOQUE: ALT,
      CADASTROS: ALT,
      RELATORIOS: VER,
      CONFIGURACOES: SEM,
    },
    verValores: true,
    verCustoMargem: true,
  },
  CAMPO: {
    modulos: {
      PAINEL: VER,
      AGENDA: ALT,
      COMERCIAL: SEM,
      CLIENTES: VER,
      OBRAS: ALT,
      FINANCEIRO: SEM,
      ESTOQUE: SEM,
      CADASTROS: SEM,
      RELATORIOS: SEM,
      CONFIGURACOES: SEM,
    },
    verValores: false,
    verCustoMargem: false,
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Ajuste por módulo (validação ESTRITA)
// ---------------------------------------------------------------------------------------------------------------------

const ajusteDoModuloSchema = z.object({ nivel: z.enum(NIVEIS), destrutivo: z.boolean().optional() }).strict();

export const ajustesPermissaoSchema = z
  .object({
    modulos: z
      .object(Object.fromEntries(MODULOS.map((m) => [m, ajusteDoModuloSchema.optional()])) as Record<Modulo, z.ZodOptional<typeof ajusteDoModuloSchema>>)
      .strict()
      .optional(),
    verValores: z.boolean().optional(),
    verCustoMargem: z.boolean().optional(),
  })
  .strict();

export type AjustesPermissao = z.infer<typeof ajustesPermissaoSchema>;

function copiar(p: PerfilPronto): PermissoesEfetivas {
  const modulos = {} as Record<Modulo, PermissaoDoModulo>;
  for (const m of MODULOS) modulos[m] = { ...p.modulos[m] };
  return { modulos, verValores: p.verValores, verCustoMargem: p.verCustoMargem, ajustesInvalidos: false };
}

/** Regras que valem para qualquer combinação: Painel só "ver"; destrutivo só com "alterar"; custo exige valores. */
function normalizar(p: PermissoesEfetivas): PermissoesEfetivas {
  for (const m of MODULOS) {
    const x = p.modulos[m];
    if (m === "PAINEL" && x.nivel === "ALTERAR") x.nivel = "VER";
    if (x.nivel !== "ALTERAR") x.destrutivo = false;
  }
  if (!p.verValores) p.verCustoMargem = false;
  return p;
}

function semAcessoNenhum(): PermissoesEfetivas {
  const modulos = {} as Record<Modulo, PermissaoDoModulo>;
  for (const m of MODULOS) modulos[m] = { ...SEM };
  return { modulos, verValores: false, verCustoMargem: false, ajustesInvalidos: true };
}

/**
 * Permissões efetivas de um usuário = perfil + ajustes. `ajustesBrutos` é o JSON do banco (ou ausente).
 * - Papel desconhecido: sem acesso a nada.
 * - Ajuste ausente (`null`/`undefined`): perfil puro.
 * - Ajuste que não passa no Zod estrito: papel diferente de ADMIN fica SEM acesso a nada; ADMIN volta ao perfil puro
 *   (nunca trancar o administrador). Em ambos `ajustesInvalidos` vem `true` para quem chama registrar no log.
 * - Ajuste de um módulo substitui o nível E a chave destrutiva (a chave omitida vale "não").
 */
export function permissoesEfetivas(papel: string, ajustesBrutos?: unknown): PermissoesEfetivas {
  if (!(PAPEIS as readonly string[]).includes(papel)) return semAcessoNenhum();
  const perfil = PERFIS[papel as Papel];
  const efetivas = copiar(perfil);
  if (ajustesBrutos === null || ajustesBrutos === undefined) return normalizar(efetivas);

  const lido = ajustesPermissaoSchema.safeParse(ajustesBrutos);
  if (!lido.success) {
    if (papel === "ADMIN") return { ...normalizar(efetivas), ajustesInvalidos: true };
    return semAcessoNenhum();
  }
  for (const m of MODULOS) {
    const a = lido.data.modulos?.[m];
    if (a) efetivas.modulos[m] = { nivel: a.nivel, destrutivo: a.destrutivo ?? false };
  }
  if (lido.data.verValores !== undefined) efetivas.verValores = lido.data.verValores;
  if (lido.data.verCustoMargem !== undefined) efetivas.verCustoMargem = lido.data.verCustoMargem;
  return normalizar(efetivas);
}

// ---------------------------------------------------------------------------------------------------------------------
// Consultas simples
// ---------------------------------------------------------------------------------------------------------------------

export function podeVerModulo(p: PermissoesEfetivas, modulo: Modulo): boolean {
  return p.modulos[modulo].nivel !== "SEM_ACESSO";
}
export function podeAlterarModulo(p: PermissoesEfetivas, modulo: Modulo): boolean {
  return p.modulos[modulo].nivel === "ALTERAR";
}
export function podeDestruirNoModulo(p: PermissoesEfetivas, modulo: Modulo): boolean {
  const x = p.modulos[modulo];
  return x.nivel === "ALTERAR" && x.destrutivo;
}

/** Administrador = quem altera Configurações (decisão 179). É quem mexe em usuários e perfis. */
export function ehAdministrador(p: PermissoesEfetivas): boolean {
  return podeAlterarModulo(p, "CONFIGURACOES");
}

// ---------------------------------------------------------------------------------------------------------------------
// can(acao, recurso): mapeamento verbo → nível e recurso → módulo
// ---------------------------------------------------------------------------------------------------------------------

export type NivelDaAcao = "VER" | "ALTERAR" | "DESTRUTIVO";

/** Verbo da ação → nível exigido. Verbo fora desta lista é negado (falha fechada). */
export const NIVEL_DO_VERBO: Readonly<Record<string, NivelDaAcao>> = {
  ver: "VER",
  criar: "ALTERAR",
  editar: "ALTERAR",
  aprovar: "ALTERAR",
  receber: "ALTERAR",
  pagar: "ALTERAR",
  restaurar: "ALTERAR",
  ativar: "ALTERAR",
  reativar: "ALTERAR",
  "redefinir-senha": "ALTERAR",
  excluir: "DESTRUTIVO",
  estornar: "DESTRUTIVO",
  desfazer: "DESTRUTIVO",
  trocar: "DESTRUTIVO",
  desativar: "DESTRUTIVO",
  cancelar: "DESTRUTIVO",
  ajustar: "DESTRUTIVO",
  reabrir: "DESTRUTIVO",
  inativar: "DESTRUTIVO",
  reajustar: "DESTRUTIVO",
  encerrar: "DESTRUTIVO",
  descartar: "DESTRUTIVO",
};

export type Transversal = "valores" | "custo";

export type RegraDoRecurso = {
  /** Módulo dono do recurso. `QUALQUER` = basta ter o nível em algum módulo (anexos e filtros salvos, até o Bloco 5). `null` = só transversal. */
  modulo: Modulo | "QUALQUER" | null;
  /** Outros módulos que também são exigidos (todos). */
  tambem?: readonly Modulo[];
  /** Acessos transversais exigidos, em qualquer nível. */
  exige?: readonly Transversal[];
};

const m = (modulo: Modulo, extra: Omit<RegraDoRecurso, "modulo"> = {}): RegraDoRecurso => ({ modulo, ...extra });

/**
 * Recurso → módulo. Recursos marcados "legado" são nomes antigos e ambíguos que o Bloco 4 da 7C troca por nomes próprios
 * (visita, interacao-cliente, interacao-projeto, mao-de-obra, baixa-material); o mapeamento deles é provisório e conservador.
 */
export const RECURSO: Readonly<Record<string, RegraDoRecurso>> = {
  // Transversais
  valores: { modulo: null, exige: ["valores"] },
  custo: { modulo: null, exige: ["valores", "custo"] },
  // Agenda e tarefas
  evento: m("AGENDA"),
  feedAgenda: m("AGENDA"),
  tarefa: m("AGENDA"),
  medidaRascunho: m("AGENDA"),
  visita: m("AGENDA"),
  // Comercial
  projeto: m("COMERCIAL"), // legado: o Bloco 4 separa a visita (Agenda) do funil
  proposta: m("COMERCIAL"),
  aprovacao: m("COMERCIAL"),
  /** Custo de material informado e markup da proposta: só interno, exige "ver custo e margem". */
  "custo-material": m("COMERCIAL", { exige: ["custo"] }),
  "interacao-projeto": m("COMERCIAL"),
  // Clientes
  cliente: m("CLIENTES"),
  contato: m("CLIENTES"),
  endereco: m("CLIENTES"),
  "interacao-cliente": m("CLIENTES"),
  // Obras
  obra: m("OBRAS"),
  chamado: m("OBRAS"),
  /** Autorização de uso de imagem do cliente e publicação no portfólio: marketing, então exige também Comercial (o Campo só tira a foto). */
  "portfolio-obra": m("OBRAS", { tambem: ["COMERCIAL"] }),
  /** Gerar a cobrança da visita de assistência: cria dinheiro a receber, então exige "ver valores". */
  "cobranca-chamado": m("OBRAS", { exige: ["valores"] }),
  // Financeiro
  contaFinanceira: m("FINANCEIRO"),
  lancamento: m("FINANCEIRO"),
  contaPagar: m("FINANCEIRO"),
  contaReceber: m("FINANCEIRO"),
  recorrencia: m("FINANCEIRO"),
  // Estoque e compras
  compra: m("ESTOQUE"),
  movimentoEstoque: m("ESTOQUE"),
  retalho: m("ESTOQUE"),
  sucata: m("ESTOQUE"),
  produto: m("ESTOQUE"),
  precoKg: m("ESTOQUE", { exige: ["custo"] }),
  // Cadastros
  fornecedor: m("CADASTROS"),
  funcionario: m("CADASTROS"),
  equipe: m("CADASTROS"),
  tipologia: m("CADASTROS"),
  "desenho-tipologia": m("CADASTROS"),
  "tipologia-de-proposta": m("CADASTROS", { tambem: ["COMERCIAL"] }),
  composicao: m("CADASTROS", { exige: ["custo"] }),
  "preco-tipologia": m("CADASTROS", { exige: ["valores"] }),
  catalogo: m("CADASTROS"),
  "condicao-pagamento": m("CADASTROS"),
  // Configurações
  configuracao: m("CONFIGURACOES"), // legado: mão de obra tem recurso próprio
  "mao-de-obra": m("CONFIGURACOES", { exige: ["custo"] }),
  usuario: m("CONFIGURACOES"),
  feriado: m("CONFIGURACOES"),
  "modelo-texto": m("CONFIGURACOES"),
  "modelo-etapas": m("CONFIGURACOES"),
  importacao: m("CONFIGURACOES"),
  // De qualquer módulo: o Bloco 5 passa a decidir pelo módulo da entidade dona do anexo
  anexo: { modulo: "QUALQUER" },
  filtro: { modulo: "QUALQUER" },
};

function atende(p: PermissoesEfetivas, modulo: Modulo, nivel: NivelDaAcao): boolean {
  if (nivel === "VER") return podeVerModulo(p, modulo);
  if (nivel === "ALTERAR") return podeAlterarModulo(p, modulo);
  return podeDestruirNoModulo(p, modulo);
}

/** Resposta única de "pode `acao` em `recurso`?". Qualquer coisa desconhecida é negada. */
export function decidir(p: PermissoesEfetivas, acao: string, recurso: string | undefined): boolean {
  const nivel = NIVEL_DO_VERBO[acao];
  if (!nivel || !recurso) return false;
  const regra = RECURSO[recurso];
  if (!regra) return false;
  for (const t of regra.exige ?? []) {
    if (t === "valores" && !p.verValores) return false;
    if (t === "custo" && !p.verCustoMargem) return false;
  }
  if (regra.modulo === null) return nivel === "VER";
  if (regra.modulo === "QUALQUER") return MODULOS.some((x) => x !== "PAINEL" && atende(p, x, nivel));
  return [regra.modulo, ...(regra.tambem ?? [])].every((x) => atende(p, x, nivel));
}
