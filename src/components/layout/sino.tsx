"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatarDataHora } from "@/lib/formatadores";
import { listarNotificacoes, marcarNotificacoesComoLidas, type NotificacaoItem } from "@/modules/notificacoes/actions";

export function Sino({ naoLidasInicial }: { naoLidasInicial: number }) {
  const [naoLidas, setNaoLidas] = useState(naoLidasInicial);
  const [itens, setItens] = useState<NotificacaoItem[] | null>(null);
  const [erro, setErro] = useState(false);

  async function aoAbrir(aberto: boolean) {
    if (!aberto) return;
    try {
      setErro(false);
      setItens(await listarNotificacoes());
      if (naoLidas > 0) {
        await marcarNotificacoesComoLidas();
        setNaoLidas(0);
      }
    } catch {
      setErro(true);
    }
  }

  return (
    <Popover onOpenChange={aoAbrir}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={naoLidas > 0 ? `Notificações: ${naoLidas} não lidas` : "Notificações"}
          />
        }
      >
        <Bell aria-hidden />
        {naoLidas > 0 ? (
          <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-bold">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2 text-sm font-medium">Notificações</div>
        <div className="max-h-80 overflow-y-auto">
          {erro ? (
            <p className="text-destructive p-4 text-sm" role="alert">
              Não foi possível carregar as notificações.
            </p>
          ) : itens === null ? (
            <p className="text-muted-foreground p-4 text-sm">Carregando...</p>
          ) : itens.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">
              Nenhuma notificação por enquanto. Novos contatos, visitas de amanhã e parcelas vencendo aparecerão aqui.
            </p>
          ) : (
            <ul>
              {itens.map((n) => (
                <li key={n.id} className="border-b px-3 py-2 last:border-0">
                  {n.link ? (
                    <Link href={n.link} className="text-sm font-medium hover:underline">
                      {n.titulo}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium">{n.titulo}</p>
                  )}
                  {n.texto ? <p className="text-muted-foreground text-xs">{n.texto}</p> : null}
                  <p className="text-muted-foreground mt-0.5 text-[11px]">{formatarDataHora(n.criadoEm)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
