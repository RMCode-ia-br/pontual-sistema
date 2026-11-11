import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { obterConfiguracao } from "@/modules/configuracoes/queries";
import { FormProjeto } from "@/modules/projetos/components/form-projeto";
import { listarUsuariosAtivos } from "@/modules/tarefas/queries";

export const metadata: Metadata = { title: "Novo projeto" };

export default async function PaginaNovoProjeto({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const usuario = await exigirSessao();
  const { cliente: clienteId } = await searchParams;

  // Vindo da ficha do cliente (?cliente=ID): já chega com o cliente escolhido.
  const clienteInicial =
    clienteId && /^[\w-]{1,64}$/.test(clienteId) ? await prisma.cliente.findFirst({ where: { id: clienteId, deletadoEm: null }, select: { id: true, nome: true } }) : null;
  const [usuarios, config] = await Promise.all([listarUsuariosAtivos(), obterConfiguracao()]);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/projetos" className="text-muted-foreground hover:underline">
          ← Voltar para os projetos
        </Link>
      </p>
      <CabecalhoPagina titulo="Novo projeto" descricao="Informe o cliente e o que ele precisa. O resto você completa conforme conversa com ele." />
      <div className="max-w-3xl">
        <FormProjeto
          usuarios={usuarios}
          usuarioAtualId={usuario.id}
          clienteInicial={clienteInicial}
          faixasDePorte={{ medioMinimoCentavos: config?.porteMedioMinimoCentavos ?? null, grandeMinimoCentavos: config?.porteGrandeMinimoCentavos ?? null }}
        />
      </div>
    </>
  );
}
