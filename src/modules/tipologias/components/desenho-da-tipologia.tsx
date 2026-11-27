"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { CampoDesenho, type TextosDoCampoDesenho } from "@/components/desenho/campo-desenho";
import { enviarImagemDeDesenho } from "@/components/desenho/envio-cliente";
import { DesenhoEsquadria } from "@/components/desenho-esquadria";
import type { TipoDesenho } from "@/lib/dominio/desenho";
import type { TamanhoDoDesenho } from "@/lib/dominio/desenho-item";

import { concluirUploadDesenhoDaTipologia, iniciarUploadDesenhoDaTipologia, mudarTamanhoDoDesenhoDaTipologiaAcao, removerDesenhoDaTipologiaAcao } from "../actions/desenho";

export const AVISO_DO_DESENHO_DA_TIPOLOGIA = "Mudar o desenho afeta propostas em rascunho que usam esta tipologia. As propostas já enviadas não mudam.";

const TEXTOS: Partial<TextosDoCampoDesenho> = {
  legenda: "Desenho desta tipologia",
  ariaComImagem: "Desenho personalizado desta tipologia",
  ariaSemImagem: "Desenho automático desta tipologia",
  altDaImagem: "Desenho personalizado da tipologia",
  salvoNaHora: "O desenho é salvo na hora.",
  notaDoTamanho: "Normal fica ao lado do texto, como o desenho automático. Grande ocupa mais espaço: o item pode ir inteiro para a página seguinte. O tamanho é salvo na hora.",
};

type Props = {
  tipologiaId: string;
  /** Tipo do desenho automático (o que vale enquanto não houver imagem). */
  tipoDesenho: TipoDesenho;
  desenhoInicial: { anexoId: string; url: string | null } | null;
  tamanhoInicial: TamanhoDoDesenho;
};

/**
 * Desenho da tipologia: o campo compartilhado com as ações da tipologia. Os wrappers são de cliente (o componente
 * compartilhado nunca recebe função do servidor). O tamanho é gravado na hora; se falhar, volta ao valor anterior.
 */
export function DesenhoDaTipologia({ tipologiaId, tipoDesenho, desenhoInicial, tamanhoInicial }: Props) {
  const [tamanho, setTamanho] = useState<TamanhoDoDesenho>(tamanhoInicial);

  const enviar = useCallback(
    async (arquivo: File, temAnterior: boolean) => {
      const r = await enviarImagemDeDesenho(
        {
          iniciar: (e) => iniciarUploadDesenhoDaTipologia({ tipologiaId, ...e }),
          concluir: (e) => concluirUploadDesenhoDaTipologia({ tipologiaId, ...e }),
        },
        { arquivo, temAnterior },
      );
      return r;
    },
    [tipologiaId],
  );
  const remover = useCallback(async () => {
    const r = await removerDesenhoDaTipologiaAcao({ tipologiaId });
    if (r.ok) setTamanho("NORMAL"); // sem imagem não há tamanho: o servidor zera a configuração
    return r;
  }, [tipologiaId]);

  async function mudarTamanho(novo: TamanhoDoDesenho) {
    const anterior = tamanho;
    setTamanho(novo);
    const r = await mudarTamanhoDoDesenhoDaTipologiaAcao({ tipologiaId, tamanho: novo });
    if (!r.ok) {
      setTamanho(anterior);
      toast.error(r.erro);
      return;
    }
    toast.success(r.mensagem ?? "Tamanho do desenho salvo.");
  }

  return (
    <div className="grid gap-3" data-testid="desenho-da-tipologia">
      <p className="rounded-md border border-dashed p-3 text-sm" role="note" data-testid="aviso-desenho-tipologia">
        {AVISO_DO_DESENHO_DA_TIPOLOGIA}
      </p>
      <CampoDesenho
        salvo
        enviar={enviar}
        remover={remover}
        desenhoInicial={desenhoInicial}
        automatico={<DesenhoEsquadria tipo={tipoDesenho} folhas={2} larguraMm={2000} alturaMm={1200} />}
        tamanho={tamanho}
        aoMudarTamanho={(t) => void mudarTamanho(t)}
        textos={TEXTOS}
      />
    </div>
  );
}
