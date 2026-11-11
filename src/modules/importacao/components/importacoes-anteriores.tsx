"use client";

import { History, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatarDataHora } from "@/lib/formatadores";

import { desfazerImportacao } from "../actions";
import type { LoteDaLista } from "../aplicar";
import { ROTULO_TIPO } from "../campos";

export function ImportacoesAnteriores({ lotes }: { lotes: LoteDaLista[] }) {
  const router = useRouter();
  const [alvo, setAlvo] = useState<LoteDaLista | null>(null);
  const [pendente, iniciar] = useTransition();

  function desfazer() {
    const lote = alvo;
    if (!lote) return;
    iniciar(async () => {
      const r = await desfazerImportacao(lote.id);
      setAlvo(null);
      if (r.ok) {
        toast.success(r.mensagem ?? "Importação desfeita.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  return (
    <section aria-labelledby="titulo-lotes" className="grid gap-3">
      <h2 id="titulo-lotes" className="font-medium">
        Importações anteriores
      </h2>
      {lotes.length === 0 ? (
        <EstadoVazio icone={History} titulo="Nenhuma importação feita ainda" descricao="Cada importação fica registrada aqui, com quem fez e quando, e pode ser desfeita." />
      ) : (
        <ul className="divide-y rounded-xl border">
          {lotes.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {ROTULO_TIPO[l.tipo]} · {l.nomeArquivo}{" "}
                  {l.status === "REVERTIDO" ? (
                    <Badge variant="outline" className="ml-1">
                      Desfeita
                    </Badge>
                  ) : null}
                </p>
                <p className="text-muted-foreground text-xs">
                  {formatarDataHora(l.criadoEm)}
                  {l.autor ? ` · ${l.autor}` : ""} · {l.criados} {l.criados === 1 ? "criado" : "criados"}
                  {l.atualizados ? `, ${l.atualizados} atualizados` : ""}
                  {l.ignorados ? `, ${l.ignorados} ignorados` : ""} (de {l.totalLinhas} linhas)
                </p>
              </div>
              {l.status === "APLICADO" ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setAlvo(l)} aria-label={`Desfazer a importação de ${l.nomeArquivo}`}>
                  <Undo2 aria-hidden /> Desfazer
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ConfirmarAcao
        aberto={!!alvo}
        aoFechar={() => setAlvo(null)}
        titulo="Desfazer esta importação?"
        descricao={`Tudo o que “${alvo?.nomeArquivo ?? ""}” criou vai para a lixeira, e o que ela atualizou volta ao valor anterior (exceto o que já foi alterado depois).`}
        botao="Desfazer importação"
        pendente={pendente}
        aoConfirmar={desfazer}
      />
    </section>
  );
}
