import { CreditCard, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { ROTULO_FORMA, ROTULO_GATILHO } from "@/lib/dominio/parcelas";
import { listarCondicoes } from "@/modules/condicoes-pagamento/queries";

export const metadata: Metadata = { title: "Condições de pagamento" };

export default async function PaginaCondicoes() {
  await exigirSessao();
  const condicoes = await listarCondicoes(true);
  return (
    <>
      <CabecalhoPagina
        titulo="Condições de pagamento"
        descricao="Modelos de cronograma que você escolhe na proposta. Ao aprovar, as parcelas a receber são geradas a partir deles."
        acoes={
          <Link href="/configuracoes/condicoes-pagamento/nova" className={buttonVariants()}>
            <Plus aria-hidden /> Nova condição
          </Link>
        }
      />
      {condicoes.length === 0 ? (
        <EstadoVazio icone={CreditCard} titulo="Nenhuma condição" descricao="Crie o primeiro modelo, por exemplo 50% de sinal + 50% na entrega." />
      ) : (
        <ul className="grid gap-2">
          {condicoes.map((c) => (
            <li key={c.id}>
              <Link href={`/configuracoes/condicoes-pagamento/${c.id}`} className="hover:bg-muted/50 grid gap-1 rounded-xl border p-4 transition-colors">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{c.nome}</p>
                  {c.ativo ? null : <Badge variant="destructive">Inativa</Badge>}
                </div>
                <p className="text-muted-foreground text-xs">
                  {c.parcelas.length === 0
                    ? (c.textoLivre ?? "Sem parcelas")
                    : c.parcelas.map((p) => `${(p.percentualPb / 100).toLocaleString("pt-BR")}% — ${ROTULO_GATILHO[p.gatilho].toLowerCase()}${p.forma ? ` (${ROTULO_FORMA[p.forma]})` : ""}`).join(" · ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
