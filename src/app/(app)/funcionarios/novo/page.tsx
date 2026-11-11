import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { FormFuncionario } from "@/modules/funcionarios/components/form-funcionario";
import { listarUsuariosParaVinculo } from "@/modules/funcionarios/queries";

export const metadata: Metadata = { title: "Novo funcionário" };

export default async function PaginaNovoFuncionario() {
  await exigirSessao();
  const usuarios = await listarUsuariosParaVinculo();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/funcionarios" className="text-muted-foreground hover:underline">
          ← Voltar para os funcionários
        </Link>
      </p>
      <CabecalhoPagina titulo="Novo funcionário" descricao="Só o nome e a função são obrigatórios." />
      <div className="max-w-3xl">
        <FormFuncionario usuarios={usuarios} />
      </div>
    </>
  );
}
