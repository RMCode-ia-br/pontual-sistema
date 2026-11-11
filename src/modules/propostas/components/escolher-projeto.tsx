"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Selecao } from "@/components/formulario";
import { Button } from "@/components/ui/button";

import { criarProposta } from "../actions/propostas";

type Props = { projetos: { id: string; codigo: string; titulo: string; cliente: string }[]; inicial?: string };

/** Escolhe o projeto e cria o rascunho da proposta (que já nasce com o cliente e os textos padrão). */
export function EscolherProjeto({ projetos, inicial }: Props) {
  const router = useRouter();
  const [projetoId, setProjetoId] = useState(inicial && projetos.some((p) => p.id === inicial) ? inicial : "");
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function criar() {
    setErro(null);
    iniciar(async () => {
      const r = await criarProposta(projetoId);
      if (r.ok && r.dados) {
        toast.success(r.mensagem ?? "Proposta criada.");
        router.push(`/propostas/${r.dados.id}`);
      } else if (!r.ok) {
        setErro(r.erro);
      }
    });
  }

  return (
    <div className="grid max-w-xl gap-4">
      <label className="grid gap-1.5 text-sm">
        Projeto
        <Selecao value={projetoId} onChange={(e) => setProjetoId(e.target.value)} aria-label="Projeto da proposta">
          <option value="">Escolha o projeto…</option>
          {projetos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.codigo} — {p.titulo} ({p.cliente})
            </option>
          ))}
        </Selecao>
      </label>
      {erro ? (
        <p role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      ) : null}
      <div>
        <Button type="button" onClick={criar} disabled={!projetoId || pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Criar proposta
        </Button>
      </div>
    </div>
  );
}
