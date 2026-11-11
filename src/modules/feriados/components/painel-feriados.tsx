"use client";

import { CalendarOff, Loader2, Plus, Power, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import type { ResultadoAcao } from "@/lib/acoes";
import { formatarDataCalendario } from "@/lib/formatadores";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { cn } from "@/lib/utils";

import { alternarAtivoFeriado, criarFeriado, excluirFeriado } from "../actions/feriados";
import { TIPOS_FERIADO, type TipoFeriadoChave } from "../schemas";

type Item = { id: string; data: string; dataFim: string | null; nome: string; tipo: TipoFeriadoChave; ativo: boolean };

function FormNovo() {
  const [versao, setVersao] = useState(0);
  const [tipo, setTipo] = useState<TipoFeriadoChave>("FERIADO");
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario(
    (formData) => criarFeriado(null, formData),
    (r) => {
      if (r.ok) {
        toast.success(r.mensagem ?? "Adicionado.");
        setVersao((v) => v + 1);
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};

  return (
    <form key={versao} onSubmit={aoEnviar} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Campo id="data" rotulo={tipo === "FERIAS_COLETIVA_FORNECEDORES" ? "Início" : "Data"} erro={erros.data} obrigatorio>
        <Input id="data" name="data" type="date" required {...ariaDoCampo("data", erros.data)} />
      </Campo>
      <Campo id="nome" rotulo="Nome" erro={erros.nome} obrigatorio>
        <Input id="nome" name="nome" required maxLength={100} autoComplete="off" placeholder="Ex.: feriado municipal" {...ariaDoCampo("nome", erros.nome)} />
      </Campo>
      <Campo id="tipo" rotulo="Tipo" erro={erros.tipo}>
        <Selecao id="tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoFeriadoChave)} {...ariaDoCampo("tipo", erros.tipo)}>
          {Object.entries(TIPOS_FERIADO).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </Selecao>
      </Campo>
      {tipo === "FERIAS_COLETIVA_FORNECEDORES" ? (
        <Campo id="dataFim" rotulo="Fim do período" erro={erros.dataFim}>
          <Input id="dataFim" name="dataFim" type="date" {...ariaDoCampo("dataFim", erros.dataFim)} />
        </Campo>
      ) : null}
      <div className="flex items-end sm:col-span-2 lg:col-span-4">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Adicionar
        </Button>
      </div>
      {estado && !estado.ok && Object.keys(erros).length === 0 ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2 lg:col-span-4">
          {estado.erro}
        </p>
      ) : null}
    </form>
  );
}

export function PainelFeriados({ itens, ano, anos }: { itens: Item[]; ano: number; anos: number[] }) {
  const [excluindo, setExcluindo] = useState<Item | null>(null);
  const [pendente, iniciar] = useTransition();

  function rodar(fn: () => Promise<ResultadoAcao>, depois?: () => void) {
    iniciar(async () => {
      const r = await fn();
      depois?.();
      if (r.ok) {
        if (r.mensagem) toast.success(r.mensagem);
      } else toast.error(r.erro);
    });
  }

  const listaDeAnos = Array.from(new Set([...anos, ano])).sort();

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        Só <strong>feriados</strong> descontam dias úteis nos prazos. Férias coletivas e “outros” aparecem como faixa na agenda e avisam ao
        programar compras e prazos. Os feriados municipais de Macaé devem ser cadastrados aqui.
      </p>
      <FormNovo />

      <nav aria-label="Ano" className="flex flex-wrap gap-2">
        {listaDeAnos.map((a) => (
          <Link
            key={a}
            href={`/configuracoes/feriados?ano=${a}`}
            aria-current={a === ano ? "page" : undefined}
            className={cn("inline-flex min-h-9 items-center rounded-full border px-3 text-sm", a === ano ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")}
          >
            {a}
          </Link>
        ))}
      </nav>

      {itens.length === 0 ? (
        <EstadoVazio
          icone={CalendarOff}
          titulo={`Nada cadastrado em ${ano}`}
          descricao="Adicione os feriados municipais e as férias coletivas dos fornecedores para o sistema avisar nos prazos."
        />
      ) : (
        <ul className="divide-y rounded-xl border">
          {itens.map((f) => (
            <li key={f.id} className={cn("flex items-center gap-3 p-3", !f.ativo && "opacity-60")}>
              <p className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm font-medium">
                <span className="tabular-nums">
                  {formatarDataCalendario(f.data)}
                  {f.dataFim ? ` a ${formatarDataCalendario(f.dataFim)}` : ""}
                </span>
                {f.nome}
                {f.tipo !== "FERIADO" ? <Badge variant="secondary">{f.tipo === "OUTRO" ? "Aviso" : "Férias coletivas"}</Badge> : null}
                {!f.ativo ? <Badge variant="outline">Inativo</Badge> : null}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={pendente}
                onClick={() => rodar(() => alternarAtivoFeriado(f.id, !f.ativo))}
                aria-label={f.ativo ? `Desativar ${f.nome}` : `Ativar ${f.nome}`}
                aria-pressed={f.ativo}
              >
                <Power aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => setExcluindo(f)} aria-label={`Remover ${f.nome}`}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!excluindo} onOpenChange={(a) => !a && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{excluindo?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>Os prazos passam a ser calculados sem esta data. A remoção fica registrada na auditoria.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendente}
              onClick={(e) => {
                e.preventDefault();
                const alvo = excluindo;
                if (alvo) rodar(() => excluirFeriado(alvo.id), () => setExcluindo(null));
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
