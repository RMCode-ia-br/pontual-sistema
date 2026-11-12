import { Images } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FiltroSelect } from "@/components/lista/filtros-da-lista";
import { Button } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { ROTULO_TIPO_SERVICO, TIPOS_SERVICO } from "@/modules/projetos/schemas";
import { KitDePostagem } from "@/modules/obras/components/kit-de-postagem";
import { LIMITE_DE_FOTOS_NA_GALERIA, lerFiltrosDaGaleria, listarGaleria } from "@/modules/obras/queries-fotos";

export const metadata: Metadata = { title: "Galeria de obras" };

export default async function PaginaGaleria({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const filtros = lerFiltrosDaGaleria(await searchParams);
  const { obras, opcoes, truncado } = await listarGaleria(filtros);
  const filtrado = !!(filtros.tipo || filtros.cidade || filtros.ano || filtros.publicada);

  return (
    <>
      <CabecalhoPagina
        titulo="Galeria de obras"
        descricao="Fotos marcadas para o portfólio, de obras cujo cliente autoriza o uso. Escolha as fotos, ajuste a legenda, baixe o kit e marque o que já foi publicado no Instagram para não repetir."
      />

      <form method="get" action="/obras/galeria" role="search" className="mb-4 flex flex-wrap items-end gap-2">
        <FiltroSelect nome="tipo" rotulo="Tipo de serviço" valor={filtros.tipo} opcoes={TIPOS_SERVICO.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_SERVICO[t] }))} />
        <FiltroSelect nome="cidade" rotulo="Cidade" valor={filtros.cidade} opcoes={opcoes.cidades.map((c) => ({ valor: c, rotulo: c }))} />
        <FiltroSelect nome="ano" rotulo="Ano da foto" valor={filtros.ano ? String(filtros.ano) : undefined} opcoes={opcoes.anos.map((a) => ({ valor: String(a), rotulo: String(a) }))} />
        <FiltroSelect
          nome="publicada"
          rotulo="Instagram"
          valor={filtros.publicada}
          todos="Todas"
          opcoes={[
            { valor: "nao", rotulo: "Ainda não publicadas" },
            { valor: "sim", rotulo: "Já publicadas" },
          ]}
        />
        <Button type="submit" variant="secondary" className="h-9">
          Filtrar
        </Button>
        {filtrado ? (
          <Link href="/obras/galeria" className="text-muted-foreground inline-flex h-9 items-center px-2 text-sm hover:underline">
            Limpar
          </Link>
        ) : null}
      </form>

      {truncado ? (
        <p role="note" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Mostrando só as {LIMITE_DE_FOTOS_NA_GALERIA} fotos mais recentes. Use os filtros para chegar às demais.
        </p>
      ) : null}

      {obras.length === 0 ? (
        <EstadoVazio
          icone={Images}
          titulo={filtrado ? "Nenhuma obra com esses filtros" : "Nenhuma foto no portfólio ainda"}
          descricao="Envie as fotos pela aba Fotos da obra e deixe “No portfólio” marcado. A obra só aparece aqui se o cliente autoriza o uso das fotos."
        />
      ) : (
        <div className="grid gap-4">
          <p className="text-muted-foreground text-sm" role="status">
            {obras.length} {obras.length === 1 ? "obra" : "obras"} com fotos para o portfólio.
          </p>
          {obras.map((o) => (
            <KitDePostagem key={o.id} obra={o} />
          ))}
        </div>
      )}
    </>
  );
}
