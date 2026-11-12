import { MessageCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { somarDias } from "@/lib/dominio/calendario";
import { etapaAtual, ROTULO_STATUS_ETAPA } from "@/lib/dominio/etapas";
import { ROTULO_STATUS_PROJETO, type StatusProjeto } from "@/lib/dominio/funil";
import { formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

import type { ObraDetalhe } from "../queries";
import { CartaoCondominio } from "./cartao-condominio";
import { CartaoPrazo } from "./cartao-prazo";
import { SemaforoTag } from "./semaforo-tag";

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="text-sm">{children ?? <span className="text-muted-foreground">Não informado</span>}</dd>
    </div>
  );
}

type Props = {
  obra: ObraDetalhe;
  nomes: Record<string, string>;
  pedidoDeAvaliacao: { link: string | null; faltando: string[] };
};

/** Visão geral da obra: andamento, prazo, avisos, condomínio, garantia e (ao concluir) o pedido de avaliação. */
export function ResumoDaObra({ obra, nomes, pedidoDeAvaliacao }: Props) {
  const concluida = obra.status === "CONCLUIDO";
  const ativas = obra.etapas.filter((e) => e.status !== "DISPENSADA");
  const feitas = ativas.filter((e) => e.status === "CONCLUIDA").length;
  const atual = etapaAtual(obra.etapas);
  const atrasadas = obra.etapas.filter((e) => e.atrasada).length;
  const marco = obra.etapas.find((e) => e.marcoGarantia && e.status === "CONCLUIDA" && e.fimReal);
  const garantiaAte = marco?.fimReal ? somarDias(marco.fimReal, obra.garantiaDias) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {obra.avisos.length > 0 ? (
        <section role="note" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm lg:col-span-2" aria-labelledby="titulo-avisos">
          <h2 id="titulo-avisos" className="mb-1 flex items-center gap-2 font-medium">
            <TriangleAlert className="size-4" aria-hidden /> Atenção
          </h2>
          <ul className="list-disc pl-5">
            {obra.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid content-start gap-3 rounded-xl border p-4" aria-labelledby="titulo-andamento">
        <h2 id="titulo-andamento" className="font-medium">
          Andamento
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item rotulo="Situação">
            <span className="flex flex-wrap items-center gap-2">
              {ROTULO_STATUS_PROJETO[obra.status as StatusProjeto]}
              {obra.semaforo ? <SemaforoTag semaforo={obra.semaforo} /> : null}
            </span>
          </Item>
          <Item rotulo="Etapas concluídas">{ativas.length > 0 ? `${feitas} de ${ativas.length}` : null}</Item>
          <Item rotulo="Etapa atual">
            {atual ? (
              <>
                {atual.nome} <span className="text-muted-foreground">({ROTULO_STATUS_ETAPA[atual.status].toLowerCase()})</span>
              </>
            ) : concluida ? (
              "Todas concluídas"
            ) : null}
          </Item>
          <Item rotulo="Etapas atrasadas">{atrasadas > 0 ? <strong className="text-destructive">{atrasadas}</strong> : "Nenhuma"}</Item>
        </dl>
        <div>
          <Link href={`/obras/${obra.id}?aba=etapas`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Ver etapas e prazo
          </Link>
        </div>
      </section>

      <CartaoPrazo obra={obra} nomes={nomes} />

      <section className="grid content-start gap-3 rounded-xl border p-4" aria-labelledby="titulo-dados">
        <h2 id="titulo-dados" className="font-medium">
          Obra
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item rotulo="Cliente">
            <Link href={`/clientes/${obra.cliente.id}`} className="underline">
              {obra.cliente.nome}
            </Link>
          </Item>
          <Item rotulo="Responsável">{obra.responsavel?.nome ?? null}</Item>
          <Item rotulo="Endereço da obra">{obra.enderecoTexto}</Item>
          <Item rotulo="Valor fechado">{obra.valorFechadoCentavos !== null ? formatarMoeda(obra.valorFechadoCentavos) : null}</Item>
        </dl>
      </section>

      {obra.condominio ? <CartaoCondominio projetoId={obra.id} condominio={obra.condominio} concluida={concluida} /> : null}

      {garantiaAte && marco?.fimReal ? (
        <section className="grid content-start gap-2 rounded-xl border p-4" aria-labelledby="titulo-garantia">
          <h2 id="titulo-garantia" className="flex items-center gap-2 font-medium">
            <ShieldCheck className="size-4" aria-hidden /> Garantia
          </h2>
          <p className="text-sm">
            Regulagem de acessórios <strong>{obra.hoje <= garantiaAte ? "em garantia" : "encerrada"}</strong> até {formatarDataCalendario(garantiaAte)} ({obra.garantiaDias} dias a partir da conclusão de “{marco.nome}” em{" "}
            {formatarDataCalendario(marco.fimReal)}). Depois disso, a visita é cobrada.
          </p>
          <p className="text-muted-foreground text-xs">A garantia dos vidros vale só até a instalação.</p>
        </section>
      ) : null}

      {concluida ? (
        <section className="grid content-start gap-2 rounded-xl border p-4" aria-labelledby="titulo-avaliacao">
          <h2 id="titulo-avaliacao" className="flex items-center gap-2 font-medium">
            <MessageCircle className="size-4" aria-hidden /> Avaliação no Google
          </h2>
          {pedidoDeAvaliacao.link ? (
            <>
              <p className="text-sm">A obra foi entregue. Peça a avaliação pelo WhatsApp: a mensagem já vai pronta.</p>
              <div>
                <a href={pedidoDeAvaliacao.link} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "sm" }))}>
                  <MessageCircle aria-hidden /> Pedir avaliação pelo WhatsApp
                </a>
              </div>
            </>
          ) : (
            <p className="text-sm">
              Não dá para montar a mensagem ainda: falta {pedidoDeAvaliacao.faltando.map((f) => (f === "linkAvaliacao" ? "o link de avaliação do Google (Configurações, Empresa)" : f === "nomeFantasia" ? "o nome da empresa (Configurações, Empresa)" : f)).join(" e ")}.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
