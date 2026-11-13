import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoDeRelatorio, TabelaDeRelatorio } from "@/components/relatorios/cabecalho-de-relatorio";
import { NumeroDoPainel } from "@/components/relatorios/numero-do-painel";
import { exigirSessao } from "@/lib/auth/sessao";
import { dataLocalDoInstante, formatarDataCalendario } from "@/lib/formatadores";
import { DIAS_A_FRENTE_DA_FABRICA, ocupacaoAtualDaFabrica } from "@/modules/indicadores/fabrica";

export const metadata: Metadata = { title: "Produção da fábrica" };

const m2 = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;

export default async function PaginaDaProducao() {
  await exigirSessao();
  const hoje = dataLocalDoInstante(new Date());
  const f = await ocupacaoAtualDaFabrica(hoje);

  return (
    <>
      <p className="mb-2 text-sm print:hidden">
        <Link href="/relatorios" className="text-muted-foreground hover:underline">
          ← Relatórios
        </Link>
      </p>
      <CabecalhoDeRelatorio titulo="Produção da fábrica" descricao="Quanto da capacidade da fábrica está ocupada hoje: as obras que estão em fabricação ou que vão começar nos próximos 30 dias." periodoRotulo={`situação em ${formatarDataCalendario(hoje)}`} />

      <section aria-label="Resumo da produção" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <NumeroDoPainel
          titulo="Ocupação da fábrica"
          valor={f.ocupacaoPercentual === null ? "—" : `${f.ocupacaoPercentual.toLocaleString("pt-BR")}%`}
          definicao={`m² das obras cuja fabricação está em andamento ou começa nos próximos ${DIAS_A_FRENTE_DA_FABRICA} dias (inclui a que já deveria ter começado), dividido pela capacidade de produção por mês de Configurações. Os m² vêm da opção aprovada na proposta.`}
          detalhe={f.capacidadeM2 === null ? "Informe a capacidade em Configurações" : `${m2(f.m2EmProducao)} de ${m2(f.capacidadeM2)} por mês`}
          grande
        />
      </section>

      {f.obras.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Nenhuma obra está em fabricação nem começa nos próximos {DIAS_A_FRENTE_DA_FABRICA} dias</p>
          <p className="text-muted-foreground mt-1 text-sm">Quando uma obra chegar na etapa de fabricação, ela aparece aqui com os m² que ocupa.</p>
        </div>
      ) : (
        <TabelaDeRelatorio legenda="Obras na fábrica">
          <thead className="bg-muted/50 text-left text-xs">
            <tr>
              <th scope="col" className="px-3 py-2">Obra</th>
              <th scope="col" className="px-3 py-2">Cliente</th>
              <th scope="col" className="px-3 py-2">Situação</th>
              <th scope="col" className="px-3 py-2">Começo previsto</th>
              <th scope="col" className="px-3 py-2 text-right">Área</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {f.obras.map((o) => (
              <tr key={o.projetoId}>
                <td className="px-3 py-2">
                  <Link href={`/obras/${o.projetoId}?aba=etapas`} className="hover:underline">
                    {o.codigo} · {o.titulo}
                  </Link>
                </td>
                <td className="px-3 py-2">{o.cliente}</td>
                <td className="px-3 py-2">{o.situacao === "EM_ANDAMENTO" ? "Em fabricação" : "A começar"}</td>
                <td className="px-3 py-2 tabular-nums">{o.inicioPrevisto ? formatarDataCalendario(o.inicioPrevisto) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m2(o.m2)}</td>
              </tr>
            ))}
          </tbody>
        </TabelaDeRelatorio>
      )}
    </>
  );
}
