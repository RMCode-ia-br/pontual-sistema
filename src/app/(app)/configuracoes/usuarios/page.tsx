import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirModulo } from "@/lib/auth/modulo";
import { ListaUsuarios } from "@/modules/usuarios/components/lista-usuarios";
import { listarUsuarios } from "@/modules/usuarios/queries";

export const metadata: Metadata = { title: "Usuários" };

export default async function PaginaUsuarios() {
  const sessao = await exigirModulo("CONFIGURACOES");
  const usuarios = await listarUsuarios();

  return (
    <>
      <CabecalhoPagina
        titulo="Usuários"
        descricao="Quem pode entrar no sistema. Por enquanto todos veem e fazem tudo."
      />
      <ListaUsuarios usuarios={usuarios} usuarioAtualId={sessao.id} />
    </>
  );
}
