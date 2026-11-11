import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AcoesDoCadastro } from "@/components/acoes-do-cadastro";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { exigirSessao } from "@/lib/auth/sessao";
import { formatarDataCalendario, formatarTelefone } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { formatarCpf } from "@/lib/validadores";
import { Anexos } from "@/modules/anexos/components/anexos";
import { listarAnexos } from "@/modules/anexos/queries";
import { excluirFuncionarios, inativarFuncionarios, reativarFuncionarios } from "@/modules/funcionarios/actions/funcionarios";
import { FormFuncionario } from "@/modules/funcionarios/components/form-funcionario";
import { listarUsuariosParaVinculo, obterFuncionario } from "@/modules/funcionarios/queries";
import { ROTULO_FUNCAO } from "@/modules/funcionarios/schemas";

export const metadata: Metadata = { title: "Funcionário" };

const ABAS = [
  { valor: "dados", titulo: "Dados" },
  { valor: "anexos", titulo: "Arquivos" },
] as const;

export default async function PaginaFuncionario({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  await exigirSessao();
  const { id } = await params;
  const { aba: abaBruta } = await searchParams;

  const funcionario = await obterFuncionario(id);
  if (!funcionario) notFound();
  const aba = ABAS.find((a) => a.valor === abaBruta)?.valor ?? "dados";

  const descricao = [
    ROTULO_FUNCAO[funcionario.funcao],
    funcionario.cargo,
    funcionario.cpf ? formatarCpf(funcionario.cpf) : null,
    funcionario.telefone ? formatarTelefone(funcionario.telefone) : null,
    funcionario.admissaoEm ? `Admitido em ${formatarDataCalendario(funcionario.admissaoEm)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/funcionarios" className="text-muted-foreground hover:underline">
          ← Voltar para os funcionários
        </Link>
      </p>
      <CabecalhoPagina
        titulo={funcionario.nome}
        descricao={descricao}
        acoes={
          <AcoesDoCadastro
            id={funcionario.id}
            nome={funcionario.nome}
            ativo={funcionario.ativo}
            voltarPara="/funcionarios"
            inativar={inativarFuncionarios}
            reativar={reativarFuncionarios}
            excluir={excluirFuncionarios}
            preservado="Ele sai das equipes enquanto estiver na lixeira."
          />
        }
      />
      {funcionario.ativo ? null : (
        <div className="mb-4">
          <Badge variant="destructive">Inativo</Badge>
        </div>
      )}

      <nav aria-label="Seções do funcionário" className="mb-6 flex gap-1 overflow-x-auto border-b">
        {ABAS.map((a) => (
          <Link
            key={a.valor}
            href={`/funcionarios/${funcionario.id}?aba=${a.valor}`}
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
        {aba === "dados" ? <FormFuncionario funcionario={funcionario} usuarios={await listarUsuariosParaVinculo(funcionario.id)} /> : null}
        {aba === "anexos" ? <Anexos entidadeTipo="Funcionario" entidadeId={funcionario.id} anexos={await listarAnexos("Funcionario", funcionario.id)} titulo="Arquivos do funcionário" /> : null}
      </div>
    </>
  );
}
