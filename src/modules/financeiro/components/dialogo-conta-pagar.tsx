"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { AreaTexto, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FORMAS_PAGAMENTO, ROTULO_FORMA } from "@/lib/dominio/parcelas";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";

import { criarContaAPagarAcao } from "../actions/pagar";
import type { OpcoesDeContaAPagar } from "../queries-pagar";
import { MODOS_DE_LANCAMENTO, PERIODICIDADES, ROTULO_MODO_DE_LANCAMENTO, ROTULO_PERIODICIDADE } from "../schemas";

import { CampoDinheiro } from "./dialogos-financeiros";

function Dialogo({ opcoes, hoje, aoFechar }: { opcoes: OpcoesDeContaAPagar; hoje: string; aoFechar: () => void }) {
  const router = useRouter();
  const [modo, setModo] = useState<(typeof MODOS_DE_LANCAMENTO)[number]>("UNICA");
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<{ id: string }>(
    (formData) => criarContaAPagarAcao(null, formData),
    (r) => {
      if (r.ok) {
        toast.success(r.mensagem ?? "Criada.");
        aoFechar();
        router.refresh();
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const erroGeral = estado && !estado.ok && Object.keys(erros).length === 0 ? estado.erro : null;

  return (
    <Dialog open onOpenChange={(a) => !a && !pendente && aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Nova conta a pagar</DialogTitle>
            <DialogDescription>Única, parcelada ou recorrente (aluguel, energia, DAS e salários entram como recorrência mensal).</DialogDescription>
          </DialogHeader>

          <Campo id="cp-modo" rotulo="Como lançar" erro={erros.modo} obrigatorio>
            <Selecao id="cp-modo" name="modo" value={modo} onChange={(e) => setModo(e.target.value as typeof modo)} {...ariaDoCampo("cp-modo", erros.modo)}>
              {MODOS_DE_LANCAMENTO.map((m) => (
                <option key={m} value={m}>
                  {ROTULO_MODO_DE_LANCAMENTO[m]}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo id="cp-descricao" rotulo="Descrição" erro={erros.descricao} obrigatorio>
            <Input id="cp-descricao" name="descricao" required maxLength={200} autoComplete="off" {...ariaDoCampo("cp-descricao", erros.descricao)} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="cp-valor" rotulo={modo === "PARCELADA" ? "Valor total" : modo === "RECORRENTE" ? "Valor de cada vez" : "Valor"} erro={erros.valor} obrigatorio>
              <CampoDinheiro id="cp-valor" nome="valor" erro={erros.valor} />
            </Campo>
            <Campo id="cp-venc" rotulo={modo === "UNICA" ? "Vencimento" : "Primeiro vencimento"} erro={erros.vencimento} obrigatorio dica={modo === "RECORRENTE" ? "O dia do mês se repete (em mês curto vale o último dia)." : undefined}>
              <Input id="cp-venc" name="vencimento" type="date" required defaultValue={hoje} {...ariaDoCampo("cp-venc", erros.vencimento)} />
            </Campo>
          </div>

          {modo === "PARCELADA" ? (
            <Campo id="cp-parcelas" rotulo="Número de parcelas" erro={erros.parcelas} dica="Mensais; a última absorve a diferença do arredondamento.">
              <Input id="cp-parcelas" name="parcelas" inputMode="numeric" defaultValue="2" maxLength={2} {...ariaDoCampo("cp-parcelas", erros.parcelas, "dica")} />
            </Campo>
          ) : null}
          {modo === "RECORRENTE" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="cp-period" rotulo="Repete" erro={erros.periodicidade}>
                <Selecao id="cp-period" name="periodicidade" defaultValue="MENSAL">
                  {PERIODICIDADES.map((p) => (
                    <option key={p} value={p}>
                      {ROTULO_PERIODICIDADE[p]}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo id="cp-fim" rotulo="Até (opcional)" erro={erros.fimRecorrencia} dica="Vazio = sem fim.">
                <Input id="cp-fim" name="fimRecorrencia" type="date" {...ariaDoCampo("cp-fim", erros.fimRecorrencia, "dica")} />
              </Campo>
            </div>
          ) : null}

          <Campo id="cp-categoria" rotulo="Categoria" erro={erros.categoriaId} obrigatorio>
            <Selecao id="cp-categoria" name="categoriaId" required defaultValue="" {...ariaDoCampo("cp-categoria", erros.categoriaId)}>
              <option value="">Escolha a categoria...</option>
              {opcoes.categoriasDeDespesa.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="cp-fornecedor" rotulo="Fornecedor (opcional)" erro={erros.fornecedorId}>
              <Selecao id="cp-fornecedor" name="fornecedorId" defaultValue="">
                <option value="">—</option>
                {opcoes.fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo id="cp-funcionario" rotulo="Funcionário (opcional)" erro={erros.funcionarioId}>
              <Selecao id="cp-funcionario" name="funcionarioId" defaultValue="">
                <option value="">—</option>
                {opcoes.funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo id="cp-favorecido" rotulo="Outro favorecido (opcional)" erro={erros.favorecido} dica="Ex.: dono do imóvel do aluguel.">
              <Input id="cp-favorecido" name="favorecido" maxLength={120} autoComplete="off" {...ariaDoCampo("cp-favorecido", erros.favorecido, "dica")} />
            </Campo>
            <Campo id="cp-obra" rotulo="Obra (opcional)" erro={erros.projetoId} dica="Custo direto da obra.">
              <Selecao id="cp-obra" name="projetoId" defaultValue="">
                <option value="">—</option>
                {opcoes.obras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
          </div>
          <Campo id="cp-forma" rotulo="Forma de pagamento (opcional)" erro={erros.forma}>
            <Selecao id="cp-forma" name="forma" defaultValue="">
              <option value="">—</option>
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f} value={f}>
                  {ROTULO_FORMA[f]}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo id="cp-obs" rotulo="Observação (opcional)" erro={erros.observacao}>
            <AreaTexto id="cp-obs" name="observacao" rows={2} maxLength={500} />
          </Campo>
          {erroGeral ? (
            <p role="alert" className="text-destructive text-sm">
              {erroGeral}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BotaoNovaContaAPagar({ opcoes, hoje }: { opcoes: OpcoesDeContaAPagar; hoje: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setAberto(true)}>
        <Plus aria-hidden /> Nova conta a pagar
      </Button>
      {aberto ? <Dialogo opcoes={opcoes} hoje={hoje} aoFechar={() => setAberto(false)} /> : null}
    </>
  );
}
