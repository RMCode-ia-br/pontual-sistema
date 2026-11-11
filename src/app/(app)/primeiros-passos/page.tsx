import { CheckCircle2, Circle, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import { obterConfiguracao } from "@/modules/configuracoes/queries";

export const metadata: Metadata = { title: "Primeiros passos" };

type Passo = {
  titulo: string;
  descricao: string;
  href?: string;
  /** true/false = verificado pelo sistema; null = não dá para verificar; undefined com `fase` = ainda não existe. */
  feito: boolean | null;
  fase?: number;
};

export default async function PaginaPrimeirosPassos() {
  await exigirSessao();

  const [cfg, admin, outrosAtivos, fornecedoresCompletos, produtosComCusto, funcionarios, clientes, projetos] = await Promise.all([
    obterConfiguracao(),
    prisma.usuario.findFirst({ where: { login: "admin", deletadoEm: null }, select: { precisaTrocarSenha: true, ativo: true } }),
    prisma.usuario.count({ where: { ativo: true, deletadoEm: null, login: { not: "admin" } } }),
    prisma.fornecedor.count({ where: { deletadoEm: null, telefone: { not: null } } }),
    prisma.produto.count({ where: { deletadoEm: null, custoUnitarioCentavos: { not: null } } }),
    prisma.funcionario.count({ where: { deletadoEm: null } }),
    prisma.cliente.count({ where: { deletadoEm: null } }),
    prisma.projeto.count({ where: { deletadoEm: null } }),
  ]);

  const empresaCompleta = !!(cfg?.razaoSocial && cfg?.cnpj && cfg?.endereco && cfg?.telefone);

  const passos: Passo[] = [
    {
      titulo: "Trocar a senha do usuário inicial",
      descricao: "O usuário “admin” foi criado com uma senha provisória. Troque-a ou, depois de cadastrar as pessoas, desative esse usuário.",
      href: "/configuracoes/usuarios",
      feito: !admin || !admin.ativo || !admin.precisaTrocarSenha,
    },
    {
      titulo: "Cadastrar quem vai usar o sistema",
      descricao: "Crie o usuário de cada pessoa da gestão (Marcelo e Luan). Cada um define a própria senha no primeiro acesso.",
      href: "/configuracoes/usuarios",
      feito: outrosAtivos >= 2,
    },
    {
      titulo: "Conferir os dados da empresa",
      descricao: "Razão social, CNPJ, endereço (confirme o número) e telefone aparecem nas propostas.",
      href: "/configuracoes/empresa",
      feito: empresaCompleta,
    },
    {
      titulo: "Definir a alíquota do Simples",
      descricao: "Será usada no custo real de cada obra. Combine o valor com o contador. O markup (80%) e o acréscimo da nota (5%) já vêm preenchidos e ficam na mesma tela.",
      href: "/configuracoes/empresa",
      feito: cfg?.aliquotaImpostoPercentual != null,
    },
    {
      titulo: "Enviar o logo",
      descricao: "Aparece no menu e nos PDFs das propostas.",
      href: "/configuracoes/empresa",
      feito: !!cfg?.logoCaminho,
    },
    {
      titulo: "Cadastrar os feriados de Macaé e as férias coletivas",
      descricao: "O sistema já traz os feriados nacionais. Acrescente os municipais e as férias dos fornecedores (dezembro e Carnaval).",
      href: "/configuracoes/feriados",
      feito: null,
    },
    {
      titulo: "Revisar os catálogos",
      descricao: "Linhas, acabamentos, tipos de vidro e motivos de perda já vêm prontos. Ajuste ao jeito da Pontual.",
      href: "/configuracoes/catalogos",
      feito: null,
    },
    {
      titulo: "Completar os dados dos fornecedores",
      descricao: "Os fornecedores principais já vêm cadastrados só com o nome. Preencha contato, prazo de entrega e condições de pagamento.",
      href: "/fornecedores",
      feito: fornecedoresCompletos > 0,
    },
    {
      titulo: "Cadastrar ou importar os produtos e os custos",
      descricao: "Perfis, vidros e ferragens com o custo de cada um. Dá para importar uma planilha. Sem custo, o sistema não calcula preço.",
      href: "/produtos",
      feito: produtosComCusto > 0,
    },
    {
      titulo: "Cadastrar os funcionários e as equipes de instalação",
      descricao: "Quem trabalha na Pontual e como se organizam as equipes.",
      href: "/funcionarios",
      feito: funcionarios > 0,
    },
    {
      titulo: "Cadastrar os clientes",
      descricao: "Um a um, ou importando uma planilha. A busca (Ctrl+K) já acha qualquer cliente pelo nome, telefone ou CPF.",
      href: "/clientes",
      feito: clientes > 0,
    },
    {
      titulo: "Criar o primeiro projeto e agendar uma visita",
      descricao: "Cada pedido de orçamento vira um projeto no funil. Agende a visita técnica pela ficha do projeto: ela aparece na Agenda e no seu Google Agenda.",
      href: "/projetos/novo",
      feito: projetos > 0,
    },
    {
      titulo: "Cadastrar a primeira tipologia e a tabela de preços",
      descricao: "Disponível na fase de propostas.",
      feito: false,
      fase: 3,
    },
  ];

  const verificaveis = passos.filter((p) => p.feito !== null && !p.fase);
  const concluidos = verificaveis.filter((p) => p.feito).length;

  return (
    <>
      <CabecalhoPagina titulo="Primeiros passos" descricao="O que configurar para começar a usar o sistema com segurança." />

      <p className="mb-4 text-sm" role="status">
        <strong>
          {concluidos} de {verificaveis.length}
        </strong>{" "}
        passos concluídos.
      </p>

      <ol className="divide-y rounded-xl border">
        {passos.map((p) => {
          const Icone = p.fase ? Clock : p.feito ? CheckCircle2 : Circle;
          const conteudo = (
            <>
              <Icone className={cn("mt-0.5 size-5 shrink-0", p.feito ? "text-primary" : "text-muted-foreground")} aria-hidden />
              <div className="min-w-0">
                <p className={cn("text-sm font-medium", p.feito && "text-muted-foreground line-through")}>
                  {p.titulo}
                  {p.fase ? <span className="bg-muted ml-2 rounded px-1.5 py-0.5 text-[10px] font-normal no-underline">Em breve</span> : null}
                  {p.feito === null ? <span className="text-muted-foreground ml-2 text-[10px] font-normal no-underline">revisão manual</span> : null}
                </p>
                <p className="text-muted-foreground text-sm">{p.descricao}</p>
              </div>
            </>
          );
          return (
            <li key={p.titulo}>
              {p.href && !p.fase ? (
                <Link href={p.href} className="hover:bg-accent flex gap-3 p-4">
                  {conteudo}
                  <span className="sr-only">{p.feito ? " (concluído)" : " (pendente)"}</span>
                </Link>
              ) : (
                <div className="flex gap-3 p-4">{conteudo}</div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
