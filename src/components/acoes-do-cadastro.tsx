"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { Button } from "@/components/ui/button";
import type { ResultadoAcao } from "@/lib/acoes";

type Props = {
  id: string;
  nome: string;
  ativo: boolean;
  /** Para onde ir depois de enviar à lixeira (a ficha deixa de existir). */
  voltarPara: string;
  /** Ações do módulo (recebem uma lista de IDs, como as ações em lote das listas). */
  inativar: (ids: string[]) => Promise<ResultadoAcao>;
  reativar: (ids: string[]) => Promise<ResultadoAcao>;
  excluir: (ids: string[]) => Promise<ResultadoAcao>;
  /** Frase do que fica preservado ao ir para a lixeira. */
  preservado?: string;
};

/** Inativar/reativar e enviar à lixeira, direto da ficha de um cadastro. */
export function AcoesDoCadastro({ id, nome, ativo, voltarPara, inativar, reativar, excluir, preservado = "O histórico é preservado." }: Props) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState<"inativar" | "lixeira" | null>(null);
  const [pendente, iniciar] = useTransition();

  function executar(acao: "inativar" | "reativar" | "lixeira") {
    iniciar(async () => {
      const r = acao === "inativar" ? await inativar([id]) : acao === "reativar" ? await reativar([id]) : await excluir([id]);
      setConfirmando(null);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(r.mensagem ?? "Pronto.");
      if (acao === "lixeira") router.push(voltarPara);
      else router.refresh();
    });
  }

  return (
    <>
      {ativo ? (
        <Button type="button" variant="outline" onClick={() => setConfirmando("inativar")}>
          <Archive aria-hidden /> Inativar
        </Button>
      ) : (
        <Button type="button" variant="outline" disabled={pendente} onClick={() => executar("reativar")}>
          <ArchiveRestore aria-hidden /> Reativar
        </Button>
      )}
      <Button type="button" variant="destructive" onClick={() => setConfirmando("lixeira")}>
        <Trash2 aria-hidden /> Enviar à lixeira
      </Button>

      <ConfirmarAcao
        aberto={confirmando === "inativar"}
        aoFechar={() => setConfirmando(null)}
        titulo={`Inativar ${nome}?`}
        descricao="O cadastro deixa de aparecer nas listas padrão e nas escolhas, mas nada é apagado. Dá para reativar a qualquer momento."
        botao="Inativar"
        pendente={pendente}
        aoConfirmar={() => executar("inativar")}
      />
      <ConfirmarAcao
        aberto={confirmando === "lixeira"}
        aoFechar={() => setConfirmando(null)}
        titulo={`Enviar ${nome} para a lixeira?`}
        descricao={`O cadastro sai das listas e da busca, e pode ser restaurado depois na Lixeira. ${preservado}`}
        botao="Enviar à lixeira"
        pendente={pendente}
        aoConfirmar={() => executar("lixeira")}
      />
    </>
  );
}
