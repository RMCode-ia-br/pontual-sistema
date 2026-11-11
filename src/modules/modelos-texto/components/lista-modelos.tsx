"use client";

import { Loader2, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AreaTexto, CaixaMarcacao, Campo, ariaDoCampo } from "@/components/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";

import { salvarModeloTexto } from "../actions";

export type ModeloItem = { id: string; chave: string; titulo: string; categoria: string; conteudo: string; ativo: boolean };

export const ROTULO_CATEGORIA: Record<string, string> = {
  PROPOSTA_NOTAS: "Notas da proposta",
  PROPOSTA_TERMOS: "Termos comerciais",
  WHATSAPP: "Mensagens de WhatsApp",
  OUTRO: "Outros",
};

/** Variáveis {{assim}} presentes no texto, sem repetição. */
export function variaveisDoTexto(texto: string): string[] {
  return Array.from(new Set(Array.from(texto.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g), (m) => m[1])));
}

function DialogoEditar({ modelo, aoFechar }: { modelo: ModeloItem; aoFechar: () => void }) {
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario(
    (formData) => salvarModeloTexto(null, formData),
    (r) => {
      if (r.ok) {
        toast.success(r.mensagem ?? "Modelo salvo.");
        aoFechar();
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const variaveis = variaveisDoTexto(modelo.conteudo);

  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar modelo</DialogTitle>
          <DialogDescription>
            Use as variáveis entre chaves duplas; elas são preenchidas na hora de gerar a proposta ou a mensagem.
            {variaveis.length > 0 ? (
              <span className="mt-2 flex flex-wrap gap-1">
                {variaveis.map((v) => (
                  <code key={v} className="bg-muted rounded px-1.5 py-0.5 text-xs">{`{{${v}}}`}</code>
                ))}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={aoEnviar} className="grid gap-4">
          <input type="hidden" name="id" value={modelo.id} />
          <Campo id="titulo" rotulo="Título" erro={erros.titulo} obrigatorio>
            <Input id="titulo" name="titulo" required maxLength={120} defaultValue={modelo.titulo} {...ariaDoCampo("titulo", erros.titulo)} />
          </Campo>
          <Campo
            id="conteudo"
            rotulo="Texto"
            erro={erros.conteudo}
            dica={modelo.categoria === "PROPOSTA_NOTAS" ? "Uma nota por linha. A numeração é automática." : undefined}
            obrigatorio
          >
            <AreaTexto id="conteudo" name="conteudo" required rows={12} maxLength={6000} defaultValue={modelo.conteudo} {...ariaDoCampo("conteudo", erros.conteudo)} />
          </Campo>
          <CaixaMarcacao id="ativo" name="ativo" rotulo="Modelo ativo" defaultChecked={modelo.ativo} />
          {estado && !estado.ok && Object.keys(erros).length === 0 ? (
            <p role="alert" className="text-destructive text-sm">
              {estado.erro}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ListaModelos({ modelos }: { modelos: ModeloItem[] }) {
  const [editando, setEditando] = useState<ModeloItem | null>(null);
  const categorias = Object.keys(ROTULO_CATEGORIA).filter((c) => modelos.some((m) => m.categoria === c));

  return (
    <div className="grid gap-8">
      {categorias.map((categoria) => (
        <section key={categoria} aria-labelledby={`cat-${categoria}`}>
          <h2 id={`cat-${categoria}`} className="mb-3 text-lg font-medium">
            {ROTULO_CATEGORIA[categoria]}
          </h2>
          <ul className="divide-y rounded-xl border">
            {modelos
              .filter((m) => m.categoria === categoria)
              .map((m) => (
                <li key={m.id} className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {m.titulo}
                      {!m.ativo ? <Badge variant="outline">Inativo</Badge> : null}
                    </p>
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-sm whitespace-pre-line">{m.conteudo}</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditando(m)} aria-label={`Editar ${m.titulo}`}>
                    <Pencil aria-hidden /> Editar
                  </Button>
                </li>
              ))}
          </ul>
        </section>
      ))}
      {editando ? <DialogoEditar modelo={editando} aoFechar={() => setEditando(null)} /> : null}
    </div>
  );
}
