import { ROTULO_GRUPO_PRAZO } from "@/lib/dominio/etapas";
import { formatarDataCalendario } from "@/lib/formatadores";

import type { ObraDetalhe } from "../queries";
import { FormPrazoDaObra } from "./form-prazo-da-obra";
import { SemaforoTag } from "./semaforo-tag";

const fmt = (d: string) => formatarDataCalendario(d);

function dias(n: number, tipo: "UTEIS" | "CORRIDOS"): string {
  const abs = Math.abs(n);
  return `${abs} ${tipo === "UTEIS" ? (abs === 1 ? "dia útil" : "dias úteis") : abs === 1 ? "dia corrido" : "dias corridos"}`;
}

/** O prazo da obra: o que foi prometido, quanto falta e o efeito das pausas. Tudo calculado na consulta. */
export function CartaoPrazo({ obra, nomes }: { obra: ObraDetalhe; nomes: Record<string, string> }) {
  const p = obra.prazo;
  const concluida = obra.status === "CONCLUIDO";
  const pontualidade = p.pontualidade?.avaliavel ? p.pontualidade : null;

  return (
    <section className="grid content-start gap-3 rounded-xl border p-4" aria-labelledby="titulo-prazo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-prazo" className="font-medium">
          Prazo
        </h2>
        {concluida ? null : <FormPrazoDaObra projetoId={obra.id} atual={{ modo: p.modo, diasTotais: p.diasTotais, porGrupo: p.porGrupo, tipoDias: p.tipoDias }} nomes={nomes} rotulo={p.definido ? "Ajustar prazo" : "Definir prazo"} />}
      </div>

      {!p.definido ? (
        <p className="text-sm">
          <strong>Sem prazo definido.</strong> As etapas ficam sem datas previstas e o prazo prometido não é calculado. Use “Definir prazo” com os dias combinados na proposta.
        </p>
      ) : (
        <>
          <p className="text-sm">
            Combinado: <strong>{dias(p.diasTotais!, p.tipoDias)}</strong>
            {p.porGrupo ? (
              <span className="text-muted-foreground">
                {" "}
                ({(["MATERIAL", "EXECUCAO", "VIDROS_FINALIZACAO"] as const).filter((g) => p.porGrupo![g] > 0).map((g) => `${ROTULO_GRUPO_PRAZO[g]} ${p.porGrupo![g]}`).join(" + ")})
              </span>
            ) : null}
            , contados a partir da conclusão da medição exata.
          </p>

          {!p.relogioIniciado ? (
            <p className="text-sm">
              <span className="font-medium">O prazo ainda não começou a contar.</span> Ele parte da conclusão da medição exata.
              {p.previsaoProvisoria ? ` Pelas datas provisórias, a obra terminaria em ${fmt(p.previsaoProvisoria)} (não é uma promessa).` : ""}
            </p>
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground text-xs">Começou a contar em</dt>
                <dd>{fmt(p.inicio!)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Prazo prometido</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <strong>{fmt(p.comPausas!)}</strong>
                  {p.semaforo ? <SemaforoTag semaforo={p.semaforo} /> : null}
                </dd>
              </div>
              {p.diasRestantes !== null ? (
                <div>
                  <dt className="text-muted-foreground text-xs">Situação</dt>
                  <dd>{p.diasRestantes > 0 ? `Faltam ${dias(p.diasRestantes, p.tipoDias)}` : p.diasRestantes === 0 ? "Vence hoje" : `${dias(p.diasRestantes, p.tipoDias)} de atraso`}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted-foreground text-xs">Pausas justificadas</dt>
                <dd>{p.diasPausaJustificada > 0 ? `${dias(p.diasPausaJustificada, p.tipoDias)} somados (sem elas seria ${fmt(p.semPausas!)})` : "Nenhuma"}</dd>
              </div>
            </dl>
          )}

          {concluida && obra.dataConclusao ? (
            <div className="bg-muted/50 grid gap-1 rounded-lg p-3 text-sm" role="status">
              <p>
                Concluída em <strong>{fmt(obra.dataConclusao)}</strong>.
              </p>
              {pontualidade ? (
                <>
                  <p>
                    {pontualidade.pontual
                      ? pontualidade.desvioDias < 0
                        ? `Pontual: ${dias(pontualidade.desvioDias, p.tipoDias)} antes do prazo prometido.`
                        : "Pontual: no dia do prazo prometido."
                      : `Atrasada: ${dias(pontualidade.desvioDias, p.tipoDias)} depois do prazo prometido.`}
                  </p>
                  {p.diasPausaJustificada > 0 ? (
                    <p className="text-muted-foreground">
                      Sem considerar as pausas: {pontualidade.pontualSemPausas ? "pontual" : `atrasada em ${dias(pontualidade.desvioSemPausasDias, p.tipoDias)}`}.
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
