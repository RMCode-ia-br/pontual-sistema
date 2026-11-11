"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import { AreaTexto, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { moverProjeto } from "../actions/funil";

type Props = {
  /** Projeto que está sendo marcado como perdido (null = diálogo fechado). */
  projeto: { id: string; titulo: string } | null;
  motivos: { id: string; nome: string }[];
  aoFechar: () => void;
  /** Chamado depois que o servidor aceitou a perda. */
  aoConcluir: (projetoId: string) => void;
};

/** Marcar como perdido pede o motivo (R10), e opcionalmente o detalhe e qual concorrente foi escolhido. */
export function DialogoPerda({ projeto, motivos, aoFechar, aoConcluir }: Props) {
  const [erro, setErro] = useState<{ geral?: string; motivo?: string }>({});
  const [pendente, iniciar] = useTransition();

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!projeto) return;
    const dados = new FormData(evento.currentTarget);
    iniciar(async () => {
      const r = await moverProjeto({
        id: projeto.id,
        para: "PERDIDO",
        motivoPerdaId: String(dados.get("motivoPerdaId") ?? ""),
        motivoPerdaDetalhe: String(dados.get("motivoPerdaDetalhe") ?? ""),
        concorrente: String(dados.get("concorrente") ?? ""),
      });
      if (r.ok) {
        setErro({});
        aoConcluir(projeto.id);
      } else {
        setErro({ geral: r.erro, motivo: r.campos?.motivoPerdaId });
      }
    });
  }

  return (
    <Dialog open={!!projeto} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent>
        <form onSubmit={enviar} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Marcar como perdido</DialogTitle>
            <DialogDescription>
              {projeto ? `Por que “${projeto.titulo}” não fechou? Isso alimenta o relatório de motivos de perda.` : null}
            </DialogDescription>
          </DialogHeader>

          <Campo id="motivoPerdaId" rotulo="Motivo" erro={erro.motivo} obrigatorio>
            <Selecao id="motivoPerdaId" name="motivoPerdaId" required defaultValue="" {...ariaDoCampo("motivoPerdaId", erro.motivo)}>
              <option value="" disabled>
                Escolha o motivo
              </option>
              {motivos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo id="concorrente" rotulo="Se escolheu um concorrente, qual? (opcional)">
            <Input id="concorrente" name="concorrente" maxLength={120} autoComplete="off" />
          </Campo>
          <Campo id="motivoPerdaDetalhe" rotulo="Detalhes (opcional)">
            <AreaTexto id="motivoPerdaDetalhe" name="motivoPerdaDetalhe" maxLength={500} rows={3} />
          </Campo>

          {erro.geral && !erro.motivo ? (
            <p role="alert" className="text-destructive text-sm">
              {erro.geral}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Marcar como perdido
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
