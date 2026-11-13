import type { Metadata } from "next";
import Link from "next/link";

import { Selecao } from "@/components/formulario";
import { CabecalhoDeRelatorio, TabelaDeRelatorio } from "@/components/relatorios/cabecalho-de-relatorio";
import { NumeroDoPainel } from "@/components/relatorios/numero-do-painel";
import { SeletorDePeriodo } from "@/components/relatorios/seletor-de-periodo";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { dataLocalDoInstante, formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { FORMAS_PAGAMENTO, ROTULO_FORMA } from "@/lib/dominio/parcelas";
import { montarConsulta } from "@/lib/listas/parametros";
import { lerPeriodo, parametrosDoPeriodo, rotuloDoPeriodo } from "@/lib/periodo";
import { cn } from "@/lib/utils";
import { lerFiltroDeNota, listarRecebimentos } from "@/modules/indicadores/lista-de-recebimentos";

export const metadata: Metadata = { title: "Recebimentos" };

type Parametros = Record<string, string | string[] | undefined>;

export default async function PaginaDeRecebimentos({ searchParams }: { searchParams: Promise<Parametros> }) {
  await exigirSessao();
  const sp = await searchParams;
  const hoje = dataLocalDoInstante(new Date());
  const { periodo, tipo, aviso } = lerPeriodo(sp, hoje);
  const nota = lerFiltroDeNota(sp.nota);
  const paginaBruta = Array.isArray(sp.pagina) ? sp.pagina[0] : sp.pagina;
  const pagina = /^[0-9]{1,6}$/.test(paginaBruta ?? "") ? Math.max(1, Number(paginaBruta)) : 1;
  const r = await listarRecebimentos(periodo, nota, pagina);

  const base = { ...parametrosDoPeriodo(periodo), ...(nota ? { nota } : {}) };
  const link = (extra: Record<string, string | number>) => `/financeiro/recebimentos${montarConsulta({ ...base, ...extra })}`;

  return (
    <>
      <p className="mb-2 text-sm print:hidden">
        <Link href="/financeiro" className="text-muted-foreground hover:underline">
          ← Financeiro
        </Link>
      </p>
      <CabecalhoDeRelatorio
        titulo="Recebimentos"
        descricao="Cada pagamento recebido de clientes no período, pela data do pagamento, sem os estornos. É a lista que explica o “Recebido” e o faturamento com nota do painel."
        periodoRotulo={`${rotuloDoPeriodo(periodo)}${nota ? (nota === "com" ? " · só com nota" : " · só sem nota") : ""}`}
        hrefCsv={`/api/exportar/financeiro/recebimentos${montarConsulta(base)}`}
      >
        <SeletorDePeriodo periodo={periodo} tipo={tipo} hoje={hoje} />
      </CabecalhoDeRelatorio>

      {aviso ? (
        <p role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {aviso}
        </p>
      ) : null}

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
        {Object.entries(parametrosDoPeriodo(periodo)).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div className="grid gap-1">
          <label htmlFor="filtro-nota" className="text-muted-foreground text-xs">
            Nota fiscal
          </label>
          <Selecao id="filtro-nota" name="nota" defaultValue={nota ?? ""}>
            <option value="">Com e sem nota</option>
            <option value="com">Só com nota</option>
            <option value="sem">Só sem nota</option>
          </Selecao>
        </div>
        <button type="submit" className={cn(buttonVariants({ variant: "outline" }))}>
          Filtrar
        </button>
      </form>

      <section aria-label="Total do filtro" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <NumeroDoPainel titulo="Total recebido" valor={formatarMoeda(r.somaCentavos)} definicao="Soma dos pagamentos de contas a receber da lista abaixo, pela data do pagamento, sem estornos. A marca “com nota” é a do próprio pagamento." detalhe={`${r.total} pagamento(s)`} grande />
      </section>

      {r.total === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Nenhum recebimento neste filtro</p>
          <p className="text-muted-foreground mt-1 text-sm">Os pagamentos registrados nas contas a receber aparecem aqui.</p>
        </div>
      ) : (
        <>
          <TabelaDeRelatorio legenda="Recebimentos do período">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th scope="col" className="px-3 py-2">Data</th>
                <th scope="col" className="px-3 py-2">Cliente</th>
                <th scope="col" className="px-3 py-2">Obra</th>
                <th scope="col" className="px-3 py-2">Conta a receber</th>
                <th scope="col" className="px-3 py-2">Forma</th>
                <th scope="col" className="px-3 py-2">Nota</th>
                <th scope="col" className="px-3 py-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {r.linhas.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2 tabular-nums">{formatarDataCalendario(l.data)}</td>
                  <td className="px-3 py-2">{l.cliente ?? "—"}</td>
                  <td className="px-3 py-2">{l.obra && l.obraId ? <Link href={`/obras/${l.obraId}`} className="hover:underline">{l.obra}</Link> : "—"}</td>
                  <td className="px-3 py-2">
                    <Link href={`/financeiro/receber/${l.contaReceberId}`} className="hover:underline">
                      {l.descricao.replace(/^Recebimento: /, "")}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{l.forma && (FORMAS_PAGAMENTO as readonly string[]).includes(l.forma) ? ROTULO_FORMA[l.forma as keyof typeof ROTULO_FORMA] : "—"}</td>
                  <td className="px-3 py-2">{l.comNotaFiscal ? "Com nota" : "Sem nota"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.valorCentavos)}</td>
                </tr>
              ))}
            </tbody>
          </TabelaDeRelatorio>
          {r.paginas > 1 ? (
            <nav aria-label="Páginas" className="mt-4 flex items-center justify-between text-sm print:hidden">
              {r.pagina > 1 ? (
                <Link href={link({ pagina: r.pagina - 1 })} className={buttonVariants({ variant: "outline" })}>
                  Anterior
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground">
                Página {r.pagina} de {r.paginas}
              </span>
              {r.pagina < r.paginas ? (
                <Link href={link({ pagina: r.pagina + 1 })} className={buttonVariants({ variant: "outline" })}>
                  Próxima
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
