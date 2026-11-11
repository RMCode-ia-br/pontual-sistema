"use client";

import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Power } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Campo, CaixaMarcacao, Selecao, ariaDoCampo } from "@/components/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ResultadoAcao } from "@/lib/acoes";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";

import { alternarAtivoItemCatalogo, criarItemCatalogo, editarItemCatalogo, moverItemCatalogo } from "../actions";
import type { DefinicaoCatalogo, ItemCatalogo } from "../definicoes";

/** Campos de um item (usados no cadastro e na edição). */
function CamposItem({ def, item, erros, criando, prefixo }: { def: DefinicaoCatalogo; item?: ItemCatalogo; erros: Record<string, string>; criando: boolean; prefixo: string }) {
  // Ids únicos por formulário: o cadastro e o diálogo de edição ficam na mesma página ao mesmo tempo.
  const id = (campo: string) => `${prefixo}-${campo}`;
  const ehEspessura = def.extra === "espessura";
  return (
    <>
      <Campo id={id("nome")} rotulo={ehEspessura ? "Espessura (mm)" : "Nome"} erro={erros.nome} obrigatorio>
        <Input
          id={id("nome")}
          name="nome"
          required
          maxLength={80}
          inputMode={ehEspessura ? "numeric" : undefined}
          defaultValue={item?.nome ?? ""}
          autoComplete="off"
          {...ariaDoCampo(id("nome"), erros.nome)}
        />
      </Campo>
      {def.extra === "justificado" ? (
        <CaixaMarcacao id={id("justificado")} name="justificado" rotulo="Justificado (não é culpa da Pontual; estende o prazo)" defaultChecked={item?.justificado ?? true} />
      ) : null}
      {def.extra === "financeira" ? (
        <>
          <Campo id={id("tipo")} rotulo="Tipo" erro={erros.tipo} obrigatorio={criando}>
            <Selecao id={id("tipo")} name="tipo" required={criando} disabled={!criando} defaultValue={item?.tipo ?? ""} {...ariaDoCampo(id("tipo"), erros.tipo)}>
              {criando ? <option value="">Escolha...</option> : null}
              <option value="RECEITA">Receita</option>
              <option value="DESPESA">Despesa</option>
            </Selecao>
          </Campo>
          <Campo id={id("grupoDre")} rotulo="Grupo no DRE (opcional)" erro={erros.grupoDre} dica="Ex.: Custos diretos, Despesas fixas.">
            <Input id={id("grupoDre")} name="grupoDre" maxLength={60} defaultValue={item?.grupoDre ?? ""} autoComplete="off" {...ariaDoCampo(id("grupoDre"), erros.grupoDre, "dica")} />
          </Campo>
        </>
      ) : null}
    </>
  );
}

function FormNovo({ def }: { def: DefinicaoCatalogo }) {
  const [versao, setVersao] = useState(0); // troca a key para limpar o formulário após salvar
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario(
    (formData) => criarItemCatalogo(def.slug, null, formData),
    (r) => {
      if (r.ok) {
        toast.success(r.mensagem ?? "Adicionado.");
        setVersao((v) => v + 1);
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};

  return (
    <form key={versao} onSubmit={aoEnviar} className="grid items-end gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_auto]">
      <div className="grid gap-3 sm:grid-cols-2">
        <CamposItem def={def} erros={erros} criando prefixo="novo" />
      </div>
      <Button type="submit" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Adicionar
      </Button>
      {estado && !estado.ok && Object.keys(erros).length === 0 ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {estado.erro}
        </p>
      ) : null}
    </form>
  );
}

function DialogoEditar({ def, item, aoFechar }: { def: DefinicaoCatalogo; item: ItemCatalogo; aoFechar: () => void }) {
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario(
    (formData) => editarItemCatalogo(def.slug, item.id, null, formData),
    (r) => {
      if (r.ok) {
        toast.success(r.mensagem ?? "Atualizado.");
        aoFechar();
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};

  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar {def.singular}</DialogTitle>
          <DialogDescription>As alterações valem para as próximas propostas e telas; o histórico fica registrado.</DialogDescription>
        </DialogHeader>
        <form onSubmit={aoEnviar} className="grid gap-4">
          <CamposItem def={def} item={item} erros={erros} criando={false} prefixo="editar" />
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

export function PainelCatalogo({ def, itens }: { def: DefinicaoCatalogo; itens: ItemCatalogo[] }) {
  const [editando, setEditando] = useState<ItemCatalogo | null>(null);
  const [pendente, iniciar] = useTransition();

  function executar(fn: () => Promise<ResultadoAcao>) {
    iniciar(async () => {
      const r = await fn();
      if (r.ok) {
        if (r.mensagem) toast.success(r.mensagem);
      } else toast.error(r.erro);
    });
  }

  const rotuloItem = (i: ItemCatalogo) => (def.extra === "espessura" ? `${i.nome} mm` : i.nome);

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">{def.descricao}</p>
      <FormNovo def={def} />

      {itens.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
          Nenhum item ainda. Use o formulário acima para adicionar {def.singular === "espessura" ? "a primeira espessura" : `o primeiro item`}.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {itens.map((item, indice) => {
            const vizinhosDoGrupo = def.extra === "financeira" ? itens.filter((i) => i.tipo === item.tipo) : itens;
            const pos = vizinhosDoGrupo.findIndex((i) => i.id === item.id);
            return (
              <li key={item.id} className={`flex items-center gap-2 p-3 ${item.ativo ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {rotuloItem(item)}
                    {!item.ativo ? <Badge variant="outline">Inativo</Badge> : null}
                    {def.extra === "justificado" && item.justificado ? <Badge variant="secondary">Justificado</Badge> : null}
                    {def.extra === "financeira" ? <Badge variant="secondary">{item.tipo === "RECEITA" ? "Receita" : "Despesa"}</Badge> : null}
                  </p>
                  {def.extra === "financeira" && item.grupoDre ? <p className="text-muted-foreground text-xs">DRE: {item.grupoDre}</p> : null}
                </div>
                <Button type="button" variant="ghost" size="icon" disabled={pendente || pos === 0} onClick={() => executar(() => moverItemCatalogo(def.slug, item.id, "cima"))} aria-label={`Subir ${rotuloItem(item)}`}>
                  <ArrowUp aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon" disabled={pendente || pos === vizinhosDoGrupo.length - 1} onClick={() => executar(() => moverItemCatalogo(def.slug, item.id, "baixo"))} aria-label={`Descer ${rotuloItem(item)}`}>
                  <ArrowDown aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => setEditando(item)} aria-label={`Editar ${rotuloItem(item)}`}>
                  <Pencil aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={pendente}
                  onClick={() => executar(() => alternarAtivoItemCatalogo(def.slug, item.id, !item.ativo))}
                  aria-label={item.ativo ? `Desativar ${rotuloItem(item)}` : `Ativar ${rotuloItem(item)}`}
                  aria-pressed={item.ativo}
                  data-indice={indice}
                >
                  <Power aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {editando ? <DialogoEditar def={def} item={editando} aoFechar={() => setEditando(null)} /> : null}
    </div>
  );
}
