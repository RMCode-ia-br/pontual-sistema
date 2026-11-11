"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { Button } from "@/components/ui/button";

import { excluirClientes, inativarClientes, reativarClientes } from "../actions/clientes";

type Props = { id: string; nome: string; ativo: boolean };

/** Inativar/reativar e enviar à lixeira, direto da ficha do cliente. */
export function AcoesDoCliente({ id, nome, ativo }: Props) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState<"inativar" | "lixeira" | null>(null);
  const [pendente, iniciar] = useTransition();

  function executar(acao: "inativar" | "reativar" | "lixeira") {
    iniciar(async () => {
      const r = acao === "inativar" ? await inativarClientes([id]) : acao === "reativar" ? await reativarClientes([id]) : await excluirClientes([id]);
      setConfirmando(null);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(r.mensagem ?? "Pronto.");
      if (acao === "lixeira") router.push("/clientes");
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
        descricao="O cliente deixa de aparecer nas listas padrão, mas nada é apagado. Dá para reativar a qualquer momento."
        botao="Inativar"
        pendente={pendente}
        aoConfirmar={() => executar("inativar")}
      />
      <ConfirmarAcao
        aberto={confirmando === "lixeira"}
        aoFechar={() => setConfirmando(null)}
        titulo={`Enviar ${nome} para a lixeira?`}
        descricao="O cadastro sai das listas e da busca, e pode ser restaurado depois na Lixeira. Endereços, contatos e histórico são preservados."
        botao="Enviar à lixeira"
        pendente={pendente}
        aoConfirmar={() => executar("lixeira")}
      />
    </>
  );
}
