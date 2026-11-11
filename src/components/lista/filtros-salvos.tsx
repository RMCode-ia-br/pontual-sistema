"use client";

import { Bookmark, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { excluirFiltroSalvo, salvarFiltro } from "@/modules/filtros/actions";
import type { TelaComFiltroSalvo } from "@/modules/filtros/schemas";

type Props = {
  tela: TelaComFiltroSalvo;
  base: string;
  /** Query string atual da lista (sem "?"), para salvar. */
  consultaAtual: string;
  salvos: { id: string; nome: string; consulta: string }[];
};

/** "Meus filtros": aplica um filtro salvo ou guarda o que está na tela agora. */
export function FiltrosSalvos({ tela, base, consultaAtual, salvos }: Props) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();

  function salvar() {
    iniciar(async () => {
      const r = await salvarFiltro({ tela, nome, consulta: consultaAtual });
      if (r.ok) {
        toast.success(r.mensagem ?? "Filtro salvo.");
        setNome("");
        setAberto(false);
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  function remover(id: string) {
    iniciar(async () => {
      const r = await excluirFiltroSalvo(id);
      if (r.ok) {
        toast.success(r.mensagem ?? "Filtro removido.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger render={<Button type="button" variant="outline" className="h-9" />}>
        <Bookmark aria-hidden /> Meus filtros{salvos.length > 0 ? ` (${salvos.length})` : ""}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        {salvos.length === 0 ? (
          <p className="text-muted-foreground text-sm">Você ainda não salvou nenhum filtro desta lista.</p>
        ) : (
          <ul className="grid gap-1">
            {salvos.map((f) => (
              <li key={f.id} className="flex items-center gap-1">
                <Link href={`${base}?${f.consulta}`} onClick={() => setAberto(false)} className="hover:bg-muted min-h-8 flex-1 truncate rounded-md px-2 py-1.5 text-sm">
                  {f.nome}
                </Link>
                <Button type="button" variant="ghost" size="icon-sm" disabled={pendente} onClick={() => remover(f.id)} aria-label={`Remover o filtro ${f.nome}`}>
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="grid gap-2 border-t pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Salvar o filtro atual como</span>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} placeholder="Ex.: Arquitetos ativos" />
          </label>
          <Button type="submit" size="sm" disabled={pendente || nome.trim().length < 2}>
            {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Salvar filtro
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
