"use client";

import { Loader2, Pencil, Repeat, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { AreaTexto, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FORMAS_PAGAMENTO, ROTULO_FORMA } from "@/lib/dominio/parcelas";
import { formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { mascararMoeda } from "@/lib/formatadores/mascaras";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";

import { editarRecorrenciaAcao, encerrarRecorrenciaAcao } from "../actions/pagar";
import type { OpcoesDeContaAPagar, RecorrenciaDaLista } from "../queries-pagar";
import { ROTULO_PERIODICIDADE } from "../schemas";

import { CampoDinheiro } from "./dialogos-financeiros";

function DialogoDeEdicao({ r, opcoes, aoFechar }: { r: RecorrenciaDaLista; opcoes: OpcoesDeContaAPagar; aoFechar: () => void }) {
  const router = useRouter();
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<unknown>(
    (fd) => editarRecorrenciaAcao(null, fd),
    (res) => {
      if (res.ok) {
        toast.success(res.mensagem ?? "Salvo.");
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
            <DialogTitle>Editar a recorrência</DialogTitle>
            <DialogDescription>A mudança vale para as contas futuras ainda em aberto e sem pagamento. O que já venceu, foi pago ou foi cancelado não muda.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="recorrenciaId" value={r.id} />
          <Campo id="rec-descricao" rotulo="Descrição" erro={erros.descricao} obrigatorio>
            <Input id="rec-descricao" name="descricao" required maxLength={200} defaultValue={r.descricao} {...ariaDoCampo("rec-descricao", erros.descricao)} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="rec-valor" rotulo="Valor de cada vez" erro={erros.valor} obrigatorio>
              <CampoDinheiro id="rec-valor" nome="valor" erro={erros.valor} defaultValue={mascararMoeda(String(r.valorCentavos))} />
            </Campo>
            <Campo id="rec-dia" rotulo="Dia do vencimento" erro={erros.diaVencimento} obrigatorio dica="Em mês curto vale o último dia.">
              <Input id="rec-dia" name="diaVencimento" inputMode="numeric" maxLength={2} defaultValue={String(r.diaVencimento)} {...ariaDoCampo("rec-dia", erros.diaVencimento, "dica")} />
            </Campo>
            <Campo id="rec-fim" rotulo="Até (opcional)" erro={erros.fim}>
              <Input id="rec-fim" name="fim" type="date" defaultValue={r.fim ?? ""} {...ariaDoCampo("rec-fim", erros.fim)} />
            </Campo>
            <Campo id="rec-categoria" rotulo="Categoria" erro={erros.categoriaId} obrigatorio>
              <Selecao id="rec-categoria" name="categoriaId" required defaultValue={r.categoriaId ?? ""} {...ariaDoCampo("rec-categoria", erros.categoriaId)}>
                <option value="">Escolha...</option>
                {opcoes.categoriasDeDespesa.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo id="rec-fornecedor" rotulo="Fornecedor" erro={erros.fornecedorId}>
              <Selecao id="rec-fornecedor" name="fornecedorId" defaultValue={r.fornecedorId ?? ""}>
                <option value="">—</option>
                {opcoes.fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo id="rec-funcionario" rotulo="Funcionário" erro={erros.funcionarioId}>
              <Selecao id="rec-funcionario" name="funcionarioId" defaultValue={r.funcionarioId ?? ""}>
                <option value="">—</option>
                {opcoes.funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo id="rec-favorecido" rotulo="Outro favorecido" erro={erros.favorecido}>
              <Input id="rec-favorecido" name="favorecido" maxLength={120} defaultValue={r.favorecidoLivre ?? ""} />
            </Campo>
            <Campo id="rec-forma" rotulo="Forma" erro={erros.forma}>
              <Selecao id="rec-forma" name="forma" defaultValue={r.forma ?? ""}>
                <option value="">—</option>
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f} value={f}>
                    {ROTULO_FORMA[f]}
                  </option>
                ))}
              </Selecao>
            </Campo>
          </div>
          <Campo id="rec-obs" rotulo="Observação" erro={erros.observacao}>
            <AreaTexto id="rec-obs" name="observacao" rows={2} maxLength={500} defaultValue={r.observacao ?? ""} />
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
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PainelDeRecorrencias({ recorrencias, opcoes }: { recorrencias: RecorrenciaDaLista[]; opcoes: OpcoesDeContaAPagar }) {
  const router = useRouter();
  const [editando, setEditando] = useState<RecorrenciaDaLista | null>(null);
  const [encerrando, setEncerrando] = useState<RecorrenciaDaLista | null>(null);
  const [pendente, iniciar] = useTransition();

  function encerrar() {
    const r = encerrando;
    if (!r) return;
    iniciar(async () => {
      const res = await encerrarRecorrenciaAcao({ recorrenciaId: r.id });
      setEncerrando(null);
      if (res.ok) {
        toast.success(res.mensagem ?? "Encerrada.");
        router.refresh();
      } else toast.error(res.erro);
    });
  }

  if (recorrencias.length === 0) {
    return <EstadoVazio icone={Repeat} titulo="Nenhuma recorrência ainda" descricao="Crie uma conta a pagar “Recorrente” (aluguel, energia, DAS, salário) e as contas dos próximos meses saem sozinhas." />;
  }
  return (
    <>
      <ul className="grid gap-2">
        {recorrencias.map((r) => (
          <li key={r.id} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
            <div className="grid gap-0.5">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {r.descricao}
                {!r.ativo ? <Badge variant="outline">Encerrada</Badge> : null}
              </p>
              <p className="text-muted-foreground text-xs">
                {ROTULO_PERIODICIDADE[r.periodicidade]}, dia {r.diaVencimento} · desde {formatarDataCalendario(r.inicio)}
                {r.fim ? ` até ${formatarDataCalendario(r.fim)}` : ""}
                {r.favorecido ? ` · ${r.favorecido}` : ""}
                {r.categoria ? ` · ${r.categoria}` : ""}
              </p>
              <p className="text-muted-foreground text-xs">
                {r.emAberto > 0 ? `${r.emAberto} conta${r.emAberto === 1 ? "" : "s"} em aberto; próxima em ${r.proximoVencimento ? formatarDataCalendario(r.proximoVencimento) : "—"}` : "Nenhuma conta futura em aberto"}
                {" · "}
                <Link href={`/financeiro/pagar?aba=todas&recorrencia=${r.id}`} className="underline">
                  ver as contas
                </Link>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <span className="font-medium tabular-nums">{formatarMoeda(r.valorCentavos)}</span>
              {r.ativo ? (
                <>
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditando(r)} aria-label={`Editar a recorrência ${r.descricao}`}>
                    <Pencil aria-hidden /> Editar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEncerrando(r)} aria-label={`Encerrar a recorrência ${r.descricao}`}>
                    <Square aria-hidden /> Encerrar
                  </Button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {editando ? <DialogoDeEdicao key={editando.id} r={editando} opcoes={opcoes} aoFechar={() => setEditando(null)} /> : null}
      <ConfirmarAcao
        aberto={!!encerrando}
        aoFechar={() => setEncerrando(null)}
        titulo="Encerrar a recorrência?"
        descricao="Ela deixa de gerar contas e as contas futuras ainda em aberto e sem pagamento são canceladas. As que já venceram ou foram pagas ficam como estão."
        botao="Encerrar"
        pendente={pendente}
        aoConfirmar={encerrar}
      />
    </>
  );
}
