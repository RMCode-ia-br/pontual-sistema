import {
  BarChart3,
  BookOpen,
  Briefcase,
  CalendarDays,
  CheckSquare,
  FolderKanban,
  HardHat,
  HelpCircle,
  LayoutDashboard,
  Package,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { Modulo, PermissoesEfetivas } from "@/lib/dominio/permissoes";

/** O que o menu precisa saber das permissões (dados simples: atravessa servidor → cliente sem função). */
export type PermissoesDoMenu = Pick<PermissoesEfetivas, "modulos" | "verValores" | "verCustoMargem">;

export type ItemMenu = {
  titulo: string;
  /** Sem `href` = ainda não existe (aparece desabilitado com "Em breve"). */
  href?: string;
  fase?: number;
  /** Módulo que dá acesso ao item (Fase 7C). Item sem módulo (Ajuda) aparece sempre. */
  modulo?: Modulo;
  /** Acesso transversal que o item também exige. */
  exige?: "valores" | "custo";
};

export type GrupoMenu = {
  titulo: string;
  icone: LucideIcon;
  href?: string;
  /** Módulo do link direto do grupo (grupos com `itens` usam o módulo de cada item). */
  modulo?: Modulo;
  itens?: ItemMenu[];
};

/** Menu da especificação (seção 7). Telas de fases futuras ficam desabilitadas, sem tela falsa. */
export const MENU: GrupoMenu[] = [
  { titulo: "Painel", icone: LayoutDashboard, href: "/", modulo: "PAINEL" },
  {
    titulo: "Agenda e tarefas",
    icone: CalendarDays,
    itens: [
      { titulo: "Agenda", href: "/agenda", modulo: "AGENDA" },
      { titulo: "Tarefas", href: "/tarefas", modulo: "AGENDA" },
    ],
  },
  {
    titulo: "Comercial",
    icone: Briefcase,
    itens: [
      { titulo: "Funil", href: "/funil", modulo: "COMERCIAL", exige: "valores" },
      { titulo: "Projetos", href: "/projetos", modulo: "COMERCIAL", exige: "valores" },
      { titulo: "Propostas", href: "/propostas", modulo: "COMERCIAL", exige: "valores" },
    ],
  },
  {
    titulo: "Clientes",
    icone: Users,
    itens: [
      { titulo: "Clientes", href: "/clientes", modulo: "CLIENTES" },
      { titulo: "Parceiros", href: "/parceiros", modulo: "CLIENTES" },
    ],
  },
  {
    titulo: "Obras",
    icone: HardHat,
    itens: [
      { titulo: "Em andamento", href: "/obras", modulo: "OBRAS" },
      { titulo: "Calendário de instalação", href: "/obras/calendario", modulo: "OBRAS" },
      { titulo: "Assistência e garantia", href: "/obras/assistencia", modulo: "OBRAS" },
      { titulo: "Galeria de obras", href: "/obras/galeria", modulo: "OBRAS" },
    ],
  },
  {
    titulo: "Financeiro",
    icone: Wallet,
    itens: [
      { titulo: "Visão geral e fluxo de caixa", href: "/financeiro", modulo: "FINANCEIRO" },
      { titulo: "A receber", href: "/financeiro/receber", modulo: "FINANCEIRO" },
      { titulo: "A pagar", href: "/financeiro/pagar", modulo: "FINANCEIRO" },
      { titulo: "Contas e lançamentos", href: "/financeiro/contas", modulo: "FINANCEIRO" },
    ],
  },
  {
    titulo: "Estoque e compras",
    icone: Package,
    itens: [
      { titulo: "Produtos", href: "/produtos", modulo: "ESTOQUE" },
      { titulo: "Preço do kg do alumínio", href: "/estoque/preco-do-kg", modulo: "ESTOQUE", exige: "custo" },
      { titulo: "Movimentações", href: "/estoque/movimentacoes", modulo: "ESTOQUE" },
      { titulo: "Retalhos e sucata", href: "/estoque/retalhos", modulo: "ESTOQUE" },
      { titulo: "Compras", href: "/compras", modulo: "ESTOQUE" },
    ],
  },
  {
    titulo: "Cadastros",
    icone: BookOpen,
    itens: [
      { titulo: "Fornecedores", href: "/fornecedores", modulo: "CADASTROS" },
      { titulo: "Funcionários e equipes", href: "/funcionarios", modulo: "CADASTROS" },
      { titulo: "Tipologias e preços", href: "/tipologias", modulo: "CADASTROS" },
      { titulo: "Catálogos", href: "/configuracoes/catalogos", modulo: "CADASTROS" },
      { titulo: "Condições de pagamento", href: "/configuracoes/condicoes-pagamento", modulo: "CADASTROS" },
      { titulo: "Lixeira", href: "/lixeira", modulo: "CADASTROS" },
    ],
  },
  { titulo: "Relatórios", icone: BarChart3, href: "/relatorios", modulo: "RELATORIOS" },
  {
    titulo: "Configurações",
    icone: Settings,
    itens: [
      { titulo: "Empresa", href: "/configuracoes/empresa", modulo: "CONFIGURACOES" },
      { titulo: "Usuários", href: "/configuracoes/usuarios", modulo: "CONFIGURACOES" },
      { titulo: "Modelos de texto", href: "/configuracoes/modelos-texto", modulo: "CONFIGURACOES" },
      { titulo: "Feriados e férias", href: "/configuracoes/feriados", modulo: "CONFIGURACOES" },
      { titulo: "Modelo de etapas", href: "/configuracoes/modelo-etapas", modulo: "CONFIGURACOES" },
      { titulo: "Integrações/API", fase: 8, modulo: "CONFIGURACOES" },
      { titulo: "Importação", href: "/configuracoes/importacao", modulo: "CONFIGURACOES" },
      { titulo: "Auditoria", href: "/configuracoes/auditoria", modulo: "CONFIGURACOES" },
      { titulo: "Backup e saúde", href: "/configuracoes/backup", modulo: "CONFIGURACOES" },
    ],
  },
  { titulo: "Ajuda", icone: HelpCircle, href: "/primeiros-passos", modulo: "CONFIGURACOES" },
];

/** Candidatos da barra inferior no celular, em ordem de prioridade; a barra mostra até `LIMITE_DA_BARRA_CELULAR` que a pessoa pode ver. */
const CANDIDATOS_CELULAR = [
  { titulo: "Painel", href: "/", icone: LayoutDashboard, modulo: "PAINEL" },
  { titulo: "Funil", href: "/funil", icone: FolderKanban, modulo: "COMERCIAL", exige: "valores" },
  { titulo: "Agenda", href: "/agenda", icone: CalendarDays, modulo: "AGENDA" },
  { titulo: "Tarefas", href: "/tarefas", icone: CheckSquare, modulo: "AGENDA" },
  { titulo: "Obras", href: "/obras", icone: HardHat, modulo: "OBRAS" },
] as const satisfies readonly { titulo: string; href: string; icone: LucideIcon; modulo: Modulo; exige?: "valores" | "custo" }[];

export const LIMITE_DA_BARRA_CELULAR = 4;

/** O módulo (e o acesso transversal) está liberado para estas permissões? Sem `modulo` = livre. */
function liberado(p: PermissoesDoMenu, modulo?: Modulo, exige?: "valores" | "custo"): boolean {
  if (modulo && p.modulos[modulo].nivel === "SEM_ACESSO") return false;
  if (exige === "valores" && !p.verValores) return false;
  if (exige === "custo" && !p.verCustoMargem) return false;
  return true;
}

/** Menu só com o que a pessoa pode ver. Grupo sem nenhum item liberado some. */
export function menuVisivel(p: PermissoesDoMenu): GrupoMenu[] {
  const saida: GrupoMenu[] = [];
  for (const g of MENU) {
    if (g.itens) {
      const itens = g.itens.filter((i) => liberado(p, i.modulo, i.exige));
      if (itens.length > 0) saida.push({ ...g, itens });
    } else if (liberado(p, g.modulo)) {
      saida.push(g);
    }
  }
  return saida;
}

/** Atalhos da barra inferior no celular para estas permissões. */
export function menuCelularVisivel(p: PermissoesDoMenu) {
  return CANDIDATOS_CELULAR.filter((c) => liberado(p, c.modulo, "exige" in c ? c.exige : undefined)).slice(0, LIMITE_DA_BARRA_CELULAR);
}

export function rotaAtiva(caminhoAtual: string, href: string): boolean {
  if (href === "/") return caminhoAtual === "/";
  return caminhoAtual === href || caminhoAtual.startsWith(`${href}/`);
}

const HREFS_DO_MENU: string[] = MENU.flatMap((g) => [g.href, ...(g.itens ?? []).map((i) => i.href)]).filter((h): h is string => !!h);

/**
 * Item do menu realçado: a rota casa e nenhum outro item MAIS específico dentro dele também casa
 * (ex.: em /obras/calendario só "Calendário de instalação" fica ativo, e não também "Em andamento").
 */
export function itemAtivo(caminhoAtual: string, href: string): boolean {
  if (!rotaAtiva(caminhoAtual, href)) return false;
  return !HREFS_DO_MENU.some((outro) => outro !== href && outro.startsWith(`${href}/`) && rotaAtiva(caminhoAtual, outro));
}

/** Páginas que a pessoa pode abrir, para a busca global (Ctrl+K). */
export function paginasDisponiveis(p: PermissoesDoMenu): { titulo: string; grupo: string; href: string }[] {
  const lista: { titulo: string; grupo: string; href: string }[] = [];
  for (const g of menuVisivel(p)) {
    if (g.href) lista.push({ titulo: g.titulo, grupo: "Páginas", href: g.href });
    for (const i of g.itens ?? []) {
      if (i.href) lista.push({ titulo: i.titulo, grupo: g.titulo, href: i.href });
    }
  }
  lista.push({ titulo: "Trocar senha", grupo: "Perfil", href: "/trocar-senha" });
  return lista;
}
