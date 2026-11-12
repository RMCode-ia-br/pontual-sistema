import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { FormEmpresa, LogoEmpresa } from "@/modules/configuracoes/components/form-empresa";
import { obterConfiguracao, obterMarca } from "@/modules/configuracoes/queries";
import { empresaParaFormulario } from "@/modules/configuracoes/schemas/empresa";

export const metadata: Metadata = { title: "Empresa" };

export default async function PaginaEmpresa() {
  await exigirSessao();
  const [cfg, marca, categoriasDeReceita] = await Promise.all([
    obterConfiguracao(),
    obterMarca(),
    prisma.categoriaFinanceira.findMany({
      where: { tipo: "RECEITA", ativo: true, deletadoEm: null },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true },
    }),
  ]);

  return (
    <>
      <CabecalhoPagina titulo="Empresa" descricao="Dados da empresa, metas e parâmetros que o sistema usa em todas as telas." />

      <div className="grid gap-6">
        <LogoEmpresa logoUrl={marca.logoUrl} />
        <FormEmpresa
          valores={empresaParaFormulario(cfg)}
          categoriasDeReceita={categoriasDeReceita}
          marcados={{
            reiniciaNumeracaoPorAno: cfg?.reiniciaNumeracaoPorAno ?? false,
            pdfExibirValorPorItem: cfg?.pdfExibirValorPorItem ?? true,
            pdfDescricoesMaiusculas: cfg?.pdfDescricoesMaiusculas ?? true,
          }}
        />
      </div>
    </>
  );
}
