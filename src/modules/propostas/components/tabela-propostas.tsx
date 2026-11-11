import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { calcularTotais } from "@/lib/dominio/preco";
import { formatarData, formatarMoeda } from "@/lib/formatadores";
import { formatarRevisao } from "@/lib/dominio/numeracao-proposta";

import type { PropostaDaLista } from "../queries";
import { ROTULO_STATUS_PROPOSTA } from "../schemas";

/** Valor de exibição: um valor (uma opção) ou "de X a Y" (várias opções). Já com a nota fiscal, se houver. */
export function valorDaProposta(p: PropostaDaLista): string {
  if (p.status === "APROVADA" && p.valorAprovadoCentavos !== null) return formatarMoeda(p.valorAprovadoCentavos);
  const totais = calcularTotais(
    p.itens.map((i) => ({ opcaoId: i.opcaoId, precoTotalCentavos: i.precoTotalCentavos, medidas: [] })),
    p.opcoes.map((o) => ({ id: o.id, descontoCentavos: o.descontoCentavos })),
    p.comNotaFiscal,
    p.acrescimoNotaPb,
  ).map((t) => t.totalCentavos);
  if (totais.length === 0) return "—";
  const menor = Math.min(...totais);
  const maior = Math.max(...totais);
  return menor === maior ? formatarMoeda(menor) : `${formatarMoeda(menor)} a ${formatarMoeda(maior)}`;
}

export function diasDesdeOEnvio(enviadaEm: Date | null, agora: Date = new Date()): number | null {
  if (!enviadaEm) return null;
  return Math.max(0, Math.floor((agora.getTime() - enviadaEm.getTime()) / 86_400_000));
}

const variante = (s: string) => (s === "APROVADA" ? "default" : s === "RECUSADA" || s === "CANCELADA" ? "destructive" : "secondary");

export function TabelaPropostas({ propostas, mostrarProjeto = true }: { propostas: PropostaDaLista[]; mostrarProjeto?: boolean }) {
  return (
    <ul className="grid gap-2">
      {propostas.map((p) => {
        const dias = p.status === "ENVIADA" ? diasDesdeOEnvio(p.enviadaEm) : null;
        return (
          <li key={p.id}>
            <Link href={`/propostas/${p.id}`} className="hover:bg-muted/50 grid gap-1 rounded-xl border p-4 transition-colors sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {p.numero}
                  {p.revisao > 0 ? <span className="text-muted-foreground text-xs font-normal">{formatarRevisao(p.revisao)}</span> : null}
                  {p.parte ? <span className="text-muted-foreground text-xs font-normal">{p.parte}</span> : null}
                  <Badge variant={variante(p.status)}>{ROTULO_STATUS_PROPOSTA[p.status]}</Badge>
                  {p.comNotaFiscal ? <Badge variant="outline">Com nota</Badge> : null}
                </p>
                <p className="text-muted-foreground truncate text-sm">
                  {p.clienteNome}
                  {mostrarProjeto ? ` · ${p.projeto.codigo} ${p.projeto.titulo}` : ""}
                </p>
              </div>
              <div className="text-sm sm:text-right">
                <p className="font-semibold tabular-nums">{valorDaProposta(p)}</p>
                <p className="text-muted-foreground text-xs">
                  {formatarData(p.data)}
                  {dias !== null ? ` · enviada há ${dias} ${dias === 1 ? "dia" : "dias"}` : ""}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
