"use client";

import { Bot, Loader2, Mail, MessageCircle, MessageSquareText, Phone, StickyNote, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { AreaTexto, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Button } from "@/components/ui/button";
import { formatarDataHora } from "@/lib/formatadores";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";

import { excluirInteracaoDoCliente, registrarInteracaoDoCliente } from "../actions/interacoes";
import type { InteracaoItem } from "../queries";
import { ROTULO_INTERACAO, TIPOS_INTERACAO_MANUAL } from "../schemas";

const ICONES = { NOTA: StickyNote, LIGACAO: Phone, WHATSAPP: MessageCircle, VISITA: Users, EMAIL: Mail, SISTEMA: Bot } as const;

export function LinhaDoTempo({ clienteId, itens }: { clienteId: string; itens: InteracaoItem[] }) {
  const router = useRouter();
  const [versao, setVersao] = useState(0);
  const [excluindo, setExcluindo] = useState<InteracaoItem | null>(null);
  const [pendente, iniciar] = useTransition();
  const { estado, pendente: salvando, aoEnviar } = useAcaoDeFormulario(registrarInteracaoDoCliente.bind(null, null), (r) => {
    if (r.ok) {
      toast.success(r.mensagem ?? "Registrado.");
      setVersao((v) => v + 1); // limpa o formulário para o próximo registro
      router.refresh();
    }
  });
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};

  function confirmarExclusao() {
    const alvo = excluindo;
    if (!alvo) return;
    iniciar(async () => {
      const r = await excluirInteracaoDoCliente(alvo.id);
      setExcluindo(null);
      if (r.ok) {
        toast.success(r.mensagem ?? "Removido.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  return (
    <section aria-labelledby="titulo-linha-tempo" className="grid gap-4">
      <h2 id="titulo-linha-tempo" className="font-medium">
        Linha do tempo
      </h2>

      <form key={versao} onSubmit={aoEnviar} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[12rem_1fr]" aria-label="Novo registro na linha do tempo">
        <input type="hidden" name="clienteId" value={clienteId} />
        <Campo id="tipo-interacao" rotulo="O que aconteceu" erro={erros.tipo}>
          <Selecao id="tipo-interacao" name="tipo" defaultValue="NOTA" {...ariaDoCampo("tipo-interacao", erros.tipo)}>
            {TIPOS_INTERACAO_MANUAL.map((t) => (
              <option key={t} value={t}>
                {ROTULO_INTERACAO[t]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="texto-interacao" rotulo="Registro" erro={erros.texto} obrigatorio>
          <AreaTexto id="texto-interacao" name="texto" required maxLength={4000} rows={3} placeholder="Ex.: Liguei, pediu proposta para 4 janelas e uma porta de correr." {...ariaDoCampo("texto-interacao", erros.texto)} />
        </Campo>
        {estado && !estado.ok && Object.keys(erros).length === 0 ? (
          <p role="alert" className="text-destructive text-sm sm:col-span-2">
            {estado.erro}
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={salvando}>
            {salvando ? <Loader2 className="animate-spin" aria-hidden /> : null} Registrar
          </Button>
        </div>
      </form>

      {itens.length === 0 ? (
        <EstadoVazio
          icone={MessageSquareText}
          titulo="Nada registrado ainda"
          descricao="Anote ligações, mensagens e visitas para qualquer pessoa da equipe saber como está a conversa. Eventos do sistema também aparecem aqui."
        />
      ) : (
        <ol className="grid gap-0">
          {itens.map((i) => {
            const Icone = ICONES[i.tipo as keyof typeof ICONES] ?? StickyNote;
            const manual = i.tipo !== "SISTEMA";
            return (
              <li key={i.id} className="relative flex gap-3 pb-5 last:pb-0">
                <span className="bg-border absolute top-8 bottom-0 left-4 w-px last:hidden" aria-hidden />
                <span className="bg-muted text-muted-foreground relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full">
                  <Icone className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground text-xs">
                    <span className="text-foreground font-medium">{ROTULO_INTERACAO[i.tipo] ?? i.tipo}</span> · {formatarDataHora(i.criadoEm)}
                    {i.autor ? ` · ${i.autor}` : ""}
                  </p>
                  <p className="mt-0.5 text-sm whitespace-pre-line">{i.texto}</p>
                </div>
                {manual ? (
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setExcluindo(i)} aria-label={`Remover o registro de ${formatarDataHora(i.criadoEm)}`}>
                    <Trash2 aria-hidden />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <ConfirmarAcao
        aberto={!!excluindo}
        aoFechar={() => setExcluindo(null)}
        titulo="Remover este registro?"
        descricao="O registro deixa de aparecer na linha do tempo. O histórico da alteração fica registrado na auditoria."
        botao="Remover"
        pendente={pendente}
        aoConfirmar={confirmarExclusao}
      />
    </section>
  );
}
