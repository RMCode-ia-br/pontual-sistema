import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { exigirSessao } from "@/lib/auth/sessao";
import { ROTULO_FORMA, type FormaPagamento } from "@/lib/dominio/parcelas";
import { formatarData, formatarDataCalendario, formatarDataHora, formatarMoeda } from "@/lib/formatadores";
import { Anexos } from "@/modules/anexos/components/anexos";
import { listarAnexos } from "@/modules/anexos/queries";
import { BotaoEstornar } from "@/modules/financeiro/components/acoes-do-lancamento";
import { obterLancamento } from "@/modules/financeiro/queries";

export const metadata: Metadata = { title: "Lançamento" };

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function PaginaDoLancamento({ params }: { params: Promise<{ id: string }> }) {
  await exigirSessao();
  const { id } = await params;
  const l = await obterLancamento(id);
  if (!l) notFound();
  const anexos = await listarAnexos("Lancamento", l.id);
  const entrada = l.tipo === "ENTRADA";

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/financeiro/contas/${l.conta.id}`} className="text-muted-foreground hover:underline">
          ← {l.conta.nome}
        </Link>
      </p>
      <CabecalhoPagina
        titulo={l.descricao}
        descricao={`${entrada ? "Entrada" : "Saída"} de ${formatarMoeda(l.valorCentavos)} em ${formatarDataCalendario(l.data)}`}
        acoes={l.estornadoEm ? null : <BotaoEstornar lancamentoId={l.id} transferencia={l.transferencia !== null} comTitulo={l.contaReceberId !== null || l.contaPagarId !== null} />}
      />

      <div className="grid gap-6">
        {l.estornadoEm ? (
          <p role="status" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
            <strong>Estornado em {formatarData(l.estornadoEm)}.</strong> Motivo: {l.motivoEstorno}. Não conta no saldo, no fluxo nem no DRE.
          </p>
        ) : null}

        <dl className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Item rotulo="Conta">
            <Link href={`/financeiro/contas/${l.conta.id}`} className="hover:underline">
              {l.conta.nome}
            </Link>
          </Item>
          <Item rotulo="Categoria">{l.categoria ? l.categoria.nome : l.transferencia ? "Transferência (fora do DRE)" : "Sem categoria"}</Item>
          <Item rotulo="Forma">{l.forma ? (ROTULO_FORMA[l.forma as FormaPagamento] ?? l.forma) : "—"}</Item>
          {l.transferencia ? (
            <Item rotulo="Outra ponta da transferência">
              <Link href={`/financeiro/lancamentos/${l.transferencia.id}`} className="hover:underline">
                {l.transferencia.contaNome}
              </Link>
            </Item>
          ) : null}
          {l.fornecedor ? <Item rotulo="Fornecedor">{l.fornecedor.nome}</Item> : null}
          {l.cliente ? (
            <Item rotulo="Cliente">
              <Link href={`/clientes/${l.cliente.id}`} className="hover:underline">
                {l.cliente.nome}
              </Link>
            </Item>
          ) : null}
          {l.projeto ? (
            <Item rotulo="Obra">
              <Link href={`/obras/${l.projeto.id}`} className="hover:underline">
                {l.projeto.codigo} · {l.projeto.titulo}
              </Link>
            </Item>
          ) : null}
          <Item rotulo="Marcas">
            <span className="flex flex-wrap gap-1">
              {l.comNotaFiscal ? <Badge variant="outline">Com nota</Badge> : null}
              {l.conciliado ? <Badge variant="secondary">Conciliado</Badge> : null}
              {!l.comNotaFiscal && !l.conciliado ? "—" : null}
            </span>
          </Item>
          <Item rotulo="Registrado em">{formatarDataHora(l.criadoEm)}</Item>
          {l.observacao ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <Item rotulo="Observação">
                <span className="whitespace-pre-line">{l.observacao}</span>
              </Item>
            </div>
          ) : null}
        </dl>

        <Anexos entidadeTipo="Lancamento" entidadeId={l.id} anexos={anexos} titulo="Comprovantes" camera />
      </div>
    </>
  );
}
