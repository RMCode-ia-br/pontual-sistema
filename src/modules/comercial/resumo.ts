import "server-only";

import { prisma } from "@/lib/db";
import { limitesDoDia } from "@/lib/dominio/agenda";
import { somarDias } from "@/lib/dominio/calendario";
import { FASES_ABERTAS, type StatusProjeto } from "@/lib/dominio/funil";
import { dataLocalDoInstante } from "@/lib/formatadores";
import { obterConfiguracao } from "@/modules/configuracoes/queries";
import { limiteSemRetorno } from "@/modules/projetos/queries";

export type ResumoComercial = {
  funil: { status: StatusProjeto; quantidade: number; valorCentavos: number }[];
  semRetorno: number;
  visitas: { id: string; inicio: string; clienteNome: string | null; projetoTitulo: string | null; local: string | null; dia: "hoje" | "amanha" }[];
  origensDoMes: { origem: string | null; quantidade: number }[];
  perdasDoMes: { nome: string; quantidade: number }[];
};

/**
 * Números do painel comercial. Definições (mostradas na tela):
 * - funil: projetos em cada fase aberta e a soma dos valores estimados;
 * - sem retorno: em "Proposta enviada"/"Negociação" parados há mais que o prazo configurado;
 * - visitas: visitas técnicas ainda em aberto hoje e amanhã (horário de São Paulo);
 * - origens e perdas do mês: projetos CRIADOS / PERDIDOS desde o dia 1º do mês atual.
 */
export async function resumoComercial(): Promise<ResumoComercial> {
  const agora = new Date();
  const hoje = dataLocalDoInstante(agora);
  const amanha = somarDias(hoje, 1);
  const inicioDoMes = limitesDoDia(`${hoje.slice(0, 8)}01`).inicio;
  const config = await obterConfiguracao();

  const [porFase, semRetorno, visitas, origens, perdas] = await Promise.all([
    prisma.projeto.groupBy({ by: ["status"], where: { deletadoEm: null, status: { in: [...FASES_ABERTAS] } }, _count: { _all: true }, _sum: { valorEstimadoCentavos: true } }),
    prisma.projeto.count({
      where: { deletadoEm: null, status: { in: ["PROPOSTA_ENVIADA", "NEGOCIACAO"] }, ultimaMovimentacaoEm: { lt: limiteSemRetorno(config?.diasSemRetornoProposta ?? 7, agora) } },
    }),
    prisma.eventoAgenda.findMany({
      where: { deletadoEm: null, tipo: "VISITA_TECNICA", status: { in: ["AGENDADO", "CONFIRMADO", "REMARCADO"] }, inicio: { gte: limitesDoDia(hoje).inicio, lt: limitesDoDia(amanha).fim } },
      orderBy: { inicio: "asc" },
      take: 20,
      select: { id: true, inicio: true, local: true, cliente: { select: { nome: true } }, projeto: { select: { titulo: true } } },
    }),
    prisma.projeto.groupBy({ by: ["origem"], where: { deletadoEm: null, criadoEm: { gte: inicioDoMes } }, _count: { _all: true }, orderBy: { _count: { origem: "desc" } }, take: 6 }),
    prisma.projeto.groupBy({ by: ["motivoPerdaId"], where: { deletadoEm: null, status: "PERDIDO", perdidoEm: { gte: inicioDoMes } }, _count: { _all: true }, orderBy: { _count: { motivoPerdaId: "desc" } }, take: 6 }),
  ]);

  const ids = perdas.map((p) => p.motivoPerdaId).filter((i): i is string => !!i);
  const nomes = ids.length ? await prisma.motivoPerda.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }) : [];
  const nomePorId = new Map(nomes.map((n) => [n.id, n.nome]));
  const limiteDeHoje = limitesDoDia(amanha).inicio;

  return {
    funil: FASES_ABERTAS.map((status) => {
      const g = porFase.find((f) => f.status === status);
      return { status, quantidade: g?._count._all ?? 0, valorCentavos: g?._sum.valorEstimadoCentavos ?? 0 };
    }),
    semRetorno,
    visitas: visitas.map((v) => ({ id: v.id, inicio: v.inicio.toISOString(), clienteNome: v.cliente?.nome ?? null, projetoTitulo: v.projeto?.titulo ?? null, local: v.local, dia: v.inicio < limiteDeHoje ? "hoje" : "amanha" })),
    origensDoMes: origens.map((o) => ({ origem: o.origem, quantidade: o._count._all })),
    perdasDoMes: perdas.map((p) => ({ nome: p.motivoPerdaId ? (nomePorId.get(p.motivoPerdaId) ?? "Motivo removido") : "Sem motivo informado", quantidade: p._count._all })),
  };
}
