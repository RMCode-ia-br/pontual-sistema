"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { buscarClientesParaIndicacao } from "../actions/consultas";

type Props = {
  id: string;
  name: string;
  /** Cliente já escolhido (edição). */
  inicial?: { id: string; nome: string } | null;
  /** Não deixa escolher o próprio cadastro. */
  exceto?: string;
  aoMudar?: () => void;
};

/**
 * Escolhe um cliente existente digitando parte do nome, CPF/CNPJ ou telefone (usado em "Indicado por").
 * Envia só o ID no campo escondido; o servidor confere se o cliente existe.
 */
export function CampoCliente({ id, name, inicial = null, exceto, aoMudar }: Props) {
  const [escolhido, setEscolhido] = useState(inicial);
  const [texto, setTexto] = useState("");
  // O resultado guarda o termo que o gerou: se a pessoa já digitou outra coisa, ele não vale mais.
  const [resultado, setResultado] = useState<{ termo: string; opcoes: { id: string; nome: string }[] } | null>(null);
  const termoAtual = texto.trim();
  const buscou = resultado?.termo === termoAtual;
  const opcoes = buscou ? resultado.opcoes : [];

  useEffect(() => {
    const termo = texto.trim();
    if (termo.length < 2) return;
    let cancelado = false;
    const espera = setTimeout(async () => {
      const r = await buscarClientesParaIndicacao(termo, exceto);
      if (cancelado) return;
      setResultado({ termo, opcoes: r.ok && r.dados ? r.dados : [] });
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [texto, exceto]);

  if (escolhido) {
    return (
      <div className="flex items-center gap-2">
        <input type="hidden" name={name} value={escolhido.id} />
        <span id={id} className="bg-muted flex min-h-9 flex-1 items-center rounded-lg px-3 text-sm">
          {escolhido.nome}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Tirar a indicação"
          onClick={() => {
            setEscolhido(null);
            aoMudar?.();
          }}
        >
          <X aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value="" />
      <Input
        id={id}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Digite parte do nome, CPF/CNPJ ou telefone"
        autoComplete="off"
        className="h-9"
        role="combobox"
        aria-expanded={opcoes.length > 0}
        aria-controls={`${id}-lista`}
      />
      {opcoes.length > 0 ? (
        <ul id={`${id}-lista`} role="listbox" className="bg-popover absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border p-1 shadow-md">
          {opcoes.map((o) => (
            <li key={o.id} role="option" aria-selected="false">
              <button
                type="button"
                className="hover:bg-muted flex min-h-9 w-full items-center rounded-md px-2 text-left text-sm"
                onClick={() => {
                  setEscolhido(o);
                  setTexto("");
                  setResultado(null);
                  aoMudar?.();
                }}
              >
                {o.nome}
              </button>
            </li>
          ))}
        </ul>
      ) : buscou && termoAtual.length >= 2 ? (
        <p className="text-muted-foreground mt-1 text-xs">Nenhum cliente encontrado.</p>
      ) : null}
    </div>
  );
}
