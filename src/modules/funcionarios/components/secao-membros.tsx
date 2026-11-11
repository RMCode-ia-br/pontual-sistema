"use client";

import { Crown, Loader2, Trash2, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { CaixaMarcacao, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ResultadoAcao } from "@/lib/acoes";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";

import { adicionarMembroDaEquipe, definirLiderDaEquipe, removerMembroDaEquipe } from "../actions/equipes";
import { ROTULO_FUNCAO, type FUNCOES } from "../schemas";

type Props = {
  equipeId: string;
  membros: { id: string; nome: string; lider: boolean }[];
  disponiveis: { id: string; nome: string; funcao: (typeof FUNCOES)[number] }[];
};

export function SecaoMembros({ equipeId, membros, disponiveis }: Props) {
  const router = useRouter();
  const [versao, setVersao] = useState(0);
  const [removendo, setRemovendo] = useState<{ id: string; nome: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const { estado, pendente: adicionando, aoEnviar } = useAcaoDeFormulario(
    (formData): Promise<ResultadoAcao> => adicionarMembroDaEquipe(null, formData),
    (r) => {
      if (r.ok) {
        toast.success(r.mensagem ?? "Adicionado.");
        setVersao((v) => v + 1);
        router.refresh();
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};

  function executar(acao: () => Promise<ResultadoAcao>, aoTerminar?: () => void) {
    iniciar(async () => {
      const r = await acao();
      aoTerminar?.();
      if (r.ok) {
        toast.success(r.mensagem ?? "Pronto.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  return (
    <section aria-labelledby="titulo-membros" className="grid gap-4">
      <h2 id="titulo-membros" className="font-medium">
        Pessoas da equipe
      </h2>

      <form key={versao} onSubmit={aoEnviar} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end" aria-label="Incluir na equipe">
        <input type="hidden" name="equipeId" value={equipeId} />
        <Campo id="funcionarioId" rotulo="Adicionar pessoa" erro={erros.funcionarioId}>
          <Selecao id="funcionarioId" name="funcionarioId" required defaultValue="" disabled={disponiveis.length === 0} {...ariaDoCampo("funcionarioId", erros.funcionarioId)}>
            <option value="" disabled>
              {disponiveis.length === 0 ? "Todos os funcionários ativos já estão na equipe" : "Escolha um funcionário…"}
            </option>
            {disponiveis.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome} — {ROTULO_FUNCAO[f.funcao]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <CaixaMarcacao id="lider-novo" name="lider" rotulo="É o líder" />
        <Button type="submit" disabled={adicionando || disponiveis.length === 0}>
          {adicionando ? <Loader2 className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />} Adicionar
        </Button>
        {estado && !estado.ok && Object.keys(erros).length === 0 ? (
          <p role="alert" className="text-destructive text-sm sm:col-span-3">
            {estado.erro}
          </p>
        ) : null}
      </form>

      {membros.length === 0 ? (
        <EstadoVazio icone={Users} titulo="Equipe sem ninguém ainda" descricao="Adicione os funcionários que trabalham juntos. A equipe vai aparecer na agenda e no calendário de instalação (Fase 4)." />
      ) : (
        <ul className="divide-y rounded-xl border">
          {membros.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="min-w-0 flex-1 text-sm font-medium">
                {m.nome} {m.lider ? <Badge className="ml-1">Líder</Badge> : null}
              </span>
              <Button type="button" variant="ghost" size="sm" disabled={pendente} onClick={() => executar(() => definirLiderDaEquipe(m.id, !m.lider))}>
                <Crown aria-hidden /> {m.lider ? "Tirar liderança" : "Tornar líder"}
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => setRemovendo({ id: m.id, nome: m.nome })} aria-label={`Tirar ${m.nome} da equipe`}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmarAcao
        aberto={!!removendo}
        aoFechar={() => setRemovendo(null)}
        titulo={`Tirar ${removendo?.nome ?? "a pessoa"} da equipe?`}
        descricao="A pessoa continua cadastrada como funcionário. Dá para colocá-la de volta na equipe quando quiser."
        botao="Tirar da equipe"
        pendente={pendente}
        aoConfirmar={() => {
          const alvo = removendo;
          if (alvo) executar(() => removerMembroDaEquipe(alvo.id), () => setRemovendo(null));
        }}
      />
    </section>
  );
}
