import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { hojeCalendario } from "@/lib/formatadores";
import { PainelFeriados } from "@/modules/feriados/components/painel-feriados";
import { anosComFeriados, listarFeriados } from "@/modules/feriados/queries";

export const metadata: Metadata = { title: "Feriados e férias" };

export default async function PaginaFeriados({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  await exigirSessao();
  const { ano: anoBruto } = await searchParams;
  const anoAtual = hojeCalendario().getUTCFullYear();
  const pedido = Number(anoBruto);
  const ano = Number.isInteger(pedido) && pedido >= 2000 && pedido <= 2100 ? pedido : anoAtual;

  const [itens, anos] = await Promise.all([listarFeriados(ano), anosComFeriados()]);

  return (
    <>
      <CabecalhoPagina titulo="Feriados e férias" descricao="Datas que afetam prazos, compras e a agenda." />
      <PainelFeriados
        ano={ano}
        anos={anos}
        itens={itens.map((f) => ({ ...f, data: f.data.toISOString(), dataFim: f.dataFim?.toISOString() ?? null }))}
      />
    </>
  );
}
