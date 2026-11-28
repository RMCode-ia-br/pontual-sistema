import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirModulo } from "@/lib/auth/modulo";
import { prisma } from "@/lib/db";
import { FormTarefa } from "@/modules/tarefas/components/form-tarefa";
import { listarUsuariosAtivos } from "@/modules/tarefas/queries";

export const metadata: Metadata = { title: "Nova tarefa" };

export default async function PaginaNovaTarefa({ searchParams }: { searchParams: Promise<{ projeto?: string }> }) {
  const usuario = await exigirModulo("AGENDA", { nivel: "alterar" });
  const { projeto: projetoId } = await searchParams;
  const projeto = projetoId && /^[\w-]{1,64}$/.test(projetoId) ? await prisma.projeto.findFirst({ where: { id: projetoId, deletadoEm: null }, select: { id: true, codigo: true, titulo: true } }) : null;
  const usuarios = await listarUsuariosAtivos();

  return (
    <>
      <CabecalhoPagina titulo="Nova tarefa" descricao="Anote o que precisa ser feito e quem cuida disso." />
      <div className="max-w-2xl">
        <FormTarefa
          usuarios={usuarios}
          usuarioAtualId={usuario.id}
          aoCriar="voltar"
          projeto={projeto ? { id: projeto.id, rotulo: `${projeto.codigo} · ${projeto.titulo}` } : undefined}
          voltarPara={projeto ? `/projetos/${projeto.id}?aba=tarefas` : undefined}
        />
      </div>
    </>
  );
}
