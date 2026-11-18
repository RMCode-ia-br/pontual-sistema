import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { fecharMixComOutros, precoPorM2, type LinhaDoMix } from "@/lib/dominio/relatorios-comerciais";
import { limitesEmInstantes, somarMeses, type Periodo } from "@/lib/periodo";

/**
 * Relatórios de CLIENTES (reativação e cidade) e de PRODUTOS E PREÇOS (mix e preço por m²), Fase 7B, Bloco 6. A venda é a
 * mesma de `ondeVendas` (proposta APROVADA, a vigente, pelo instante do aceite; aprovação desfeita não é venda). Datas em horário
 * de São Paulo. Janelas relativas recebem a data de referência (nada aqui lê o relógio).
 */

const SP = (coluna: string) => Prisma.raw(`((${coluna} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date`);
const num = (v: unknown) => Number(v ?? 0);

// ---------------------------------------------------------------------------------------------------------------------
// Reativação: clientes cuja última aprovação foi há N meses ou mais
// ---------------------------------------------------------------------------------------------------------------------

export const MESES_PADRAO_DE_REATIVACAO = 12;
export const LIMITE_DE_CLIENTES_NA_REATIVACAO = 500;

export type ClienteParaReativar = {
  clienteId: string;
  nome: string;
  telefone: string | null;
  whatsapp: string | null;
  ultimaAprovacaoEm: Date;
  obras: number;
  totalAprovadoCentavos: number;
  /** Tem proposta enviada em aberto agora (já está sendo atendido: não precisa de contato de reativação). */
  temPropostaEmAberto: boolean;
};

/**
 * Clientes com ao menos uma aprovação e cuja ÚLTIMA aprovação (data do aceite, horário de São Paulo) foi há `meses` meses ou mais,
 * contados a partir da data de `referencia`. O mais antigo primeiro. `total` conta todos; `linhas` traz até {@link LIMITE_DE_CLIENTES_NA_REATIVACAO}.
 */
