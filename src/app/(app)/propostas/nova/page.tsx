import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { EscolherProjeto } from "@/modules/propostas/components/escolher-projeto";
import { listarProjetosParaProposta } from "@/modules/propostas/queries";

export const metadata: Metadata = { title: "Nova proposta" };

export default async function PaginaNovaProposta({ searchParams }: { searchParams: Promise<{ projeto?: string }> }) {
  await exigirSessao();
  const { projeto } = await searchParams;
  const projetos = await listarProjetosParaProposta();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/propostas" className="text-muted-foreground hover:underline">
          ← Voltar para as propostas
        </Link>
      </p>
      <CabecalhoPagina titulo="Nova proposta" descricao="Toda proposta nasce de um projeto. Se o cliente ainda não tem projeto, crie um primeiro (Comercial → Projetos)." />
      {projetos.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Não há projetos abertos no funil. <Link href="/projetos/novo" className="text-primary underline">Criar um projeto</Link>.
        </p>
      ) : (
        <EscolherProjeto projetos={projetos.map((p) => ({ id: p.id, codigo: p.codigo, titulo: p.titulo, cliente: p.cliente.nome }))} inicial={projeto} />
      )}
    </>
  );
}
