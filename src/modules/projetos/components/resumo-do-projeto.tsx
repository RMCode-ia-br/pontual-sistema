import Link from "next/link";

import { formatarData, formatarMoeda } from "@/lib/formatadores";
import { ROTULO_ORIGEM } from "@/modules/clientes/schemas";

import type { ProjetoCompleto } from "../queries";
import { ROTULO_FASE_OBRA, ROTULO_INTERESSE, ROTULO_PORTE, ROTULO_TEMPERATURA, ROTULO_TIPO_SERVICO } from "../schemas";

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="text-sm">{children ?? <span className="text-muted-foreground">Não informado</span>}</dd>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="grid content-start gap-3 rounded-xl border p-4">
      <h2 className="font-medium">{titulo}</h2>
      <dl className="grid gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

const rotulo = <T extends string>(mapa: Record<T, string>, valor: string | null): string | null => (valor ? (mapa[valor as T] ?? valor) : null);

/** Visão geral do projeto: quem, onde, qualificação, valores e (se for o caso) por que foi perdido. */
export function ResumoDoProjeto({ projeto: p }: { projeto: ProjetoCompleto }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Bloco titulo="Quem e onde">
        <Item rotulo="Cliente">
          <Link href={`/clientes/${p.cliente.id}`} className="underline">
            {p.cliente.nome}
          </Link>
        </Item>
        <Item rotulo="Responsável">{p.responsavel?.nome ?? null}</Item>
        <Item rotulo="Endereço da obra">{p.enderecoObra?.texto ?? null}</Item>
        <Item rotulo="O que o cliente quer">{p.tiposServico.length ? p.tiposServico.map((t) => ROTULO_TIPO_SERVICO[t as keyof typeof ROTULO_TIPO_SERVICO] ?? t).join(", ") : null}</Item>
        <Item rotulo="Arquiteto/designer">
          {p.arquiteto ? (
            <Link href={`/clientes/${p.arquiteto.id}`} className="underline">
              {p.arquiteto.nome}
            </Link>
          ) : null}
        </Item>
        <Item rotulo="Construtora">
          {p.construtora ? (
            <Link href={`/clientes/${p.construtora.id}`} className="underline">
              {p.construtora.nome}
            </Link>
          ) : null}
        </Item>
      </Bloco>

      <Bloco titulo="Qualificação">
        <Item rotulo="Origem">{[rotulo(ROTULO_ORIGEM, p.origem), p.origemDetalhe].filter(Boolean).join(" — ") || null}</Item>
        <Item rotulo="Interesse">{rotulo(ROTULO_INTERESSE, p.interesse)}</Item>
        <Item rotulo="Temperatura">{rotulo(ROTULO_TEMPERATURA, p.temperatura)}</Item>
        <Item rotulo="Porte">{rotulo(ROTULO_PORTE, p.porte)}</Item>
        <Item rotulo="Fase da obra do cliente">{rotulo(ROTULO_FASE_OBRA, p.faseDaObra)}</Item>
        <Item rotulo="Criado em">{formatarData(p.criadoEm)}</Item>
      </Bloco>

      <Bloco titulo="Valores e prazo">
        <Item rotulo="Valor estimado">{p.valorEstimadoCentavos !== null ? formatarMoeda(p.valorEstimadoCentavos) : null}</Item>
        <Item rotulo="Investimento previsto pelo cliente">{p.investimentoPrevistoCentavos !== null ? formatarMoeda(p.investimentoPrevistoCentavos) : null}</Item>
        <Item rotulo="Prazo desejado pelo cliente">{p.prazoDesejado}</Item>
        <Item rotulo="Parado na fase atual">{p.diasParado === 0 ? "Mudou hoje" : `${p.diasParado} ${p.diasParado === 1 ? "dia" : "dias"}`}</Item>
      </Bloco>

      {p.status === "PERDIDO" ? (
        <Bloco titulo="Por que foi perdido">
          <Item rotulo="Motivo">{p.motivoPerda?.nome ?? null}</Item>
          <Item rotulo="Perdido em">{p.perdidoEm ? formatarData(p.perdidoEm) : null}</Item>
          <Item rotulo="Concorrente">{p.concorrente}</Item>
          <Item rotulo="Detalhes">{p.motivoPerdaDetalhe}</Item>
        </Bloco>
      ) : null}

      {p.observacoes ? (
        <section className="rounded-xl border p-4 lg:col-span-2">
          <h2 className="mb-2 font-medium">Observações</h2>
          <p className="text-sm whitespace-pre-line">{p.observacoes}</p>
        </section>
      ) : null}
    </div>
  );
}
