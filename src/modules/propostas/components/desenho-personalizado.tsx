"use client";

import { useCallback, type ComponentProps, type ReactNode } from "react";

import { CampoDesenho } from "@/components/desenho/campo-desenho";
import type { TamanhoDoDesenho } from "@/lib/dominio/desenho-item";

import { removerDesenhoDoItemAcao } from "../actions/desenho";
import type { ItemSer } from "../tipos";
import { enviarDesenhoDoItem } from "./desenho-envio";

type Props = Omit<ComponentProps<typeof CampoDesenho>, "salvo" | "enviar" | "remover" | "desenhoInicial" | "automatico" | "tamanho" | "aoMudarTamanho"> & {
  propostaId: string;
  /** Id do item (pode passar a existir depois de salvar um item novo). null = item novo ainda não salvo. */
  itemId: string | null;
  desenhoInicial: ItemSer["desenho"];
  /** Desenho automático da tipologia (o que a proposta usa enquanto não houver imagem). */
  automatico: ReactNode;
  tamanho: TamanhoDoDesenho;
  aoMudarTamanho: (t: TamanhoDoDesenho) => void;
};

/**
 * Desenho personalizado do ITEM da proposta: o campo compartilhado com as ações do item (textos e comportamento da 3.6b-1).
 * Os wrappers abaixo são de cliente: o componente compartilhado nunca recebe função do servidor.
 */
export function DesenhoPersonalizado({ propostaId, itemId, desenhoInicial, ...resto }: Props) {
  const enviar = useCallback((arquivo: File, temAnterior: boolean) => enviarDesenhoDoItem({ propostaId, itemId: itemId ?? "", arquivo, temAnterior }), [propostaId, itemId]);
  const remover = useCallback(() => removerDesenhoDoItemAcao({ propostaId, itemId: itemId ?? "" }), [propostaId, itemId]);
  return <CampoDesenho salvo={itemId !== null} enviar={enviar} remover={remover} desenhoInicial={desenhoInicial} {...resto} />;
}
