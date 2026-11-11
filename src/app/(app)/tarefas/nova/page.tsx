import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { FormTarefa } from "@/modules/tarefas/components/form-tarefa";
import { listarUsuariosAtivos } from "@/modules/tarefas/queries";

export const metadata: Metadata = { title: "Nova tarefa" };

export default async function PaginaNovaTarefa() {
  const usuario = await exigirSessao();
  const usuarios = await listarUsuariosAtivos();

  return (
    <>
      <CabecalhoPagina titulo="Nova tarefa" descricao="Anote o que precisa ser feito e quem cuida disso." />
      <div className="max-w-2xl">
        <FormTarefa usuarios={usuarios} usuarioAtualId={usuario.id} aoCriar="voltar" />
      </div>
    </>
  );
}
