"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { AreaTexto, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResultadoAcao } from "@/lib/acoes";
import { dataParaInput } from "@/lib/formatadores";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";

import { criarTarefa, editarTarefa } from "../actions";

type Usuario = { id: string; nome: string };

type Props = {
  usuarios: Usuario[];
  usuarioAtualId: string;
  /** Edição: preenche os campos e salva no lugar. */
  tarefa?: { id: string; titulo: string; descricao: string | null; vencimento: string | null; responsavelId: string | null };
  /** Após criar: "limpar" mantém na lista (cadastro rápido); "voltar" vai para a lista. */
  aoCriar?: "limpar" | "voltar";
};

export function FormTarefa({ usuarios, usuarioAtualId, tarefa, aoCriar = "limpar" }: Props) {
  const router = useRouter();
  const [versao, setVersao] = useState(0);
  const editando = !!tarefa;

  const { estado, pendente, aoEnviar } = useAcaoDeFormulario(
    (formData): Promise<ResultadoAcao<unknown>> => (editando ? editarTarefa(null, formData) : criarTarefa(null, formData)),
    (r) => {
      if (r.ok) {
        toast.success(r.mensagem ?? "Salvo.");
        if (!editando) {
          if (aoCriar === "voltar") router.push("/tarefas");
          else setVersao((v) => v + 1);
        }
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const responsavelInicial = tarefa ? (tarefa.responsavelId ?? "") : usuarioAtualId;

  return (
    <form key={versao} onSubmit={aoEnviar} className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
      {tarefa ? <input type="hidden" name="id" value={tarefa.id} /> : null}
      <Campo id="titulo" rotulo="O que precisa ser feito?" erro={erros.titulo} obrigatorio className="sm:col-span-2">
        <Input id="titulo" name="titulo" required maxLength={160} defaultValue={tarefa?.titulo ?? ""} autoFocus={!editando} autoComplete="off" {...ariaDoCampo("titulo", erros.titulo)} />
      </Campo>
      <Campo id="vencimento" rotulo="Vencimento (opcional)" erro={erros.vencimento}>
        <Input id="vencimento" name="vencimento" type="date" defaultValue={dataParaInput(tarefa?.vencimento ? new Date(tarefa.vencimento) : null)} {...ariaDoCampo("vencimento", erros.vencimento)} />
      </Campo>
      <Campo id="responsavelId" rotulo="Responsável" erro={erros.responsavelId}>
        <Selecao id="responsavelId" name="responsavelId" defaultValue={responsavelInicial} {...ariaDoCampo("responsavelId", erros.responsavelId)}>
          <option value="">Sem responsável</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo id="descricao" rotulo="Detalhes (opcional)" erro={erros.descricao} className="sm:col-span-2">
        <AreaTexto id="descricao" name="descricao" maxLength={2000} rows={3} defaultValue={tarefa?.descricao ?? ""} {...ariaDoCampo("descricao", erros.descricao)} />
      </Campo>
      {estado && !estado.ok && Object.keys(erros).length === 0 ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {estado.erro}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : editando ? null : <Plus aria-hidden />}
          {editando ? "Salvar alterações" : "Adicionar tarefa"}
        </Button>
      </div>
    </form>
  );
}
