"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CaixaMarcacao, Campo, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResultadoAcao } from "@/lib/acoes";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";

import { criarEquipe, editarEquipe } from "../actions/equipes";

type Props = { equipe?: { id: string; nome: string; descricao: string | null; ativo: boolean } };

/** Criar uma equipe (campos mínimos, vai direto para a tela dela) ou editar nome, descrição e situação. */
export function FormEquipe({ equipe }: Props) {
  const router = useRouter();
  const editando = !!equipe;
  const [versao, setVersao] = useState(0);
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<{ id: string } | undefined>(
    (formData): Promise<ResultadoAcao<{ id: string } | undefined>> => (editando ? editarEquipe(null, formData) : criarEquipe(null, formData)),
    (r) => {
      if (!r.ok) return;
      toast.success(r.mensagem ?? "Salvo.");
      if (editando) router.refresh();
      else if (r.dados) {
        setVersao((v) => v + 1);
        router.push(`/funcionarios/equipes/${r.dados.id}`);
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const sufixo = equipe?.id ?? "nova";

  return (
    <form key={versao} onSubmit={aoEnviar} className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2" aria-label={editando ? "Dados da equipe" : "Nova equipe"}>
      {equipe ? <input type="hidden" name="id" value={equipe.id} /> : null}
      <Campo id={`nome-${sufixo}`} rotulo="Nome da equipe" erro={erros.nome} obrigatorio>
        <Input id={`nome-${sufixo}`} name="nome" required maxLength={80} defaultValue={equipe?.nome ?? ""} autoComplete="off" placeholder="Ex.: Equipe de instalação 1" {...ariaDoCampo(`nome-${sufixo}`, erros.nome)} />
      </Campo>
      <Campo id={`descricao-${sufixo}`} rotulo="Descrição (opcional)" erro={erros.descricao}>
        <Input id={`descricao-${sufixo}`} name="descricao" maxLength={300} defaultValue={equipe?.descricao ?? ""} autoComplete="off" />
      </Campo>
      {editando ? <CaixaMarcacao id={`ativo-${sufixo}`} name="ativo" rotulo="Equipe ativa (aparece nas escolhas)" defaultChecked={equipe.ativo} className="sm:col-span-2" /> : null}
      {estado && !estado.ok && Object.keys(erros).length === 0 ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {estado.erro}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : editando ? null : <Plus aria-hidden />}
          {editando ? "Salvar equipe" : "Criar equipe"}
        </Button>
      </div>
    </form>
  );
}
