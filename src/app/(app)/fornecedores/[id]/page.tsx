import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AcoesDoCadastro } from "@/components/acoes-do-cadastro";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { exigirSessao } from "@/lib/auth/sessao";
import { formatarData, formatarTelefone } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { formatarCnpj } from "@/lib/validadores";
import { Anexos } from "@/modules/anexos/components/anexos";
import { listarAnexos } from "@/modules/anexos/queries";
import { excluirFornecedores, inativarFornecedores, reativarFornecedores } from "@/modules/fornecedores/actions";
import { FormFornecedor } from "@/modules/fornecedores/components/form-fornecedor";
import { listarCategoriasAtivas, obterFornecedor } from "@/modules/fornecedores/queries";

export const metadata: Metadata = { title: "Fornecedor" };

const ABAS = [
  { valor: "dados", titulo: "Dados" },
  { valor: "anexos", titulo: "Arquivos" },
] as const;

export default async function PaginaFornecedor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  await exigirSessao();
  const { id } = await params;
  const { aba: abaBruta } = await searchParams;

  const fornecedor = await obterFornecedor(id);
  if (!fornecedor) notFound();
  const aba = ABAS.find((a) => a.valor === abaBruta)?.valor ?? "dados";

  const descricao = [
    fornecedor.nomeFantasia,
    fornecedor.cnpj ? formatarCnpj(fornecedor.cnpj) : null,
    fornecedor.telefone ? formatarTelefone(fornecedor.telefone) : null,
    `Cadastrado em ${formatarData(fornecedor.criadoEm)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/fornecedores" className="text-muted-foreground hover:underline">
          ← Voltar para os fornecedores
        </Link>
      </p>
      <CabecalhoPagina
        titulo={fornecedor.razaoSocial}
        descricao={descricao}
        acoes={
          <AcoesDoCadastro
            id={fornecedor.id}
            nome={fornecedor.razaoSocial}
            ativo={fornecedor.ativo}
            voltarPara="/fornecedores"
            inativar={inativarFornecedores}
            reativar={reativarFornecedores}
            excluir={excluirFornecedores}
            preservado="Os produtos dele continuam cadastrados."
          />
        }
      />
      {fornecedor.ativo ? null : (
        <div className="mb-4">
          <Badge variant="destructive">Inativo</Badge>
        </div>
      )}

      <nav aria-label="Seções do fornecedor" className="mb-6 flex gap-1 overflow-x-auto border-b">
        {ABAS.map((a) => (
          <Link
            key={a.valor}
            href={`/fornecedores/${fornecedor.id}?aba=${a.valor}`}
            aria-current={aba === a.valor ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center border-b-2 px-3 text-sm",
              aba === a.valor ? "border-primary text-primary font-medium" : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {a.titulo}
          </Link>
        ))}
      </nav>

      <div className="max-w-3xl">
        {aba === "dados" ? <FormFornecedor fornecedor={fornecedor} categorias={await listarCategoriasAtivas()} /> : null}
        {aba === "anexos" ? <Anexos entidadeTipo="Fornecedor" entidadeId={fornecedor.id} anexos={await listarAnexos("Fornecedor", fornecedor.id)} titulo="Arquivos do fornecedor" /> : null}
      </div>
    </>
  );
}
