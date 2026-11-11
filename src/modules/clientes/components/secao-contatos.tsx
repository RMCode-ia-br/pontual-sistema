"use client";

import { Loader2, Mail, MessageCircle, Pencil, Phone, Plus, Trash2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CampoMascarado } from "@/components/campo-mascarado";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { AreaTexto, Campo, ariaDoCampo } from "@/components/formulario";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResultadoAcao } from "@/lib/acoes";
import { formatarTelefone } from "@/lib/formatadores";
import { mascararTelefone } from "@/lib/formatadores/mascaras";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";

import { criarContato, editarContato, excluirContato } from "../actions/contatos";

export type ContatoItem = {
  id: string;
  clienteId: string;
  nome: string;
  cargo: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  observacoes: string | null;
};

function FormContato({ clienteId, contato, aoConcluir }: { clienteId: string; contato?: ContatoItem; aoConcluir: () => void }) {
  const router = useRouter();
  const sufixo = contato?.id ?? "novo";
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario(
    (formData): Promise<ResultadoAcao> => (contato ? editarContato(null, formData) : criarContato(null, formData)),
    (r) => {
      if (r.ok) {
        toast.success(r.mensagem ?? "Salvo.");
        router.refresh();
        aoConcluir();
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};

  return (
    <form onSubmit={aoEnviar} className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2" aria-label={contato ? "Editar contato" : "Novo contato"}>
      <input type="hidden" name="clienteId" value={clienteId} />
      {contato ? <input type="hidden" name="id" value={contato.id} /> : null}
      <Campo id={`nome-${sufixo}`} rotulo="Nome" erro={erros.nome} obrigatorio>
        <Input id={`nome-${sufixo}`} name="nome" required maxLength={160} defaultValue={contato?.nome ?? ""} autoFocus autoComplete="off" {...ariaDoCampo(`nome-${sufixo}`, erros.nome)} />
      </Campo>
      <Campo id={`cargo-${sufixo}`} rotulo="Cargo ou relação (opcional)" erro={erros.cargo} dica="Ex.: esposa, síndico, arquiteto da obra.">
        <Input id={`cargo-${sufixo}`} name="cargo" maxLength={80} defaultValue={contato?.cargo ?? ""} autoComplete="off" />
      </Campo>
      <Campo id={`telefone-${sufixo}`} rotulo="Telefone" erro={erros.telefone}>
        <CampoMascarado id={`telefone-${sufixo}`} name="telefone" type="tel" mascara={mascararTelefone} defaultValue={contato?.telefone ?? ""} inputMode="tel" autoComplete="off" {...ariaDoCampo(`telefone-${sufixo}`, erros.telefone)} />
      </Campo>
      <Campo id={`whatsapp-${sufixo}`} rotulo="WhatsApp" erro={erros.whatsapp}>
        <CampoMascarado id={`whatsapp-${sufixo}`} name="whatsapp" type="tel" mascara={mascararTelefone} defaultValue={contato?.whatsapp ?? ""} inputMode="tel" autoComplete="off" {...ariaDoCampo(`whatsapp-${sufixo}`, erros.whatsapp)} />
      </Campo>
      <Campo id={`email-${sufixo}`} rotulo="E-mail" erro={erros.email} className="sm:col-span-2">
        <Input id={`email-${sufixo}`} name="email" type="email" maxLength={254} defaultValue={contato?.email ?? ""} autoComplete="off" {...ariaDoCampo(`email-${sufixo}`, erros.email)} />
      </Campo>
      <Campo id={`obs-${sufixo}`} rotulo="Observações (opcional)" erro={erros.observacoes} className="sm:col-span-2">
        <AreaTexto id={`obs-${sufixo}`} name="observacoes" maxLength={1000} rows={2} defaultValue={contato?.observacoes ?? ""} />
      </Campo>
      {estado && !estado.ok && Object.keys(erros).length === 0 ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {estado.erro}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {contato ? "Salvar contato" : "Adicionar contato"}
        </Button>
        <Button type="button" variant="ghost" onClick={aoConcluir}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function SecaoContatos({ clienteId, contatos }: { clienteId: string; contatos: ContatoItem[] }) {
  const router = useRouter();
  const [adicionando, setAdicionando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<ContatoItem | null>(null);
  const [pendente, iniciar] = useTransition();

  function confirmarExclusao() {
    const alvo = excluindo;
    if (!alvo) return;
    iniciar(async () => {
      const r = await excluirContato(alvo.id);
      setExcluindo(null);
      if (r.ok) {
        toast.success(r.mensagem ?? "Removido.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  return (
    <section aria-labelledby="titulo-contatos" className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="titulo-contatos" className="font-medium">
          Outras pessoas de contato
        </h2>
        {!adicionando ? (
          <Button type="button" variant="outline" onClick={() => setAdicionando(true)}>
            <Plus aria-hidden /> Adicionar contato
          </Button>
        ) : null}
      </div>

      {adicionando ? <FormContato clienteId={clienteId} aoConcluir={() => setAdicionando(false)} /> : null}

      {contatos.length === 0 && !adicionando ? (
        <EstadoVazio
          icone={UserRound}
          titulo="Nenhum contato adicional"
          descricao="Cadastre quem mais fala pela obra: cônjuge, síndico, arquiteto, engenheiro. Assim ninguém precisa procurar o número depois."
          acao={
            <Button type="button" onClick={() => setAdicionando(true)}>
              <Plus aria-hidden /> Adicionar contato
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {contatos.map((c) =>
            editando === c.id ? (
              <li key={c.id}>
                <FormContato clienteId={clienteId} contato={c} aoConcluir={() => setEditando(null)} />
              </li>
            ) : (
              <li key={c.id} className="flex flex-wrap items-start gap-3 rounded-xl border p-3">
                <span className="bg-muted text-muted-foreground mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full">
                  <UserRound className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {c.nome}
                    {c.cargo ? <span className="text-muted-foreground font-normal"> · {c.cargo}</span> : null}
                  </p>
                  <p className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {c.telefone ? (
                      <a href={`tel:${c.telefone}`} className="inline-flex items-center gap-1 hover:underline">
                        <Phone className="size-3.5" aria-hidden /> {formatarTelefone(c.telefone)}
                      </a>
                    ) : null}
                    {c.whatsapp ? (
                      <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                        <MessageCircle className="size-3.5" aria-hidden /> {formatarTelefone(c.whatsapp)}
                      </a>
                    ) : null}
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:underline">
                        <Mail className="size-3.5" aria-hidden /> {c.email}
                      </a>
                    ) : null}
                  </p>
                  {c.observacoes ? <p className="text-muted-foreground mt-1 text-xs whitespace-pre-line">{c.observacoes}</p> : null}
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => setEditando(c.id)} aria-label={`Editar contato ${c.nome}`}>
                    <Pencil aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setExcluindo(c)} aria-label={`Remover contato ${c.nome}`}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <ConfirmarAcao
        aberto={!!excluindo}
        aoFechar={() => setExcluindo(null)}
        titulo={`Remover ${excluindo?.nome ?? "o contato"}?`}
        descricao="O contato deixa de aparecer na ficha do cliente. O histórico da alteração fica registrado na auditoria."
        botao="Remover"
        pendente={pendente}
        aoConfirmar={confirmarExclusao}
      />
    </section>
  );
}