export async function clientesParaReativar(referencia: string, meses: number = MESES_PADRAO_DE_REATIVACAO): Promise<{ limite: string; total: number; linhas: ClienteParaReativar[] }> {
  const limite = somarMeses(referencia, -meses);
  const linhas = await prisma.$queryRaw<{ id: string; nome: string; telefone: string | null; whatsapp: string | null; ultima: Date; obras: number; total: bigint; aberta: boolean; todos: number }[]>`
    SELECT c.id, c.nome, c.telefone, c.whatsapp, max(pr."aceitaEm") AS ultima, count(DISTINCT pr."projetoId")::int AS obras,
           COALESCE(sum(pr."valorAprovadoCentavos"), 0)::bigint AS total,
           EXISTS (SELECT 1 FROM "Proposta" p2 JOIN "Projeto" j2 ON j2.id = p2."projetoId"
                    WHERE j2."clienteId" = c.id AND p2.status = 'ENVIADA' AND p2."deletadoEm" IS NULL AND j2."deletadoEm" IS NULL) AS aberta,
           count(*) OVER ()::int AS todos
      FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId" JOIN "Cliente" c ON c.id = j."clienteId"
     WHERE pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL AND c."deletadoEm" IS NULL AND pr."aceitaEm" IS NOT NULL
     GROUP BY c.id
    HAVING ${SP('max(pr."aceitaEm")')} <= ${limite}::date
     ORDER BY max(pr."aceitaEm") ASC, c.nome
     LIMIT ${LIMITE_DE_CLIENTES_NA_REATIVACAO}`;
  return {
    limite,
    total: linhas[0]?.todos ?? 0,
    linhas: linhas.map((l) => ({ clienteId: l.id, nome: l.nome, telefone: l.telefone, whatsapp: l.whatsapp, ultimaAprovacaoEm: l.ultima, obras: l.obras, totalAprovadoCentavos: num(l.total), temPropostaEmAberto: l.aberta })),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Clientes por cidade (cidade do endereço da obra)
// ---------------------------------------------------------------------------------------------------------------------

export type LinhaDeCidade = { cidade: string | null; uf: string | null; clientes: number; obras: number; vendidoCentavos: number };

/**
 * Clientes, obras e R$ vendido por cidade da OBRA (endereço da obra do projeto), no período. "Macaé", "macae" e "MACAÉ " são a mesma
 * cidade (agrupa sem caixa, acento nem espaços) e a linha mostra o nome mais frequente do grupo. Sem endereço de obra: "Não informada".
 */
export async function clientesPorCidade(p: Periodo): Promise<LinhaDeCidade[]> {
  const { inicio, fimExclusivo } = limitesEmInstantes(p);
  const linhas = await prisma.$queryRaw<{ cidade: string | null; uf: string | null; clientes: number; obras: number; total: bigint }[]>`
    SELECT mode() WITHIN GROUP (ORDER BY btrim(e.cidade)) FILTER (WHERE btrim(coalesce(e.cidade, '')) <> '') AS cidade,
           mode() WITHIN GROUP (ORDER BY upper(btrim(e.uf))) FILTER (WHERE btrim(coalesce(e.uf, '')) <> '') AS uf,
           count(DISTINCT j."clienteId")::int AS clientes, count(DISTINCT j.id)::int AS obras, COALESCE(sum(pr."valorAprovadoCentavos"), 0)::bigint AS total
      FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId" LEFT JOIN "EnderecoCliente" e ON e.id = j."enderecoObraId"
     WHERE pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL AND pr."aceitaEm" >= ${inicio} AND pr."aceitaEm" < ${fimExclusivo}
     GROUP BY NULLIF(lower(public.f_unaccent(btrim(coalesce(e.cidade, '')))), '') ORDER BY total DESC, cidade NULLS LAST`;
  return linhas.map((l) => ({ cidade: l.cidade, uf: l.uf, clientes: l.clientes, obras: l.obras, vendidoCentavos: num(l.total) }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Mix por tipologia (m² e R$ das propostas aprovadas)
// ---------------------------------------------------------------------------------------------------------------------

export type MixDeTipologia = {
  linhas: (LinhaDoMix & { itens: number })[];
  /** Diferença entre o vendido e a soma dos itens: desconto da opção, acréscimo da nota e o que mais o valor aprovado inclua. */
  outrosCentavos: number;
  vendidoCentavos: number;
  propostas: number;
  /** Propostas cujo total dos itens é diferente do valor aprovado (têm desconto ou acréscimo da nota). */
  propostasComDiferenca: number;
  /** Propostas SEM conteúdo congelado da opção aprovada (lidas só pela tabela de itens). */
  propostasSoPelaTabela: number;
  itensSemMedida: number;
};

/**
 * Para cada proposta aprovada no período, os itens da OPÇÃO APROVADA (tabela de itens: o conteúdo congelado não guarda
 * tipologia por item) agrupados por tipologia, com m² (medidas × quantidade) e R$. Itens de proposta aprovada não podem ser
 * editados, então a soma dos itens só difere do valor aprovado pelo desconto da opção e pelo acréscimo da nota: essa diferença
 * fecha numa linha "outros e ajustes", para a soma de tudo bater com o Vendido.
 */
export async function mixPorTipologia(p: Periodo): Promise<MixDeTipologia> {
  const { inicio, fimExclusivo } = limitesEmInstantes(p);
  const base = Prisma.sql`
    SELECT pr.id, pr."opcaoAprovadaId", pr."valorAprovadoCentavos" AS valor, pr.snapshot
      FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId"
     WHERE pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL AND pr."aceitaEm" >= ${inicio} AND pr."aceitaEm" < ${fimExclusivo}`;
  const itens = Prisma.sql`
    SELECT v.id AS "propostaId", ip.id AS "itemId", ip."tipologiaId", ip."precoTotalCentavos" AS preco,
           COALESCE((SELECT sum(m."larguraMm"::bigint * m."alturaMm" * m.quantidade) FROM "ItemPropostaMedida" m WHERE m."itemId" = ip.id AND m."deletadoEm" IS NULL), 0) AS mm2
      FROM v JOIN "ItemProposta" ip ON ip."propostaId" = v.id AND ip."opcaoId" = v."opcaoAprovadaId" AND ip."deletadoEm" IS NULL`;
  const [porTipologia, totais] = await Promise.all([
    prisma.$queryRaw<{ id: string | null; nome: string | null; preco: bigint; mm2: bigint; itens: number }[]>`
      WITH v AS (${base}), it AS (${itens})
      SELECT it."tipologiaId" AS id, t.nome, COALESCE(sum(it.preco), 0)::bigint AS preco, COALESCE(sum(it.mm2), 0)::bigint AS mm2, count(*)::int AS itens
        FROM it LEFT JOIN "Tipologia" t ON t.id = it."tipologiaId" GROUP BY it."tipologiaId", t.nome ORDER BY preco DESC, t.nome NULLS LAST`,
    prisma.$queryRaw<{ vendido: bigint; propostas: number; diferentes: number; so_tabela: number; sem_medida: number }[]>`
      WITH v AS (${base}), it AS (${itens}),
      soma AS (SELECT "propostaId", sum(preco) AS s FROM it GROUP BY "propostaId")
      SELECT COALESCE((SELECT sum(valor) FROM v), 0)::bigint AS vendido,
             (SELECT count(*) FROM v)::int AS propostas,
             (SELECT count(*) FROM v LEFT JOIN soma ON soma."propostaId" = v.id WHERE COALESCE(soma.s, 0) <> v.valor)::int AS diferentes,
             (SELECT count(*) FROM v WHERE v.snapshot IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v.snapshot->'opcoes') o WHERE o->>'id' = v."opcaoAprovadaId"))::int AS so_tabela,
             (SELECT count(*) FROM it WHERE mm2 = 0)::int AS sem_medida`,
  ]);
  const t = totais[0];
  const linhas = porTipologia.map((l) => ({ chave: l.id ?? "sem", nome: l.nome ?? "Sem tipologia", valorCentavos: num(l.preco), m2: num(l.mm2) / 1_000_000, itens: l.itens }));
  const vendidoCentavos = num(t?.vendido);
  const fechado = fecharMixComOutros(linhas, vendidoCentavos);
  return {
    linhas: fechado.linhas as MixDeTipologia["linhas"],
    outrosCentavos: fechado.outrosCentavos,
    vendidoCentavos,
    propostas: t?.propostas ?? 0,
    propostasComDiferenca: t?.diferentes ?? 0,
    propostasSoPelaTabela: t?.so_tabela ?? 0,
    itensSemMedida: t?.sem_medida ?? 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Preço médio por m² por mês
// ---------------------------------------------------------------------------------------------------------------------

export type DimensaoDePreco = "tipologia" | "linha" | "acabamento";
export const ROTULO_DA_DIMENSAO: Record<DimensaoDePreco, string> = { tipologia: "Tipologia", linha: "Linha de alumínio", acabamento: "Acabamento" };

export type LinhaDePrecoPorM2 = { mes: string; chave: string; nome: string; valorCentavos: number; m2: number; precoPorM2Centavos: number | null };
export type PrecoPorM2 = { linhas: LinhaDePrecoPorM2[]; porMes: { mes: string; valorCentavos: number; m2: number; precoPorM2Centavos: number | null }[]; itensSemMedida: number; itensSemDimensao: number };

/**
 * Preço médio por m² (R$ ÷ m²) por mês de aprovação (horário de São Paulo) e por tipologia, linha ou acabamento, dos itens da
 * opção aprovada. Item sem medida não entra na conta (nunca vira zero) e é contado; item sem a dimensão escolhida (ex.: sem
 * acabamento) fica numa linha "Não informado".
 */
export async function precoMedioPorM2(p: Periodo, por: DimensaoDePreco): Promise<PrecoPorM2> {
  const { inicio, fimExclusivo } = limitesEmInstantes(p);
  const coluna = Prisma.raw(por === "tipologia" ? `ip."tipologiaId"` : por === "linha" ? `ip."linhaId"` : `ip."acabamentoId"`);
  const tabela = Prisma.raw(por === "tipologia" ? `"Tipologia"` : por === "linha" ? `"LinhaAluminio"` : `"AcabamentoAluminio"`);
  const linhasDoSql = await prisma.$queryRaw<{ mes: string; id: string | null; nome: string | null; preco: bigint; mm2: bigint }[]>`
    WITH v AS (
      SELECT pr.id, pr."opcaoAprovadaId", to_char(${SP('pr."aceitaEm"')}, 'YYYY-MM') AS mes
        FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId"
       WHERE pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL AND pr."aceitaEm" >= ${inicio} AND pr."aceitaEm" < ${fimExclusivo}),
    it AS (
      SELECT v.mes, ${coluna} AS dimensao, ip."precoTotalCentavos" AS preco,
             COALESCE((SELECT sum(m."larguraMm"::bigint * m."alturaMm" * m.quantidade) FROM "ItemPropostaMedida" m WHERE m."itemId" = ip.id AND m."deletadoEm" IS NULL), 0) AS mm2
        FROM v JOIN "ItemProposta" ip ON ip."propostaId" = v.id AND ip."opcaoId" = v."opcaoAprovadaId" AND ip."deletadoEm" IS NULL)
    SELECT it.mes, it.dimensao AS id, d.nome, sum(it.preco)::bigint AS preco, sum(it.mm2)::bigint AS mm2
      FROM it LEFT JOIN ${tabela} d ON d.id = it.dimensao WHERE it.mm2 > 0
     GROUP BY it.mes, it.dimensao, d.nome ORDER BY it.mes, d.nome NULLS LAST`;
  const contagens = await prisma.$queryRaw<{ sem_medida: number; sem_dimensao: number }[]>`
    WITH v AS (
      SELECT pr.id, pr."opcaoAprovadaId" FROM "Proposta" pr JOIN "Projeto" j ON j.id = pr."projetoId"
       WHERE pr.status = 'APROVADA' AND pr."deletadoEm" IS NULL AND j."deletadoEm" IS NULL AND pr."aceitaEm" >= ${inicio} AND pr."aceitaEm" < ${fimExclusivo})
    SELECT count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM "ItemPropostaMedida" m WHERE m."itemId" = ip.id AND m."deletadoEm" IS NULL))::int AS sem_medida,
           count(*) FILTER (WHERE ${coluna} IS NULL)::int AS sem_dimensao
      FROM v JOIN "ItemProposta" ip ON ip."propostaId" = v.id AND ip."opcaoId" = v."opcaoAprovadaId" AND ip."deletadoEm" IS NULL`;
  const linhas = linhasDoSql.map((l): LinhaDePrecoPorM2 => ({ mes: l.mes, chave: l.id ?? "sem", nome: l.nome ?? "Não informado", valorCentavos: num(l.preco), m2: num(l.mm2) / 1_000_000, precoPorM2Centavos: precoPorM2(num(l.preco), num(l.mm2) / 1_000_000) }));
  const meses = new Map<string, { valorCentavos: number; m2: number }>();
  for (const l of linhas) {
    const m = meses.get(l.mes) ?? { valorCentavos: 0, m2: 0 };
    m.valorCentavos += l.valorCentavos;
    m.m2 += l.m2;
    meses.set(l.mes, m);
  }
  return {
    linhas,
    porMes: [...meses.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, m]) => ({ mes, ...m, precoPorM2Centavos: precoPorM2(m.valorCentavos, m.m2) })),
    itensSemMedida: contagens[0]?.sem_medida ?? 0,
    itensSemDimensao: contagens[0]?.sem_dimensao ?? 0,
  };
}
