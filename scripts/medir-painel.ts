/**
 * Mede o tempo de carga do painel (só leitura; nenhuma gravação) e quantas consultas SQL cada carga faz, variando quantos
 * dos 18 carregadores rodam ao mesmo tempo. Também amostra quantas conexões do banco estão abertas durante a medição.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/medir-painel.ts [--repeticoes=12] [--limites=18,9,6,3,1]
 *
 * (`--conditions=react-server` deixa o `server-only` dos módulos do app importável fora do Next.)
 * Nunca imprime o conteúdo das variáveis de ambiente. O resultado resumido vai para docs/APRENDIZADOS.md.
 */
import { Client } from "pg";

import { criarClientePrisma } from "../src/lib/db/criar-cliente";

const argumento = (nome: string, padrao: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1] ?? padrao;
const REPETICOES = Number(argumento("repeticoes", "12"));
const LIMITES = argumento("limites", "18,9,6,3,1").split(",").map(Number);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não configurada (use --env-file=.env.local).");
  process.exit(1);
}

// O app usa o cliente de `globalThis.prisma`: aqui ele nasce com o log de consultas ligado.
let consultas = 0;
const prisma = criarClientePrisma(url, { logDeConsultas: true });
(prisma as unknown as { $on: (e: "query", f: () => void) => void }).$on("query", () => {
  consultas += 1;
});
(globalThis as unknown as { prisma: unknown }).prisma = prisma;

const percentil = (valores: number[], p: number) => {
  const o = [...valores].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.max(0, Math.ceil((p / 100) * o.length) - 1))];
};

async function main() {
  const { carregarDadosDoPainel } = await import("../src/modules/painel/dados");
  const { dataLocalDoInstante } = await import("../src/lib/formatadores");
  const { lerPeriodo, periodoDeComparacao } = await import("../src/lib/periodo");
  const { janelaDeFechamento } = await import("../src/modules/indicadores/fechamento");

  const agora = new Date();
  const hoje = dataLocalDoInstante(agora);
  const { periodo } = lerPeriodo({}, hoje);
  const cmp = periodoDeComparacao(periodo, hoje);
  const usuario = await prisma.usuario.findFirst({ where: { ativo: true, deletadoEm: null }, select: { id: true } });
  if (!usuario) throw new Error("Nenhum usuário ativo para medir.");
  const entrada = { usuarioId: usuario.id, periodo, anterior: cmp.anterior, anoPassado: cmp.anoPassado, janela: janelaDeFechamento(periodo, hoje), hoje, agora };

  // Conexões abertas no banco (todas, de qualquer cliente), amostradas por uma conexão à parte.
  const sonda = new Client({ connectionString: process.env.DIRECT_URL ?? url, ssl: { rejectUnauthorized: false } });
  await sonda.connect();
  const conexoes = async () => Number((await sonda.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`)).rows[0].n);
  const antes = await conexoes();
  let maximo = antes;
  let medindo = true;
  const amostrador = (async () => {
    while (medindo) {
      maximo = Math.max(maximo, await conexoes());
      await new Promise((r) => setTimeout(r, 40));
    }
  })();

  const tempos = new Map<number, number[]>(LIMITES.map((l) => [l, []]));
  const contagens = new Map<number, number[]>(LIMITES.map((l) => [l, []]));
  // Aquecimento: abre as conexões do pool e compila as consultas.
  for (const l of LIMITES) await carregarDadosDoPainel(entrada, l);
  // Rodadas intercaladas (cada repetição passa por todos os limites), para a variação do banco não favorecer um deles.
  for (let i = 0; i < REPETICOES; i++) {
    for (const l of LIMITES) {
      consultas = 0;
      const t0 = performance.now();
      await carregarDadosDoPainel(entrada, l);
      tempos.get(l)!.push(performance.now() - t0);
      contagens.get(l)!.push(consultas);
    }
  }
  medindo = false;
  await amostrador;
  const depois = await conexoes();
  await sonda.end();

  console.log(`\nPainel, ${REPETICOES} repetições por configuração (ms). Consultas SQL por carga: ${Math.round(contagens.get(LIMITES[0])!.reduce((s, n) => s + n, 0) / REPETICOES)}.`);
  console.log("carregadores ao mesmo tempo |   p50 |   p95 |   mín |   máx");
  for (const l of LIMITES) {
    const t = tempos.get(l)!;
    console.log(`${String(l).padStart(27)} | ${percentil(t, 50).toFixed(0).padStart(5)} | ${percentil(t, 95).toFixed(0).padStart(5)} | ${Math.min(...t).toFixed(0).padStart(5)} | ${Math.max(...t).toFixed(0).padStart(5)}`);
  }
  console.log(`\nConexões abertas no banco (todos os clientes): antes ${antes}, no máximo durante ${maximo}, depois ${depois}. Pool deste cliente: 5.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Falhou:", e instanceof Error ? e.constructor.name : "erro", e instanceof Error ? e.message.slice(0, 200) : "");
  process.exit(1);
});
