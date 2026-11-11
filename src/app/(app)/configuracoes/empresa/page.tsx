import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { FormEmpresa, LogoEmpresa } from "@/modules/configuracoes/components/form-empresa";
import { obterConfiguracao, obterMarca } from "@/modules/configuracoes/queries";
import { empresaParaFormulario } from "@/modules/configuracoes/schemas/empresa";

export const metadata: Metadata = { title: "Empresa" };

export default async function PaginaEmpresa() {
  await exigirSessao();
  const [cfg, marca] = await Promise.all([obterConfiguracao(), obterMarca()]);

  const faltando: string[] = [];
  if (cfg?.aliquotaImpostoPercentual == null) faltando.push("a alíquota do Simples");
  if (cfg?.margemPadraoPercentual == null) faltando.push("a margem padrão");

  return (
    <>
      <CabecalhoPagina titulo="Empresa" descricao="Dados da empresa, metas e parâmetros que o sistema usa em todas as telas." />

      {faltando.length > 0 ? (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <span>
            Defina {faltando.join(" e ")} em <strong>Preços e metas</strong>. Sem isso o sistema não calcula preço por composição nem margem.
          </span>
        </p>
      ) : null}

      <div className="grid gap-6">
        <LogoEmpresa logoUrl={marca.logoUrl} />
        <FormEmpresa
          valores={empresaParaFormulario(cfg)}
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
