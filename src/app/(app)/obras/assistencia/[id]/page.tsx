import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { exigirSessao } from "@/lib/auth/sessao";
import { formatarNumeroDoChamado, ROTULO_STATUS_CHAMADO, ROTULO_TIPO_PROBLEMA } from "@/lib/dominio/chamados";
import { dataLocalDoInstante, formatarData, formatarDataHora, formatarMoeda, formatarTelefone } from "@/lib/formatadores";
import { Anexos } from "@/modules/anexos/components/anexos";
import { listarAnexos } from "@/modules/anexos/queries";
import { ROTULO_STATUS_EVENTO } from "@/modules/agenda/schemas";
import { PainelDoChamado } from "@/modules/obras/components/painel-do-chamado";
import { SeloDaClassificacao } from "@/modules/obras/components/lista-de-chamados";
import { obterChamado } from "@/modules/obras/queries-chamados";

export const metadata: Metadata = { title: "Chamado" };

export default async function PaginaChamado({ params }: { params: Promise<{ id: string }> }) {
  await exigirSessao();
  const { id } = await params;
  const c = await obterChamado(id);
  if (!c) notFound();
  const anexos = await listarAnexos("Chamado", c.id);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/obras/assistencia" className="text-muted-foreground hover:underline">
          ← Voltar para a assistência
        </Link>
      </p>
      <CabecalhoPagina titulo={`Chamado ${formatarNumeroDoChamado(c.numero)}`} descricao={`${ROTULO_TIPO_PROBLEMA[c.tipoProblema]} · aberto em ${formatarData(c.abertoEm)}`} />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge variant={c.status === "RESOLVIDO" || c.status === "CANCELADO" ? "secondary" : "default"}>{ROTULO_STATUS_CHAMADO[c.status]}</Badge>
        <SeloDaClassificacao classificacao={c.classificacao} />
      </div>

      <div className="grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          <section aria-labelledby="sec-pedido" className="grid gap-3 rounded-xl border p-4 text-sm">
            <h2 id="sec-pedido" className="font-medium">
              Pedido
            </h2>
            <p className="whitespace-pre-line">{c.descricao}</p>
            <dl className="grid gap-1">
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">Cliente:</dt>
                <dd>
                  <Link href={`/clientes/${c.cliente.id}`} className="underline">
                    {c.cliente.nome}
                  </Link>
                  {c.cliente.whatsapp || c.cliente.telefone ? ` · ${formatarTelefone(c.cliente.whatsapp || c.cliente.telefone)}` : ""}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">Obra:</dt>
                <dd>
                  {c.projeto ? (
                    <Link href={`/obras/${c.projeto.id}`} className="underline">
                      {c.projeto.codigo} · {c.projeto.titulo}
                    </Link>
                  ) : (
                    "Sem obra vinculada"
                  )}
                </dd>
              </div>
            </dl>
            {c.solucao ? (
              <p className="bg-muted/50 rounded-lg p-3">
                <strong>Solução{c.resolvidoEm ? ` (${formatarData(c.resolvidoEm)})` : ""}:</strong> {c.solucao}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="sec-garantia-situacao" className="grid gap-2 rounded-xl border p-4 text-sm">
            <h2 id="sec-garantia-situacao" className="font-medium">
              Como a garantia foi conferida
            </h2>
            <p>{c.motivoClassificacao ?? "Sem registro do motivo."}</p>
            {c.garantia ? (
              <p className="text-muted-foreground">
                Hoje: instalação concluída em {formatarData(c.garantia.marcoConcluidoEm)}; a regulagem vale por {c.garantia.garantiaDias} dias, até {formatarData(c.garantia.garantiaAte)}.
              </p>
            ) : null}
            {c.classificacao !== c.classificacaoSugerida ? <p className="text-muted-foreground">A classificação foi ajustada manualmente (o sistema tinha sugerido outra).</p> : null}
          </section>

          <section aria-labelledby="sec-visitas" className="grid gap-2 rounded-xl border p-4 text-sm">
            <h2 id="sec-visitas" className="font-medium">
              Visitas
            </h2>
            {c.eventos.length === 0 ? (
              <p className="text-muted-foreground">Nenhuma visita agendada ainda.</p>
            ) : (
              <ul className="grid gap-1">
                {c.eventos.map((e) => (
                  <li key={e.id}>
                    <Link href={`/agenda/${e.id}`} className="underline">
                      {formatarDataHora(e.inicio)}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      · {ROTULO_STATUS_EVENTO[e.status as keyof typeof ROTULO_STATUS_EVENTO] ?? e.status}
                      {e.equipeNome ? ` · ${e.equipeNome}` : ""}
                      {e.responsavelNome ? ` · ${e.responsavelNome}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {c.conta ? (
            <section aria-labelledby="sec-cobranca" className="grid gap-1 rounded-xl border p-4 text-sm">
              <h2 id="sec-cobranca" className="font-medium">
                Cobrança da visita
              </h2>
              <p>
                {formatarMoeda(c.conta.valorCentavos)}
                {c.conta.vencimento ? ` · vence em ${formatarData(c.conta.vencimento)}` : ""} · {c.conta.status === "ABERTA" ? "em aberto" : c.conta.status.toLowerCase().replaceAll("_", " ")}
              </p>
            </section>
          ) : null}

          <Anexos entidadeTipo="Chamado" entidadeId={c.id} anexos={anexos} titulo="Fotos e arquivos do chamado" camera />
        </div>

        <PainelDoChamado
          id={c.id}
          status={c.status}
          classificacao={c.classificacao}
          classificacaoSugerida={c.classificacaoSugerida}
          cobrarVisita={c.cobrarVisita}
          valorCobradoCentavos={c.valorCobradoCentavos}
          temObra={c.projeto !== null}
          cobrancaGerada={c.conta !== null}
          solucao={c.solucao}
          hoje={dataLocalDoInstante(new Date())}
        />
      </div>
    </>
  );
}
