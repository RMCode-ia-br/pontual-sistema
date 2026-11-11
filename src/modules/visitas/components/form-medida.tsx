"use client";

import { Loader2, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { Campo, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";

import { excluirMedida, salvarMedida } from "../actions";
import type { MedidaDoVao } from "../queries";
import { TIPOLOGIAS_SUGERIDAS } from "../schemas";

type Props = {
  projetoId: string;
  eventoId: string;
  medida?: MedidaDoVao;
  /** Fotos do vão (só existem depois de salvar a medida). */
  children?: React.ReactNode;
  numero?: number;
};

/**
 * Um vão medido na visita. Campos grandes, teclado numérico para as medidas (mm) e salvamento por vão:
 * nada se perde ao trocar de campo ou de vão. Formulário novo limpa depois de salvar para o próximo.
 */
export function FormMedida({ projetoId, eventoId, medida, children, numero }: Props) {
  const router = useRouter();
  const [versao, setVersao] = useState(0);
  const [excluindo, setExcluindo] = useState(false);
  const [removendo, iniciar] = useTransition();
  const id = medida?.id ?? "nova";

  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<{ id: string }>(
    (formData) => salvarMedida(null, formData),
    (r) => {
      if (!r.ok) return;
      toast.success(r.mensagem ?? "Medida salva.");
      if (!medida) setVersao((v) => v + 1); // vão novo: limpa para o próximo
      router.refresh();
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};

  function remover() {
    if (!medida) return;
    iniciar(async () => {
      const r = await excluirMedida(medida.id);
      setExcluindo(false);
      if (r.ok) {
        toast.success(r.mensagem ?? "Removida.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  return (
    <article aria-label={medida ? `Vão ${numero ?? ""}` : "Novo vão"} className="grid gap-3 rounded-xl border p-4">
      <h3 className="font-medium">{medida ? `Vão ${numero}${medida.ambiente ? ` — ${medida.ambiente}` : ""}` : "Novo vão"}</h3>
      <form key={versao} onSubmit={aoEnviar} className="grid gap-3 sm:grid-cols-2">
        {medida ? <input type="hidden" name="id" value={medida.id} /> : null}
        <input type="hidden" name="projetoId" value={projetoId} />
        <input type="hidden" name="eventoId" value={eventoId} />

        <Campo id={`ambiente-${id}`} rotulo="Ambiente" erro={erros.ambiente}>
          <Input id={`ambiente-${id}`} name="ambiente" maxLength={120} defaultValue={medida?.ambiente ?? ""} placeholder="Ex.: sala, suíte, varanda" autoComplete="off" className="h-11 text-base" {...ariaDoCampo(`ambiente-${id}`, erros.ambiente)} />
        </Campo>
        <Campo id={`tipologia-${id}`} rotulo="Tipo de esquadria" erro={erros.tipologia}>
          <Input id={`tipologia-${id}`} name="tipologia" list="tipologias-sugeridas" maxLength={120} defaultValue={medida?.tipologia ?? ""} autoComplete="off" className="h-11 text-base" {...ariaDoCampo(`tipologia-${id}`, erros.tipologia)} />
        </Campo>
        <Campo id={`largura-${id}`} rotulo="Largura (mm)" erro={erros.larguraMm}>
          <Input id={`largura-${id}`} name="larguraMm" inputMode="numeric" pattern="[0-9]*" maxLength={5} enterKeyHint="next" defaultValue={medida?.larguraMm ?? ""} placeholder="Ex.: 2000" className="h-11 text-base" {...ariaDoCampo(`largura-${id}`, erros.larguraMm)} />
        </Campo>
        <Campo id={`altura-${id}`} rotulo="Altura (mm)" erro={erros.alturaMm}>
          <Input id={`altura-${id}`} name="alturaMm" inputMode="numeric" pattern="[0-9]*" maxLength={5} enterKeyHint="next" defaultValue={medida?.alturaMm ?? ""} placeholder="Ex.: 1200" className="h-11 text-base" {...ariaDoCampo(`altura-${id}`, erros.alturaMm)} />
        </Campo>
        <Campo id={`quantidade-${id}`} rotulo="Quantidade" erro={erros.quantidade}>
          <Input id={`quantidade-${id}`} name="quantidade" inputMode="numeric" pattern="[0-9]*" maxLength={3} defaultValue={medida?.quantidade ?? 1} className="h-11 text-base" {...ariaDoCampo(`quantidade-${id}`, erros.quantidade)} />
        </Campo>
        <Campo id={`observacao-${id}`} rotulo="Observação" erro={erros.observacao}>
          <Input id={`observacao-${id}`} name="observacao" maxLength={500} defaultValue={medida?.observacao ?? ""} autoComplete="off" className="h-11 text-base" {...ariaDoCampo(`observacao-${id}`, erros.observacao)} />
        </Campo>

        {estado && !estado.ok && Object.keys(erros).length === 0 ? (
          <p role="alert" className="text-destructive text-sm sm:col-span-2">
            {estado.erro}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" size="lg" disabled={pendente} className="h-11 flex-1 sm:flex-none">
            {pendente ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} {medida ? "Salvar vão" : "Adicionar vão"}
          </Button>
          {medida ? (
            <Button type="button" variant="outline" size="lg" className="h-11" onClick={() => setExcluindo(true)} aria-label={`Remover o vão ${numero ?? ""}`}>
              <Trash2 aria-hidden /> Remover
            </Button>
          ) : null}
        </div>
      </form>

      {children}

      <ConfirmarAcao aberto={excluindo} aoFechar={() => setExcluindo(false)} titulo="Remover este vão?" descricao="A medida sai da visita. As fotos continuam guardadas." botao="Remover" pendente={removendo} aoConfirmar={remover} />
    </article>
  );
}

/** Lista de sugestões compartilhada pelos campos de tipo de esquadria. */
export function SugestoesDeTipologia() {
  return (
    <datalist id="tipologias-sugeridas">
      {TIPOLOGIAS_SUGERIDAS.map((t) => (
        <option key={t} value={t} />
      ))}
    </datalist>
  );
}
