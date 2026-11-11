import { Layers, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { cn } from "@/lib/utils";
import { listarTipologias } from "@/modules/tipologias/queries";
import { ROTULO_CATEGORIA_MARKUP, ROTULO_CATEGORIA_TIPOLOGIA, ROTULO_COBRANCA } from "@/modules/tipologias/schemas";

export const metadata: Metadata = { title: "Tipologias e preços" };

export default async function PaginaTipologias({ searchParams }: { searchParams: Promise<{ situacao?: string }> }) {
  await exigirSessao();
  const { situacao: bruta } = await searchParams;
  const situacao = bruta === "inativas" || bruta === "todas" ? bruta : "ativas";
  const tipologias = await listarTipologias(situacao);

  return (
    <>
      <CabecalhoPagina
        titulo="Tipologias e preços"
        descricao="Tipos de janela, porta, box e guarda-corpo, com a composição de custo e a tabela de preços usadas nas propostas."
        acoes={
          <Link href="/tipologias/nova" className={buttonVariants()}>
            <Plus aria-hidden /> Nova tipologia
          </Link>
        }
      />

      <nav aria-label="Situação" className="mb-4 flex gap-1 text-sm">
        {(["ativas", "inativas", "todas"] as const).map((s) => (
          <Link
            key={s}
            href={s === "ativas" ? "/tipologias" : `/tipologias?situacao=${s}`}
            aria-current={situacao === s ? "page" : undefined}
            className={cn("rounded-md px-3 py-1.5", situacao === s ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground")}
          >
            {s === "ativas" ? "Ativas" : s === "inativas" ? "Inativas" : "Todas"}
          </Link>
        ))}
      </nav>

      {tipologias.length === 0 ? (
        <EstadoVazio icone={Layers} titulo="Nenhuma tipologia" descricao="Cadastre a primeira tipologia (ex.: janela de correr) para usá-la nas propostas." acao={<Link href="/tipologias/nova" className={buttonVariants()}>Nova tipologia</Link>} />
      ) : (
        <ul className="grid gap-2">
          {tipologias.map((t) => (
            <li key={t.id}>
              <Link href={`/tipologias/${t.id}`} className="hover:bg-muted/50 grid gap-1 rounded-xl border p-4 transition-colors sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="font-medium">{t.nome}</p>
                  <p className="text-muted-foreground text-xs">
                    {ROTULO_CATEGORIA_TIPOLOGIA[t.categoria]} · {ROTULO_COBRANCA[t.cobrancaPadrao]} · markup {ROTULO_CATEGORIA_MARKUP[t.categoriaMarkup].toLowerCase()} · {t._count.insumos} insumo(s) · {t._count.maoDeObra} mão de obra · {t._count.precos} preço(s)
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {t.exemplo ? <Badge variant="outline">Exemplo — validar</Badge> : null}
                  {t.revisarTexto ? <Badge variant="outline">Revisar texto</Badge> : null}
                  {t.ativo ? null : <Badge variant="destructive">Inativa</Badge>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
