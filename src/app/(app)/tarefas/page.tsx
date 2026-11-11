import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { cn } from "@/lib/utils";
import { FormTarefa } from "@/modules/tarefas/components/form-tarefa";
import { ListaTarefas } from "@/modules/tarefas/components/lista-tarefas";
import { listarTarefas, listarUsuariosAtivos } from "@/modules/tarefas/queries";
import { lerFiltroStatus } from "@/modules/tarefas/schemas";

export const metadata: Metadata = { title: "Tarefas" };

const ABAS = [
  { valor: "abertas", titulo: "Abertas" },
  { valor: "concluidas", titulo: "Concluídas" },
  { valor: "todas", titulo: "Todas" },
] as const;

export default async function PaginaTarefas({ searchParams }: { searchParams: Promise<{ status?: string; quem?: string }> }) {
  const usuario = await exigirSessao();
  const { status: statusBruto, quem } = await searchParams;
  const status = lerFiltroStatus(statusBruto);
  const soMinhas = quem === "minhas";

  const [tarefas, usuarios] = await Promise.all([
    listarTarefas({ status, responsavelId: soMinhas ? usuario.id : undefined }),
    listarUsuariosAtivos(),
  ]);

  const href = (s: string, q: boolean) => `/tarefas?status=${s}${q ? "&quem=minhas" : ""}`;
  const vencidas = tarefas.filter((t) => t.vencida).length;

  return (
    <>
      <CabecalhoPagina
        titulo="Tarefas"
        descricao={vencidas > 0 ? `${vencidas} ${vencidas === 1 ? "tarefa vencida" : "tarefas vencidas"} pedindo atenção.` : "O que precisa ser feito, por quem e até quando."}
      />

      <div className="mb-6">
        <FormTarefa usuarios={usuarios} usuarioAtualId={usuario.id} aoCriar="limpar" />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filtro de status" className="flex gap-1">
          {ABAS.map((aba) => (
            <Link
              key={aba.valor}
              href={href(aba.valor, soMinhas)}
              aria-current={status === aba.valor ? "page" : undefined}
              className={cn("inline-flex min-h-9 items-center rounded-full border px-3 text-sm", status === aba.valor ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")}
            >
              {aba.titulo}
            </Link>
          ))}
        </nav>
        <Link href={href(status, !soMinhas)} aria-pressed={soMinhas} className={cn("inline-flex min-h-9 items-center rounded-full border px-3 text-sm", soMinhas ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")}>
          Só as minhas
        </Link>
      </div>

      <ListaTarefas tarefas={tarefas} vazioPorFiltro={status !== "abertas" || soMinhas} />
    </>
  );
}
