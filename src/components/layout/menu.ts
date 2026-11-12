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

export type ItemMenu = {
  titulo: string;
  /** Sem `href` = ainda não existe (aparece desabilitado com "Em breve"). */
  href?: string;
  fase?: number;
};

export type GrupoMenu = {
  titulo: string;
  icone: LucideIcon;
  href?: string;
  itens?: ItemMenu[];
};

/** Menu da especificação (seção 7). Telas de fases futuras ficam desabilitadas, sem tela falsa. */
export const MENU: GrupoMenu[] = [
  { titulo: "Painel", icone: LayoutDashboard, href: "/" },
  {
    titulo: "Comercial",
    icone: Briefcase,
    itens: [
      { titulo: "Funil", href: "/funil" },
      { titulo: "Projetos", href: "/projetos" },
      { titulo: "Propostas", href: "/propostas" },
      { titulo: "Agenda", href: "/agenda" },
      { titulo: "Tarefas", href: "/tarefas" },
    ],
  },
  {
    titulo: "Clientes",
    icone: Users,
    itens: [
      { titulo: "Clientes", href: "/clientes" },
      { titulo: "Parceiros", href: "/parceiros" },
    ],
  },
  {
    titulo: "Obras",
    icone: HardHat,
    itens: [
      { titulo: "Em andamento", href: "/obras" },
      { titulo: "Calendário de instalação", href: "/obras/calendario" },
      { titulo: "Assistência e garantia", fase: 4 },
      { titulo: "Galeria de obras", href: "/obras/galeria" },
    ],
  },
  {
    titulo: "Financeiro",
    icone: Wallet,
    itens: [
      { titulo: "Visão geral e fluxo de caixa", fase: 5 },
      { titulo: "A receber", fase: 5 },
      { titulo: "A pagar", fase: 5 },
      { titulo: "Contas e lançamentos", fase: 5 },
      { titulo: "Notas fiscais", fase: 5 },
    ],
  },
  {
    titulo: "Estoque e compras",
    icone: Package,
    itens: [
      { titulo: "Produtos", href: "/produtos" },
      { titulo: "Movimentações", fase: 6 },
      { titulo: "Retalhos", fase: 6 },
      { titulo: "Compras", fase: 6 },
    ],
  },
  {
    titulo: "Cadastros",
    icone: BookOpen,
    itens: [
      { titulo: "Fornecedores", href: "/fornecedores" },
      { titulo: "Funcionários e equipes", href: "/funcionarios" },
      { titulo: "Tipologias e preços", href: "/tipologias" },
      { titulo: "Catálogos", href: "/configuracoes/catalogos" },
      { titulo: "Lixeira", href: "/lixeira" },
    ],
  },
  { titulo: "Relatórios", icone: BarChart3, href: "/relatorios" },
  {
    titulo: "Configurações",
    icone: Settings,
    itens: [
      { titulo: "Empresa", href: "/configuracoes/empresa" },
      { titulo: "Usuários", href: "/configuracoes/usuarios" },
      { titulo: "Modelos de texto", href: "/configuracoes/modelos-texto" },
      { titulo: "Feriados e férias", href: "/configuracoes/feriados" },
      { titulo: "Condições de pagamento", href: "/configuracoes/condicoes-pagamento" },
      { titulo: "Modelo de etapas", href: "/configuracoes/modelo-etapas" },
      { titulo: "Integrações/API", fase: 8 },
      { titulo: "Importação", href: "/configuracoes/importacao" },
      { titulo: "Auditoria", href: "/configuracoes/auditoria" },
      { titulo: "Backup e saúde", href: "/configuracoes/backup" },
    ],
  },
  { titulo: "Ajuda", icone: HelpCircle, href: "/primeiros-passos" },
];

/** Itens fixos da barra inferior no celular (o resto fica em "Mais"). */
export const MENU_CELULAR = [
  { titulo: "Painel", href: "/", icone: LayoutDashboard },
  { titulo: "Funil", href: "/funil", icone: FolderKanban },
  { titulo: "Agenda", href: "/agenda", icone: CalendarDays },
  { titulo: "Tarefas", href: "/tarefas", icone: CheckSquare },
] as const;

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

/** Todas as páginas existentes, para a busca global (Ctrl+K). */
export function paginasDisponiveis(): { titulo: string; grupo: string; href: string }[] {
  const lista: { titulo: string; grupo: string; href: string }[] = [];
  for (const g of MENU) {
    if (g.href) lista.push({ titulo: g.titulo, grupo: "Páginas", href: g.href });
    for (const i of g.itens ?? []) {
      if (i.href) lista.push({ titulo: i.titulo, grupo: g.titulo, href: i.href });
    }
  }
  lista.push({ titulo: "Trocar senha", grupo: "Perfil", href: "/trocar-senha" });
  return lista;
}
