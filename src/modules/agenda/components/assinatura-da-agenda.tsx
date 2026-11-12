"use client";

import { CalendarSync, Check, Copy, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Campo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatarDataHora } from "@/lib/formatadores";
import { montarUrlDoApp } from "@/lib/url-base";

import { criarFeedAgenda, revogarFeedAgenda } from "../actions/feed";
import type { FeedDaAgenda } from "../queries";

/**
 * Assinar a agenda no Google Agenda (ou Apple/Outlook) por um link secreto (.ics).
 * O link completo aparece UMA vez, logo depois de criado; depois só dá para desligar.
 */
export function AssinaturaDaAgenda({ feeds }: { feeds: FeedDaAgenda[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [novoLink, setNovoLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pendente, iniciar] = useTransition();

  function criar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const nome = String(new FormData(evento.currentTarget).get("nome") ?? "");
    iniciar(async () => {
      const r = await criarFeedAgenda({ nome });
      if (!r.ok || !r.dados) {
        toast.error(r.ok ? "Não foi possível criar o link." : r.erro);
        return;
      }
      setNovoLink(montarUrlDoApp(`/api/public/agenda/${r.dados.token}`));
      setCopiado(false);
      router.refresh();
    });
  }

  function desligar(id: string) {
    iniciar(async () => {
      const r = await revogarFeedAgenda(id);
      if (r.ok) {
        toast.success(r.mensagem ?? "Link desligado.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  async function copiar() {
    if (!novoLink) return;
    try {
      await navigator.clipboard.writeText(novoLink);
      setCopiado(true);
    } catch {
      toast.message("Não deu para copiar sozinho. Selecione o link e copie à mão.");
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAberto(true)}>
        <CalendarSync aria-hidden /> Assinar no calendário
      </Button>
      <Dialog
        open={aberto}
        onOpenChange={(a) => {
          setAberto(a);
          if (!a) setNovoLink(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assinar a agenda no calendário</DialogTitle>
            <DialogDescription>
              Cada compromisso aparece no Google Agenda (ou Apple/Outlook) e se atualiza sozinho. No Google Agenda: “Outras agendas” → “De um URL” → cole o link.
            </DialogDescription>
          </DialogHeader>

          <p className="text-muted-foreground text-sm">
            Quem tem o link vê a agenda da empresa (tipo, cliente, local e horário; sem valores e sem as observações). Desligue o link quando não precisar mais.
          </p>

          {novoLink ? (
            <div className="grid gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3" role="status">
              <p className="text-sm font-medium">Link criado. Copie agora: ele não será mostrado de novo.</p>
              <div className="flex gap-2">
                <Input readOnly value={novoLink} aria-label="Link da agenda" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                <Button type="button" variant="outline" onClick={copiar}>
                  {copiado ? <Check aria-hidden /> : <Copy aria-hidden />} {copiado ? "Copiado" : "Copiar"}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={criar} className="flex flex-wrap items-end gap-2">
              <Campo id="nome-do-link" rotulo="Nome do link (opcional)" className="min-w-48 flex-1">
                <Input id="nome-do-link" name="nome" maxLength={80} placeholder="Ex.: Celular do Marcelo" autoComplete="off" />
              </Campo>
              <Button type="submit" disabled={pendente}>
                {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Criar link
              </Button>
            </form>
          )}

          <section aria-labelledby="links-ativos" className="grid gap-2">
            <h3 id="links-ativos" className="text-sm font-medium">
              Links ativos
            </h3>
            {feeds.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum link ativo.</p>
            ) : (
              <ul className="grid gap-2">
                {feeds.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{f.nome || "Link sem nome"}</span>
                      <span className="text-muted-foreground text-xs">
                        Criado em {formatarDataHora(f.criadoEm)} · {f.ultimoAcessoEm ? `último acesso ${formatarDataHora(f.ultimoAcessoEm)}` : "ainda não usado"}
                      </span>
                    </span>
                    <Button type="button" variant="outline" size="sm" disabled={pendente} onClick={() => desligar(f.id)} aria-label={`Desligar o link ${f.nome || "sem nome"}`}>
                      <Trash2 aria-hidden /> Desligar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </DialogContent>
      </Dialog>
    </>
  );
}
