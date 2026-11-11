import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { formatarData } from "@/lib/formatadores";
import { formatarCnpj } from "@/lib/validadores";
import { LIMITE_EXPORTACAO_FORNECEDORES, lerListaFornecedores, listarFornecedoresParaExportar } from "@/modules/fornecedores/queries";

export const dynamic = "force-dynamic";

/** Exporta os fornecedores com os MESMOS filtros e ordem da lista. */
export async function GET(requisicao: NextRequest) {
  // Route Handlers checam a sessão por conta própria (não só o proxy).
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { parametros, filtros } = lerListaFornecedores(Object.fromEntries(requisicao.nextUrl.searchParams));
  const { linhas, truncado } = await listarFornecedoresParaExportar(parametros, filtros);

  const registros: unknown[][] = linhas.map((f) => [
    f.razaoSocial,
    f.nomeFantasia,
    f.cnpj ? formatarCnpj(f.cnpj) : "",
    f.categorias.join(", "),
    f.vendedorNome,
    f.telefone,
    f.email,
    f.prazoEntregaDias,
    f.ativo ? "Ativo" : "Inativo",
    formatarData(f.criadoEm),
  ]);
  if (truncado) registros.push([`AVISO: exportação limitada aos primeiros ${LIMITE_EXPORTACAO_FORNECEDORES} cadastros. Use os filtros para obter o restante.`]);
  const csv = gerarCsv(["Razão social", "Nome fantasia", "CNPJ", "O que fornece", "Vendedor", "Telefone", "E-mail", "Prazo de entrega (dias)", "Situação", "Cadastrado em"], registros);

  await registrarAuditoria(prisma, { usuario, entidade: "Fornecedor", entidadeId: "exportacao", acao: "EXPORTAR", depois: { linhas: linhas.length, truncado, filtros, busca: parametros.busca } });

  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="fornecedores.csv"', "Cache-Control": "no-store" },
  });
}
