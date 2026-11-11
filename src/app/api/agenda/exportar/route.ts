import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { limitesDoDia } from "@/lib/dominio/agenda";
import { somarDias } from "@/lib/dominio/calendario";
import { dataLocalDoInstante, inputParaData } from "@/lib/formatadores";
import { calendarioDaAgenda } from "@/modules/agenda/ics";
import { lerFiltrosAgenda, listarEventos, obterEvento } from "@/modules/agenda/queries";
import { obterMarca } from "@/modules/configuracoes/queries";

export const dynamic = "force-dynamic";

const IDENTIFICADOR = /^[\w-]{1,64}$/;

/**
 * Exporta compromissos em .ics: um (`?id=`) ou um período (`?de=aaaa-mm-dd&ate=aaaa-mm-dd`, padrão: o mês atual),
 * com os mesmos filtros da tela (responsável, equipe, tipo).
 */
export async function GET(requisicao: NextRequest) {
  // Route Handlers checam a sessão por conta própria (não só o proxy).
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const parametros = Object.fromEntries(requisicao.nextUrl.searchParams);
  const { nome } = await obterMarca();
  const titulo = `Agenda — ${nome}`;

  const id = parametros.id;
  if (id !== undefined) {
    if (!IDENTIFICADOR.test(id)) return NextResponse.json({ erro: "Compromisso inválido." }, { status: 400 });
    const evento = await obterEvento(id);
    if (!evento) return NextResponse.json({ erro: "Compromisso não encontrado." }, { status: 404 });
    await registrarAuditoria(prisma, { usuario, entidade: "EventoAgenda", entidadeId: id, acao: "EXPORTAR", depois: { formato: "ics" } });
    return resposta(calendarioDaAgenda([evento], titulo), "compromisso.ics");
  }

  const hoje = dataLocalDoInstante(new Date());
  const de = inputParaData(parametros.de ?? "") ? parametros.de : `${hoje.slice(0, 8)}01`;
  const ate = inputParaData(parametros.ate ?? "") ? parametros.ate : somarDias(`${hoje.slice(0, 8)}01`, 31);
  if (de > ate) return NextResponse.json({ erro: "A data final não pode ser antes da inicial." }, { status: 400 });
  // Limita o período exportado (um ano): evita arquivos gigantes por engano.
  if (somarDias(de, 366) < ate) return NextResponse.json({ erro: "Escolha um período de até um ano." }, { status: 400 });

  const eventos = await listarEventos({ inicio: limitesDoDia(de).inicio, fim: limitesDoDia(ate).fim }, lerFiltrosAgenda(parametros));
  await registrarAuditoria(prisma, { usuario, entidade: "EventoAgenda", entidadeId: "exportacao", acao: "EXPORTAR", depois: { formato: "ics", de, ate, eventos: eventos.length } });
  return resposta(calendarioDaAgenda(eventos, titulo), `agenda-${de}-a-${ate}.ics`);
}

function resposta(conteudo: string, arquivo: string) {
  return new NextResponse(conteudo, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
