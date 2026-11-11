import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { formatarDataCalendario } from "@/lib/formatadores";
import { LIMITE_EXPORTACAO_FUNCIONARIOS, lerListaFuncionarios, listarFuncionariosParaExportar } from "@/modules/funcionarios/queries";
import { ROTULO_FUNCAO } from "@/modules/funcionarios/schemas";

export const dynamic = "force-dynamic";

/**
 * Exporta os funcionários com os MESMOS filtros e ordem da lista. Salário e custo por hora ficam de
 * FORA do arquivo de propósito: dado sensível que não deve circular em planilhas soltas.
 */
export async function GET(requisicao: NextRequest) {
  // Route Handlers checam a sessão por conta própria (não só o proxy).
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { parametros, filtros } = lerListaFuncionarios(Object.fromEntries(requisicao.nextUrl.searchParams));
  const { linhas, truncado } = await listarFuncionariosParaExportar(parametros, filtros);

  const registros: unknown[][] = linhas.map((f) => [
    f.nome,
    f.cargo,
    ROTULO_FUNCAO[f.funcao],
    f.telefone,
    f.email,
    f.equipes.join(", "),
    f.admissaoEm ? formatarDataCalendario(f.admissaoEm) : "",
    f.ativo ? "Ativo" : "Inativo",
  ]);
  if (truncado) registros.push([`AVISO: exportação limitada aos primeiros ${LIMITE_EXPORTACAO_FUNCIONARIOS} cadastros. Use os filtros para obter o restante.`]);
  const csv = gerarCsv(["Nome", "Cargo", "Função", "Telefone", "E-mail", "Equipes", "Admissão", "Situação"], registros);

  await registrarAuditoria(prisma, { usuario, entidade: "Funcionario", entidadeId: "exportacao", acao: "EXPORTAR", depois: { linhas: linhas.length, truncado, filtros, busca: parametros.busca } });

  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="funcionarios.csv"', "Cache-Control": "no-store" },
  });
}
