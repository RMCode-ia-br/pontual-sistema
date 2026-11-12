"use client";

import { Loader2, Scissors } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CaixaMarcacao, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { destinoDaSobra } from "@/lib/dominio/retalhos";
import { formatarQuantidade } from "@/lib/dominio/estoque";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { CampoProjeto } from "@/modules/agenda/components/campo-projeto";

import { baixarPerfil } from "../actions/retalhos";

type Props = {
  produtoId: string;
  produtoNome: string;
  saldoMilesimos: number;
  comprimentoBarraMm: number | null;
  /** kg/m em milésimos; null = peso por metro não informado. */
  pesoMilesimosKgPorMetro: number | null;
  /** Configurações; null = não definido (a pessoa escolhe retalho ou sucata). */
  retalhoMinimoMm: number | null;
  hoje: string;
};

/**
 * Baixa de perfil para uma obra: barras inteiras, ou UMA barra cortada. Mostra na hora o destino da sobra (retalho ou sucata)
 * pela mesma regra do servidor. Sem retalho mínimo em Configurações, pergunta; sem comprimento da barra, pede o cadastro.
 */
export function DialogoDeBaixaDePerfil({ produtoId, produtoNome, saldoMilesimos, comprimentoBarraMm, pesoMilesimosKgPorMetro, retalhoMinimoMm, hoje }: Props) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<"BARRAS_INTEIRAS" | "BARRA_CORTADA">("BARRA_CORTADA");
  const [usado, setUsado] = useState("");
  const [barras, setBarras] = useState("1");
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<unknown>((fd) => baixarPerfil(null, fd), (r) => {
    if (r.ok) {
      toast.success(r.mensagem ?? "Baixa registrada.");
      setAberto(false);
      setUsado("");
      router.refresh();
    }
  });
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};

  const usadoMm = /^\d+$/.test(usado) ? Number(usado) : 0;
  const sobra = modo === "BARRA_CORTADA" && usadoMm > 0 ? destinoDaSobra({ comprimentoBarraMm, usadoMm, retalhoMinimoMm, pesoMilesimosKgPorMetro }) : null;
  const barrasNum = /^\d+$/.test(barras) ? Number(barras) : 0;
  const semSaldo = modo === "BARRAS_INTEIRAS" ? saldoMilesimos < barrasNum * 1000 : saldoMilesimos < 1000;

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAberto(true)}>
        <Scissors aria-hidden /> Baixar perfil para a obra
      </Button>
      <Dialog open={aberto} onOpenChange={(a) => !pendente && setAberto(a)}>
        <DialogContent>
          <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>Baixar perfil para a obra</DialogTitle>
              <DialogDescription>
                {produtoNome}. Saldo: <strong>{formatarQuantidade(saldoMilesimos)} barras</strong>
                {comprimentoBarraMm ? `, cada uma com ${comprimentoBarraMm.toLocaleString("pt-BR")} mm` : ""}.
              </DialogDescription>
            </DialogHeader>
            <input type="hidden" name="produtoId" value={produtoId} />
            {comprimentoBarraMm === null ? (
              <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                Este produto não tem o comprimento da barra. <Link href={`/produtos/${produtoId}`} className="underline">Informe no cadastro</Link> para baixar por corte.
              </p>
            ) : null}
            <Campo id="bx-obra" rotulo="Obra" erro={erros.projetoId} obrigatorio dica="Obras aprovadas, em execução ou concluídas.">
              <CampoProjeto id="bx-obra" name="projetoId" />
            </Campo>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="bx-modo" rotulo="Como baixar" erro={erros.modo} obrigatorio>
                <Selecao id="bx-modo" name="modo" value={modo} onChange={(e) => setModo(e.target.value as typeof modo)}>
                  <option value="BARRA_CORTADA">Cortei uma barra (a sobra vira retalho ou sucata)</option>
                  <option value="BARRAS_INTEIRAS">Barras inteiras</option>
                </Selecao>
              </Campo>
              <Campo id="bx-data" rotulo="Data" erro={erros.data} obrigatorio>
                <Input id="bx-data" name="data" type="date" required defaultValue={hoje} {...ariaDoCampo("bx-data", erros.data)} />
              </Campo>
            </div>
            {modo === "BARRAS_INTEIRAS" ? (
              <Campo id="bx-barras" rotulo="Quantas barras inteiras" erro={erros.barras} obrigatorio>
                <Input id="bx-barras" name="barras" inputMode="numeric" required value={barras} onChange={(e) => setBarras(e.target.value)} autoComplete="off" {...ariaDoCampo("bx-barras", erros.barras)} />
              </Campo>
            ) : (
              <>
                <Campo id="bx-usado" rotulo="Comprimento usado da barra (mm)" erro={erros.usadoMm} obrigatorio>
                  <Input id="bx-usado" name="usadoMm" inputMode="numeric" required value={usado} onChange={(e) => setUsado(e.target.value)} autoComplete="off" {...ariaDoCampo("bx-usado", erros.usadoMm)} />
                </Campo>
                {sobra && sobra.ok ? (
                  <div role="status" className="grid gap-3 rounded-lg border p-3 text-sm">
                    {sobra.destino === "NENHUMA" ? <p>Sem sobra: a barra toda foi usada.</p> : null}
                    {sobra.destino === "RETALHO" ? <p>Sobra de <strong>{sobra.sobraMm.toLocaleString("pt-BR")} mm</strong>: fica guardada como <strong>retalho</strong>.</p> : null}
                    {sobra.destino === "SUCATA" ? (
                      <p>
                        Sobra de <strong>{sobra.sobraMm.toLocaleString("pt-BR")} mm</strong>, menor que o retalho mínimo: vai para a <strong>sucata</strong>
                        {sobra.pesoMilesimosKg !== null ? ` (${formatarQuantidade(sobra.pesoMilesimosKg)} kg)` : " (peso não informado: o perfil não tem peso por metro)"}.
                      </p>
                    ) : null}
                    {sobra.destino === "DECIDIR" ? (
                      <>
                        <p role="alert" className="text-amber-700 dark:text-amber-400">
                          {sobra.aviso} Sobra de {sobra.sobraMm.toLocaleString("pt-BR")} mm.
                        </p>
                        <Campo id="bx-destino" rotulo="A sobra é" erro={erros.destinoDaSobra} obrigatorio>
                          <Selecao id="bx-destino" name="destinoDaSobra" defaultValue="">
                            <option value="">Escolha...</option>
                            <option value="RETALHO">Retalho (guardo para outra obra)</option>
                            <option value="SUCATA">Sucata (vou vender)</option>
                          </Selecao>
                        </Campo>
                      </>
                    ) : null}
                    {sobra.destino === "RETALHO" || (sobra.destino === "DECIDIR") ? (
                      <Campo id="bx-local" rotulo="Onde o retalho fica guardado (opcional)" erro={erros.local}>
                        <Input id="bx-local" name="local" maxLength={120} autoComplete="off" />
                      </Campo>
                    ) : null}
                  </div>
                ) : sobra && !sobra.ok ? (
                  <p role="alert" className="text-destructive text-sm">
                    {sobra.erro}
                  </p>
                ) : null}
              </>
            )}
            {semSaldo ? (
              <div role="alert" className="grid gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p>A baixa passa do saldo de barras. Para registrar mesmo assim, confirme e explique o motivo.</p>
                <CaixaMarcacao id="bx-confirma" name="confirmarSemSaldo" rotulo="Confirmo: o saldo vai ficar negativo" />
                <Campo id="bx-just" rotulo="Justificativa" erro={erros.justificativa ?? erros.quantidade} obrigatorio>
                  <Input id="bx-just" name="justificativa" maxLength={300} autoComplete="off" />
                </Campo>
              </div>
            ) : null}
            {estado && !estado.ok && Object.keys(erros).length === 0 ? (
              <p role="alert" className="text-destructive text-sm">
                {estado.erro}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={pendente}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendente || (modo === "BARRA_CORTADA" && comprimentoBarraMm === null)}>
                {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Registrar baixa
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
