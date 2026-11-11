import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { limitesDoDia } from "@/lib/dominio/agenda";
import { somarDias } from "@/lib/dominio/calendario";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { hashDoToken, tokenComFormatoValido } from "@/lib/tokens";
import { calendarioDaAgenda } from "@/modules/agenda/ics";
import { listarEventos } from "@/modules/agenda/queries";
import { obterMarca } from "@/modules/configuracoes/queries";

export const dynamic = "force-dynamic";

/** Só atualiza "último acesso" de vez em quando: calendários consultam o feed de tempos em tempos. */
const INTERVALO_DO_ULTIMO_ACESSO_MS = 10 * 60_000;

/** Janela do feed: um pouco do passado (para o calendário reconhecer o que mudou) e um ano à frente. */
const DIAS_PARA_TRAS = 60;
const DIAS_PARA_FRENTE = 365;

const NAO_ENCONTRADO = () => new NextResponse("Não encontrado.", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Feed .ics assinável (Google Agenda, Apple, Outlook). NÃO usa sessão: quem tem o link recebe a agenda, por isso o
 * token tem 256 bits, só o hash fica no banco, a busca é pelo hash e o link pode ser desligado a qualquer momento.
 * Resposta 404 idêntica para token inexistente, malformado ou revogado (nada a descobrir por tentativa).
 */
export async function GET(_requisicao: NextRequest, contexto: { params: Promise<{ token: string }> }) {
  const { token } = await contexto.params;
  if (!tokenComFormatoValido(token)) return NAO_ENCONTRADO();

  const feed = await prisma.feedAgenda.findFirst({
    where: { tokenHash: hashDoToken(token), revogadoEm: null, deletadoEm: null, usuario: { ativo: true, deletadoEm: null } },
    select: { id: true, ultimoAcessoEm: true },
  });
  if (!feed) return NAO_ENCONTRADO();

  if (!feed.ultimoAcessoEm || Date.now() - feed.ultimoAcessoEm.getTime() > INTERVALO_DO_ULTIMO_ACESSO_MS) {
    // Falha ao anotar o acesso nunca derruba o feed.
    await prisma.feedAgenda.update({ where: { id: feed.id }, data: { ultimoAcessoEm: new Date() } }).catch(() => undefined);
  }

  const hoje = dataLocalDoInstante(new Date());
  const [{ nome }, eventos] = await Promise.all([
    obterMarca(),
    listarEventos({ inicio: limitesDoDia(somarDias(hoje, -DIAS_PARA_TRAS)).inicio, fim: limitesDoDia(somarDias(hoje, DIAS_PARA_FRENTE)).fim }),
  ]);

  return new NextResponse(calendarioDaAgenda(eventos, `Agenda — ${nome}`), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="agenda.ics"',
      // O calendário decide quando consultar de novo; nada de cache compartilhado (é conteúdo privado).
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
