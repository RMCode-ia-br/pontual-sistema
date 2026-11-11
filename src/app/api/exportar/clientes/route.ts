import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { gerarCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { formatarData } from "@/lib/formatadores";
import { formatarCnpj, formatarCpf } from "@/lib/validadores";
import { LIMITE_EXPORTACAO_CLIENTES, lerListaClientes, listarClientesParaExportar, ROTULO_MARCACAO } from "@/modules/clientes/queries";
import { ROTULO_ORIGEM } from "@/modules/clientes/schemas";

export const dynamic = "force-dynamic";

/** Exporta os clientes com os MESMOS filtros e ordem da lista (parâmetro `parceiros=1` para a visão de parceiros). */
export async function GET(requisicao: NextRequest) {
  // Route Handlers checam a sessão por conta própria (não só o proxy).
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const brutos = Object.fromEntries(requisicao.nextUrl.searchParams);
  const soParceiros = brutos.parceiros === "1" || brutos.parceiros === "true";
  const { parametros, filtros } = lerListaClientes(brutos);
  const { linhas, truncado } = await listarClientesParaExportar(parametros, filtros, { soParceiros });

  const registros: unknown[][] = linhas.map((c) => [
    c.nome,
    c.nomeFantasia,
    c.tipoPessoa === "PF" ? "Pessoa física" : "Pessoa jurídica",
    c.cpfCnpj ? (c.tipoPessoa === "PF" ? formatarCpf(c.cpfCnpj) : formatarCnpj(c.cpfCnpj)) : "",
    c.telefone,
    c.whatsapp,
    c.email,
    c.marcacoes.map((m) => ROTULO_MARCACAO[m]).join(", "),
    c.origem ? (ROTULO_ORIGEM[c.origem as keyof typeof ROTULO_ORIGEM] ?? c.origem) : "",
    c.ativo ? "Ativo" : "Inativo",
    formatarData(c.criadoEm),
  ]);
  // Arquivo incompleto precisa dizer que está incompleto.
  if (truncado) registros.push([`AVISO: exportação limitada aos primeiros ${LIMITE_EXPORTACAO_CLIENTES} cadastros. Use os filtros para obter o restante.`]);

  const csv = gerarCsv(["Nome", "Nome fantasia", "Pessoa", "CPF/CNPJ", "Telefone", "WhatsApp", "E-mail", "Tipo de cadastro", "Origem", "Situação", "Cadastrado em"], registros);

  // Exportar dados pessoais também é um evento auditável.
  await registrarAuditoria(prisma, {
    usuario,
    entidade: "Cliente",
    entidadeId: "exportacao",
    acao: "EXPORTAR",
    depois: { linhas: linhas.length, truncado, parceiros: soParceiros, filtros, busca: parametros.busca },
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${soParceiros ? "parceiros" : "clientes"}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
