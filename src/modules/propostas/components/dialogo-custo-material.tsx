"use client";

import { Calculator, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { CampoMascarado } from "@/components/campo-mascarado";
import { Campo, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { centavosParaCampo, mascararMoeda } from "@/lib/formatadores/mascaras";

import { salvarCustoDeMaterial } from "../actions/custo-material";

type Props = {
  propostaId: string;
  opcao: { id: string; nome: string; custoMaterialInformadoCentavos: number | null };
  itens: { id: string; rotulo: string; custoMaterialInformadoCentavos: number | null }[];
};

/**
 * Custo de material informado à mão (vem do programa de corte do fornecedor): total da opção e/ou por item. Só interno: serve
 * à margem estimada e NUNCA vai ao PDF nem ao conteúdo congelado. Funciona em qualquer status da proposta.
 */
export function DialogoDeCustoDeMaterial({ propostaId, opcao, itens }: Props) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [erros, setErros] = useState<Record<string, string>>({});
  const [geral, setGeral] = useState<string | null>(null);

  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    const dados = new FormData(e.currentTarget);
    setErros({});
    setGeral(null);
    iniciar(async () => {
      const r = await salvarCustoDeMaterial({
        propostaId,
        opcaoId: opcao.id,
        total: String(dados.get("total") ?? ""),
        itens: itens.map((i) => ({ itemId: i.id, valor: String(dados.get(`item:${i.id}`) ?? "") })),
      });
      if (r.ok) {
        toast.success(r.mensagem ?? "Salvo.");
        setAberto(false);
        router.refresh();
      } else {
        setErros(r.campos ?? {});
        setGeral(r.erro);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)} className="mt-1 w-fit">
        <Calculator aria-hidden /> Informar custo de material (programa)
      </Button>
      <Dialog open={aberto} onOpenChange={(a) => !pendente && setAberto(a)}>
        <DialogContent>
          <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>Custo de material do programa</DialogTitle>
              <DialogDescription>
                {opcao.nome ? `${opcao.nome}. ` : ""}Digite o custo de material que o programa de corte calculou. Serve só para a sua margem estimada: <strong>não aparece no PDF</strong> e não altera a proposta enviada. Vazio = não informado.
              </DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
              <Campo id="cm-total" rotulo="Total da opção (R$)" erro={erros.total} dica="Se informar o total, ele vale no lugar da soma dos itens.">
                <CampoMascarado id="cm-total" name="total" mascara={mascararMoeda} defaultValue={centavosParaCampo(opcao.custoMaterialInformadoCentavos)} inputMode="numeric" autoComplete="off" placeholder="0,00" {...ariaDoCampo("cm-total", erros.total)} />
              </Campo>
              {itens.length > 0 ? (
                <fieldset className="grid gap-3">
                  <legend className="text-sm font-medium">Ou por item (opcional)</legend>
                  {itens.map((i) => (
                    <Campo key={i.id} id={`cm-${i.id}`} rotulo={i.rotulo} erro={erros[`item:${i.id}`]}>
                      <CampoMascarado id={`cm-${i.id}`} name={`item:${i.id}`} mascara={mascararMoeda} defaultValue={centavosParaCampo(i.custoMaterialInformadoCentavos)} inputMode="numeric" autoComplete="off" placeholder="0,00" {...ariaDoCampo(`cm-${i.id}`, erros[`item:${i.id}`])} />
                    </Campo>
                  ))}
                </fieldset>
              ) : null}
              {geral && Object.keys(erros).length === 0 ? (
                <p role="alert" className="text-destructive text-sm">
                  {geral}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={pendente}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendente}>
                {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
