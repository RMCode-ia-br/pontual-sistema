"use client";

import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Button } from "@/components/ui/button";
import type { ResultadoAcao } from "@/lib/acoes";
import { formatarDataHora } from "@/lib/formatadores";

import type { ItemDaLixeira } from "../queries";

type Props = {
  itens: ItemDaLixeira[];
  rotulo: string;
  restaurar: (ids: string[]) => Promise<ResultadoAcao>;
};

export function ListaDaLixeira({ itens, rotulo, restaurar }: Props) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [pendente, iniciar] = useTransition();

  function executar(ids: string[]) {
    iniciar(async () => {
      const r = await restaurar(ids);
      if (r.ok) {
        toast.success(r.mensagem ?? "Restaurado.");
        setMarcados(new Set());
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  if (itens.length === 0) {
    return <EstadoVazio icone={Trash2} titulo={`Nenhum item em ${rotulo.toLowerCase()} na lixeira`} descricao="Quando você enviar algo para a lixeira, ele aparece aqui e pode ser restaurado. Nada é apagado de verdade." />;
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pendente || marcados.size === 0} onClick={() => executar(Array.from(marcados))}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />} Restaurar marcados{marcados.size > 0 ? ` (${marcados.size})` : ""}
        </Button>
        <span className="text-muted-foreground text-xs">Itens ficam aqui até serem restaurados; nada é apagado de verdade.</span>
      </div>
      <ul className="divide-y rounded-xl border">
        {itens.map((i) => (
          <li key={i.id} className="flex items-start gap-3 p-3">
            <input type="checkbox" className="accent-primary mt-1 size-5 shrink-0" aria-label={`Marcar ${i.titulo}`} checked={marcados.has(i.id)} onChange={() => alternar(i.id)} />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">{i.titulo}</p>
              <p className="text-muted-foreground text-xs">
                {i.detalhe ? `${i.detalhe} · ` : ""}removido em {formatarDataHora(i.removidoEm)}
                {i.removidoPor ? ` por ${i.removidoPor}` : ""}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" disabled={pendente} onClick={() => executar([i.id])} aria-label={`Restaurar ${i.titulo}`}>
              <RotateCcw aria-hidden /> Restaurar
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
