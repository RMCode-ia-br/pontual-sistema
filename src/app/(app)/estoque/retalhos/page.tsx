import { Recycle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltroSelect, FiltrosDaLista } from "@/components/lista/filtros-da-lista";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { formatarQuantidade } from "@/lib/dominio/estoque";
import { dataLocalDoInstante, formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { AcoesDeSucata } from "@/modules/estoque/components/acoes-de-sucata";
import { AcoesDoRetalho } from "@/modules/estoque/components/acoes-do-retalho";
import { contagemDeRetalhos, lerFiltroDeRetalhos, listarRetalhos, resumoDaSucata } from "@/modules/estoque/queries-retalhos";

export const metadata: Metadata = { title: "Retalhos e sucata" };

const ROTULO_STATUS = { DISPONIVEL: "Disponível", CONSUMIDO: "Usado em obra", DESCARTADO: "Descartado" } as const;
const ROTULO_SUCATA = { GERACAO: "Entrada de sucata", VENDA: "Venda", AJUSTE: "Ajuste" } as const;

export default async function PaginaRetalhos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const filtro = lerFiltroDeRetalhos(await searchParams);
  const hoje = dataLocalDoInstante(new Date());
  const [{ linhas, temMais }, contagem, sucata, contas, cfg] = await Promise.all([
    listarRetalhos(filtro),
    contagemDeRetalhos(),
    resumoDaSucata(),
    prisma.contaFinanceira.findMany({ where: { ativo: true, deletadoEm: null }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { retalhoMinimoMm: true } }),
  ]);
  const filtrado = filtro.status !== "DISPONIVEL" || !!filtro.busca;

  return (
    <>
      <CabecalhoPagina titulo="Retalhos e sucata" descricao="Sobras de perfil que dá para reaproveitar e a sucata acumulada para vender. A sobra do corte vira retalho ou sucata pela regra do retalho mínimo das Configurações." />

      {cfg?.retalhoMinimoMm === null || cfg === null ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          O <strong>retalho mínimo aproveitável</strong> não está definido. Enquanto estiver vazio, a cada corte o sistema pergunta se a sobra é retalho ou sucata. Defina em <Link href="/configuracoes/empresa" className="underline">Configurações → Empresa</Link>.
        </p>
      ) : (
        <p className="text-muted-foreground mb-4 text-sm">Retalho mínimo aproveitável: {cfg.retalhoMinimoMm.toLocaleString("pt-BR")} mm (sobras menores vão para a sucata).</p>
      )}

      <section aria-labelledby="titulo-sucata" className="mb-8 grid gap-3 rounded-xl border p-4">
        <h2 id="titulo-sucata" className="font-medium">
          Sucata
        </h2>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-sm">Saldo para vender</p>
            <p className="text-2xl font-semibold tabular-nums">{formatarQuantidade(sucata.saldo.pesoMilesimosKg)} kg</p>
            {sucata.saldo.comprimentoSemPesoMm > 0 ? (
              <p className="text-muted-foreground text-xs">Mais {sucata.saldo.comprimentoSemPesoMm.toLocaleString("pt-BR")} mm de perfil sem peso por metro cadastrado (não dá para converter em kg).</p>
            ) : null}
          </div>
          <AcoesDeSucata saldoMilesimosKg={sucata.saldo.pesoMilesimosKg} contas={contas} hoje={hoje} />
        </div>
        {sucata.movimentos.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">Nenhuma sucata registrada ainda. Ela nasce quando a sobra de um corte é menor que o retalho mínimo.</p>
        ) : (
          <ul className="grid gap-1.5 text-sm">
            {sucata.movimentos.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border px-3 py-2">
                <span>
                  <strong>{ROTULO_SUCATA[m.tipo]}</strong> · {formatarDataCalendario(m.data)}
                  {m.produto ? ` · ${m.produto}` : ""}
                  {m.obra ? ` · ${m.obra}` : ""}
                </span>
                <span className="tabular-nums">
                  {m.pesoMilesimosKg !== null ? `${m.tipo === "VENDA" ? "−" : m.pesoMilesimosKg < 0 ? "−" : "+"}${formatarQuantidade(Math.abs(m.pesoMilesimosKg))} kg` : `${(m.comprimentoMm ?? 0).toLocaleString("pt-BR")} mm (sem peso)`}
                  {m.valorCentavos !== null ? ` · ${formatarMoeda(m.valorCentavos)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="titulo-retalhos" className="grid gap-3">
        <h2 id="titulo-retalhos" className="font-medium">
          Retalhos <span className="text-muted-foreground text-sm font-normal">({contagem.DISPONIVEL} disponíveis)</span>
        </h2>
        <FiltrosDaLista base="/estoque/retalhos" busca={filtro.busca ?? ""} placeholderBusca="Código ou descrição do perfil" filtrado={filtrado}>
          <FiltroSelect nome="status" rotulo="Situação" valor={filtro.status === "DISPONIVEL" ? undefined : filtro.status} todos="Disponíveis" opcoes={[{ valor: "CONSUMIDO", rotulo: "Usados em obra" }, { valor: "DESCARTADO", rotulo: "Descartados" }, { valor: "todos", rotulo: "Todos" }]} />
        </FiltrosDaLista>

        {linhas.length === 0 ? (
          <EstadoVazio
            icone={Recycle}
            titulo={filtrado ? "Nenhum retalho nesse filtro" : "Nenhum retalho disponível"}
            descricao={filtrado ? "Confira a busca e a situação, ou limpe os filtros." : "Quando você baixar um perfil cortando uma barra e a sobra for maior que o retalho mínimo, ela aparece aqui para ser usada em outra obra. Faça a baixa na aba Estoque do perfil."}
            acao={
              <Link href="/produtos" className={buttonVariants({ variant: "outline" })}>
                Ver os produtos
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-2">
            {linhas.map((r) => (
              <li key={r.id} className="grid gap-1 rounded-xl border p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
                <div className="grid gap-0.5">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <Link href={`/produtos/${r.produtoId}`} className="hover:underline">
                      {r.produto}
                    </Link>
                    <Badge variant={r.status === "DISPONIVEL" ? "default" : "outline"}>{ROTULO_STATUS[r.status]}</Badge>
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {r.codigo} · veio de {r.origem ?? "estoque"}
                    {r.local ? ` · guardado em ${r.local}` : ""}
                    {r.usadoEm ? ` · usado em ${r.usadoEm}` : ""}
                    {r.observacao ? ` · ${r.observacao}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  <span className="text-base font-semibold tabular-nums">{r.comprimentoMm.toLocaleString("pt-BR")} mm</span>
                  {r.status === "DISPONIVEL" ? <AcoesDoRetalho retalho={{ id: r.id, produto: r.produto, comprimentoMm: r.comprimentoMm }} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {temMais ? <p className="text-muted-foreground text-xs">Mostrando os primeiros 200. Use a busca para achar os demais.</p> : null}
      </section>
    </>
  );
}
