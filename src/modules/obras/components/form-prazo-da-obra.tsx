"use client";

import { CalendarClock, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { definirPrazo, sugerirDatas } from "../actions/obra";
import { DialogoDatasSugeridas, type SugestaoDaObra } from "./dialogo-datas-sugeridas";

type Atual = {
  modo: "NENHUM" | "TOTAL" | "POR_ETAPA";
  diasTotais: number | null;
  porGrupo: { MATERIAL: number; EXECUCAO: number; VIDROS_FINALIZACAO: number } | null;
  tipoDias: "UTEIS" | "CORRIDOS";
};

type Props = { projetoId: string; atual: Atual; nomes: Record<string, string>; rotulo: string };

const inteiro = (texto: string): number | null => (texto.trim() === "" ? null : /^\d{1,4}$/.test(texto.trim()) ? Number(texto.trim()) : Number.NaN);

/** Define ou ajusta o prazo da obra (quando a proposta não trazia, ou por acerto do gestor). Depois, sugere as datas. */
export function FormPrazoDaObra({ projetoId, atual, nomes, rotulo }: Props) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<Atual["modo"]>(atual.modo === "NENHUM" ? "TOTAL" : atual.modo);
  const [total, setTotal] = useState(atual.modo === "TOTAL" && atual.diasTotais ? String(atual.diasTotais) : "");
  const [material, setMaterial] = useState(atual.porGrupo?.MATERIAL ? String(atual.porGrupo.MATERIAL) : "");
  const [execucao, setExecucao] = useState(atual.porGrupo?.EXECUCAO ? String(atual.porGrupo.EXECUCAO) : "");
  const [vidros, setVidros] = useState(atual.porGrupo?.VIDROS_FINALIZACAO ? String(atual.porGrupo.VIDROS_FINALIZACAO) : "");
  const [tipoDias, setTipoDias] = useState<Atual["tipoDias"]>(atual.tipoDias);
  const [erro, setErro] = useState<{ geral?: string; campos?: Record<string, string> }>({});
  const [sugestao, setSugestao] = useState<SugestaoDaObra | null>(null);
  const [pendente, iniciar] = useTransition();
  const campos = erro.campos ?? {};

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro({});
    const numeros = [total, material, execucao, vidros].map(inteiro);
    if (numeros.some((n) => Number.isNaN(n))) return setErro({ geral: "Use só números inteiros nos dias." });
    iniciar(async () => {
      const [t, m, x, v] = numeros;
      const r = await definirPrazo({ projetoId, modo, totalDias: modo === "TOTAL" ? t : null, materialDias: modo === "POR_ETAPA" ? m : null, execucaoDias: modo === "POR_ETAPA" ? x : null, vidrosDias: modo === "POR_ETAPA" ? v : null, tipoDias });
      if (!r.ok) return setErro({ geral: r.erro, campos: r.campos });
      toast.success(r.mensagem ?? "Salvo.");
      setAberto(false);
      router.refresh();
      if (modo !== "NENHUM") {
        const s = await sugerirDatas({ projetoId });
        if (s.ok && s.dados && s.dados.itens.length > 0) setSugestao({ tipo: "CALCULO", itens: s.dados.itens });
      }
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant={atual.modo === "NENHUM" ? "default" : "outline"} onClick={() => setAberto(true)}>
        <CalendarClock aria-hidden /> {rotulo}
      </Button>
      <Dialog open={aberto} onOpenChange={(a) => !a && !pendente && setAberto(false)}>
        <DialogContent>
          <form onSubmit={enviar} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>Prazo da obra</DialogTitle>
              <DialogDescription>O prazo conta a partir da conclusão da medição exata. Os dias vêm do que foi combinado com o cliente na proposta.</DialogDescription>
            </DialogHeader>

            <Campo id="modo-prazo" rotulo="Como o prazo foi combinado" erro={campos.modo}>
              <Selecao id="modo-prazo" value={modo} onChange={(e) => setModo(e.target.value as Atual["modo"])} {...ariaDoCampo("modo-prazo", campos.modo)}>
                <option value="TOTAL">Um prazo total</option>
                <option value="POR_ETAPA">Por etapas (material, execução, vidros e finalização)</option>
                <option value="NENHUM">Sem prazo definido</option>
              </Selecao>
            </Campo>

            {modo === "TOTAL" ? (
              <Campo id="total-dias" rotulo="Prazo total (dias)" erro={campos.totalDias} dica="Se a proposta diz “20 a 35 dias”, use o maior valor.">
                <Input id="total-dias" inputMode="numeric" value={total} maxLength={4} onChange={(e) => setTotal(e.target.value)} {...ariaDoCampo("total-dias", campos.totalDias)} />
              </Campo>
            ) : null}
            {modo === "POR_ETAPA" ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Campo id="material-dias" rotulo="Material (dias)" erro={campos.materialDias}>
                  <Input id="material-dias" inputMode="numeric" value={material} maxLength={4} onChange={(e) => setMaterial(e.target.value)} />
                </Campo>
                <Campo id="execucao-dias" rotulo="Execução (dias)" erro={campos.execucaoDias}>
                  <Input id="execucao-dias" inputMode="numeric" value={execucao} maxLength={4} onChange={(e) => setExecucao(e.target.value)} />
                </Campo>
                <Campo id="vidros-dias" rotulo="Vidros e finalização (dias)" erro={campos.vidrosDias}>
                  <Input id="vidros-dias" inputMode="numeric" value={vidros} maxLength={4} onChange={(e) => setVidros(e.target.value)} />
                </Campo>
              </div>
            ) : null}

            {modo !== "NENHUM" ? (
              <Campo id="tipo-dias" rotulo="Contagem" erro={campos.tipoDias}>
                <Selecao id="tipo-dias" value={tipoDias} onChange={(e) => setTipoDias(e.target.value as Atual["tipoDias"])}>
                  <option value="UTEIS">Dias úteis (sem fins de semana e feriados)</option>
                  <option value="CORRIDOS">Dias corridos</option>
                </Selecao>
              </Campo>
            ) : null}

            {erro.geral && Object.keys(campos).length === 0 ? (
              <p role="alert" className="text-destructive text-sm">
                {erro.geral}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={pendente}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendente}>
                {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Salvar prazo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DialogoDatasSugeridas projetoId={projetoId} sugestao={sugestao} nomes={nomes} aoFechar={() => setSugestao(null)} />
    </>
  );
}
