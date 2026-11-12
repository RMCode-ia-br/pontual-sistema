"use client";

import { Hammer, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { AreaTexto, CaixaMarcacao, Campo, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { CampoProjeto } from "@/modules/agenda/components/campo-projeto";

import { descartarRetalhoAcao, usarRetalho } from "../actions/retalhos";

type Retalho = { id: string; produto: string; comprimentoMm: number };

function useDialogo(acao: (fd: FormData) => Promise<import("@/lib/acoes").ResultadoAcao<unknown>>, aoFechar: () => void) {
  const router = useRouter();
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<unknown>(acao, (r) => {
    if (r.ok) {
      toast.success(r.mensagem ?? "Salvo.");
      aoFechar();
      router.refresh();
    }
  });
  return { estado, pendente, aoEnviar, erros: estado && !estado.ok ? (estado.campos ?? {}) : {} };
}

function Rodape({ pendente, aoFechar, rotulo, destrutivo = false }: { pendente: boolean; aoFechar: () => void; rotulo: string; destrutivo?: boolean }) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={aoFechar} disabled={pendente}>
        Cancelar
      </Button>
      <Button type="submit" variant={destrutivo ? "destructive" : "default"} disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} {rotulo}
      </Button>
    </DialogFooter>
  );
}

function DialogoUsar({ retalho, aoFechar }: { retalho: Retalho; aoFechar: () => void }) {
  const { estado, pendente, aoEnviar, erros } = useDialogo((fd) => usarRetalho(null, fd), aoFechar);
  return (
    <Dialog open onOpenChange={(a) => !a && !pendente && aoFechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Usar o retalho numa obra</DialogTitle>
            <DialogDescription>
              {retalho.produto}, {retalho.comprimentoMm.toLocaleString("pt-BR")} mm. O custo deste pedaço já foi contado na obra de onde ele veio: aqui entra a R$ 0,00, só como informação.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="retalhoId" value={retalho.id} />
          <Campo id="ret-obra" rotulo="Obra" erro={erros.projetoId} obrigatorio dica="Obras aprovadas, em execução ou concluídas.">
            <CampoProjeto id="ret-obra" name="projetoId" />
          </Campo>
          {estado && !estado.ok && Object.keys(erros).length === 0 ? (
            <p role="alert" className="text-destructive text-sm">
              {estado.erro}
            </p>
          ) : null}
          <Rodape pendente={pendente} aoFechar={aoFechar} rotulo="Usar na obra" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoDescartar({ retalho, aoFechar }: { retalho: Retalho; aoFechar: () => void }) {
  const { estado, pendente, aoEnviar, erros } = useDialogo((fd) => descartarRetalhoAcao(null, fd), aoFechar);
  return (
    <Dialog open onOpenChange={(a) => !a && !pendente && aoFechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Descartar o retalho?</DialogTitle>
            <DialogDescription>
              {retalho.produto}, {retalho.comprimentoMm.toLocaleString("pt-BR")} mm. Nada é apagado: o retalho fica como descartado, com o motivo.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="retalhoId" value={retalho.id} />
          <Campo id="desc-motivo" rotulo="Motivo" erro={erros.motivo} obrigatorio>
            <AreaTexto id="desc-motivo" name="motivo" rows={2} maxLength={300} required {...ariaDoCampo("desc-motivo", erros.motivo)} />
          </Campo>
          <CaixaMarcacao id="desc-sucata" name="virarSucata" rotulo="Enviar o pedaço para a sucata (para vender depois)" defaultChecked />
          {estado && !estado.ok && Object.keys(erros).length === 0 ? (
            <p role="alert" className="text-destructive text-sm">
              {estado.erro}
            </p>
          ) : null}
          <Rodape pendente={pendente} aoFechar={aoFechar} rotulo="Descartar" destrutivo />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Ações de um retalho disponível: usar numa obra ou descartar. */
export function AcoesDoRetalho({ retalho }: { retalho: Retalho }) {
  const [dialogo, setDialogo] = useState<"usar" | "descartar" | null>(null);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => setDialogo("usar")}>
          <Hammer aria-hidden /> Usar em obra
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setDialogo("descartar")}>
          <Trash2 aria-hidden /> Descartar
        </Button>
      </div>
      {dialogo === "usar" ? <DialogoUsar retalho={retalho} aoFechar={() => setDialogo(null)} /> : null}
      {dialogo === "descartar" ? <DialogoDescartar retalho={retalho} aoFechar={() => setDialogo(null)} /> : null}
    </>
  );
}
