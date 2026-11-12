"use client";

import { CalendarCheck, Copy, Download, ImageOff, Loader2, Share2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { AreaTexto, Campo } from "@/components/formulario";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ROTULO_MOMENTO } from "@/lib/dominio/portfolio";
import { formatarDataCalendario } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

import { marcarPublicacao } from "../actions/fotos";
import type { ObraDaGaleria } from "../queries-fotos";

/**
 * Uma obra da galeria: escolher as fotos (o par antes/depois já vem marcado), ajustar a legenda sugerida, baixar o
 * kit (ZIP com as fotos e a legenda) e marcar que já foi publicada. A legenda nunca leva dados do cliente.
 */
export function KitDePostagem({ obra }: { obra: ObraDaGaleria }) {
  const router = useRouter();
  const [escolhidas, setEscolhidas] = useState<Set<string>>(() => new Set(obra.sugeridas));
  const [legenda, setLegenda] = useState(obra.legenda.texto);
  const [pendente, iniciar] = useTransition();
  const ids = obra.fotos.filter((f) => escolhidas.has(f.id)).map((f) => f.id);
  const pendencias = /\{\{[^}]+\}\}/.test(legenda);

  const consulta = new URLSearchParams({ fotos: ids.join(","), legenda: legenda.slice(0, 1500) });
  const linkDoKit = `/api/obras/${obra.id}/kit?${consulta.toString()}`;

  function alternar(id: string, marcada: boolean) {
    setEscolhidas((atual) => {
      const novo = new Set(atual);
      if (marcada) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(legenda);
      toast.success("Legenda copiada.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  function publicar(publicada: boolean) {
    iniciar(async () => {
      const r = await marcarPublicacao({ projetoId: obra.id, publicada });
      if (r.ok) {
        toast.success(r.mensagem ?? "Salvo.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  return (
    <article aria-labelledby={`obra-${obra.id}`} className="grid gap-4 rounded-xl border p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`obra-${obra.id}`} className="font-medium">
            <Link href={`/obras/${obra.id}?aba=fotos`} className="hover:underline">
              {obra.titulo}
            </Link>
          </h2>
          <p className="text-muted-foreground text-xs">
            {obra.codigo} · {obra.tiposServico.length > 0 ? obra.tiposServico.join(", ") : "Tipo de serviço não informado"}
            {obra.cidade ? ` · ${obra.cidade}${obra.uf ? `/${obra.uf}` : ""}` : ""} · {obra.clienteNome}
          </p>
        </div>
        {obra.publicadoInstagramEm ? (
          <Badge variant="secondary">
            <CalendarCheck aria-hidden /> Publicada em {formatarDataCalendario(obra.publicadoInstagramEm)}
          </Badge>
        ) : (
          <Badge variant="outline">Ainda não publicada</Badge>
        )}
      </header>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label={`Fotos de ${obra.titulo}`}>
        {obra.fotos.map((f) => (
          <li key={f.id} className="grid content-start gap-1.5">
            <label className="relative block cursor-pointer">
              <span className="bg-muted block aspect-4/3 overflow-hidden rounded-lg">
                {f.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage
                  <img src={f.url} alt={f.descricao ?? `Foto ${f.momento ? ROTULO_MOMENTO[f.momento].toLowerCase() : ""} da obra`} loading="lazy" className="size-full object-cover" />
                ) : (
                  <span className="text-muted-foreground flex size-full flex-col items-center justify-center gap-1 text-xs">
                    <ImageOff className="size-5" aria-hidden /> Indisponível
                  </span>
                )}
              </span>
              <input
                type="checkbox"
                checked={escolhidas.has(f.id)}
                onChange={(e) => alternar(f.id, e.target.checked)}
                aria-label={`Incluir no kit: foto ${f.momento ? ROTULO_MOMENTO[f.momento].toLowerCase() : ""} de ${formatarDataCalendario(f.criadoEm)}`}
                className="accent-primary absolute top-2 left-2 size-5"
              />
            </label>
            <p className="text-xs">
              <strong className="font-medium">{f.momento ? ROTULO_MOMENTO[f.momento] : "Foto"}</strong>
              <span className="text-muted-foreground"> · {formatarDataCalendario(f.criadoEm)}</span>
            </p>
          </li>
        ))}
      </ul>

      <Campo id={`legenda-${obra.id}`} rotulo="Legenda sugerida" dica="Só tipo de serviço, linha, cidade e UF: nunca o nome, o telefone nem o endereço do cliente. Ajuste como quiser.">
        <AreaTexto id={`legenda-${obra.id}`} rows={3} maxLength={1500} value={legenda} onChange={(e) => setLegenda(e.target.value)} />
      </Campo>
      {pendencias ? (
        <p role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm">
          Complete o que está entre chaves {"{{ }}"} antes de postar: faltam dados no cadastro da obra (tipo de serviço, linha de alumínio ou endereço).
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={copiar}>
          <Copy aria-hidden /> Copiar legenda
        </Button>
        {ids.length > 0 ? (
          <a href={linkDoKit} className={cn(buttonVariants())} aria-label={`Baixar o kit de ${obra.titulo} (${ids.length} ${ids.length === 1 ? "foto" : "fotos"})`}>
            <Download aria-hidden /> Baixar kit ({ids.length} {ids.length === 1 ? "foto" : "fotos"})
          </a>
        ) : (
          <Button type="button" disabled>
            <Download aria-hidden /> Escolha ao menos uma foto
          </Button>
        )}
        {obra.publicadoInstagramEm ? (
          <Button type="button" variant="ghost" onClick={() => publicar(false)} disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Desmarcar publicação
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => publicar(true)} disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" aria-hidden /> : <Share2 aria-hidden />} Marcar como publicada
          </Button>
        )}
      </div>
    </article>
  );
}
