"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { buscarProjetosParaAgenda, type ProjetoParaEscolha } from "../actions/consultas";

type Props = {
  id: string;
  name: string;
  /** Projeto já escolhido (edição ou vindo da ficha do projeto). */
  inicial?: { id: string; rotulo: string } | null;
  aoMudar?: (escolhido: ProjetoParaEscolha | null) => void;
};

/** Escolhe um projeto digitando parte do código, do título ou do nome do cliente. Envia só o ID. */
export function CampoProjeto({ id, name, inicial = null, aoMudar }: Props) {
  const [escolhido, setEscolhido] = useState(inicial);
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<{ termo: string; opcoes: ProjetoParaEscolha[] } | null>(null);
  const termoAtual = texto.trim();
  const buscou = resultado?.termo === termoAtual;
  const opcoes = buscou ? resultado.opcoes : [];

  useEffect(() => {
    const termo = texto.trim();
    if (termo.length < 2) return;
    let cancelado = false;
    const espera = setTimeout(async () => {
      const r = await buscarProjetosParaAgenda(termo);
      if (!cancelado) setResultado({ termo, opcoes: r.ok && r.dados ? r.dados : [] });
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [texto]);

  if (escolhido) {
    return (
      <div className="flex items-center gap-2">
        <input type="hidden" name={name} value={escolhido.id} />
        <span id={id} className="bg-muted flex min-h-9 flex-1 items-center rounded-lg px-3 text-sm">
          {escolhido.rotulo}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Tirar o projeto"
          onClick={() => {
            setEscolhido(null);
            aoMudar?.(null);
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
        placeholder="Digite parte do código, do título ou do cliente"
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
                  setEscolhido({ id: o.id, rotulo: o.rotulo });
                  setTexto("");
                  setResultado(null);
                  aoMudar?.(o);
                }}
              >
                {o.rotulo}
              </button>
            </li>
          ))}
        </ul>
      ) : buscou && termoAtual.length >= 2 ? (
        <p className="text-muted-foreground mt-1 text-xs">Nenhum projeto em andamento encontrado.</p>
      ) : null}
    </div>
  );
}
