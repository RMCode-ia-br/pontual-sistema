"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  RotateCcw,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { AreaTexto, Campo, ariaDoCampo } from "@/components/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ROTULO_TIPO_DE_MOVIMENTO,
  formatarQuantidade,
} from "@/lib/dominio/estoque";
import { formatarDataCalendario, formatarMoeda } from "@/lib/formatadores";
import { SIGLA_UNIDADE } from "@/modules/produtos/schemas";

import { estornarMovimento } from "../actions/movimentos";
import type { MovimentoDaLista } from "../queries";

const sigla = (u: string) =>
  u in SIGLA_UNIDADE
    ? SIGLA_UNIDADE[u as keyof typeof SIGLA_UNIDADE]
    : u.toLowerCase();

function DialogoDeEstorno({
  movimento,
  aoFechar,
}: {
  movimento: MovimentoDaLista;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<{
    geral?: string;
    campos?: Record<string, string>;
  }>({});
  const [pendente, iniciar] = useTransition();
  const campos = erro.campos ?? {};
  return (
    <Dialog open onOpenChange={(a) => !a && !pendente && aoFechar()}>
      <DialogContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setErro({});
            iniciar(async () => {
              const r = await estornarMovimento({
                movimentoId: movimento.id,
                motivo,
              });
              if (r.ok) {
                toast.success(r.mensagem ?? "Movimento estornado.");
                aoFechar();
                router.refresh();
              } else setErro({ geral: r.erro, campos: r.campos });
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Estornar o movimento?</DialogTitle>
            <DialogDescription>
              {ROTULO_TIPO_DE_MOVIMENTO[movimento.tipo]} de{" "}
              {formatarQuantidade(Math.abs(movimento.quantidadeMilesimos))}{" "}
              {sigla(movimento.unidade)} de “{movimento.produto}”. Nada é
              apagado: o sistema cria o movimento contrário, com o motivo, e o
              saldo volta.
            </DialogDescription>
          </DialogHeader>
          <Campo
            id="est-motivo"
            rotulo="Motivo"
            erro={campos.motivo}
            obrigatorio
          >
            <AreaTexto
              id="est-motivo"
              rows={2}
              maxLength={300}
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              {...ariaDoCampo("est-motivo", campos.motivo)}
            />
          </Campo>
          {erro.geral && Object.keys(campos).length === 0 ? (
            <p role="alert" className="text-destructive text-sm">
              {erro.geral}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={aoFechar}
              disabled={pendente}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={pendente}>
              {pendente ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : null}{" "}
              Estornar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Movimentos de estoque (lista em cartões, serve no celular e no computador). Cada linha mostra o tipo, a quantidade com sinal,
 * o custo congelado (ou "sem custo"), a obra e, quando cabe, o botão de estornar.
 */
export function ListaDeMovimentos({
  movimentos,
  mostrarProduto = true,
}: {
  movimentos: MovimentoDaLista[];
  mostrarProduto?: boolean;
}) {
  const [estornando, setEstornando] = useState<MovimentoDaLista | null>(null);
  return (
    <>
      <ul className="grid gap-2">
        {movimentos.map((m) => {
          const entrada = m.quantidadeMilesimos > 0;
          const podeEstornar = !m.ehEstorno && !m.estornado && !m.deRecebimento;
          return (
            <li
              key={m.id}
              className={`grid gap-1 rounded-xl border p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4 ${m.estornado ? "opacity-60" : ""}`}
            >
              <div className="grid gap-0.5">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {entrada ? (
                    <ArrowDownToLine
                      className="size-4 text-emerald-600"
                      aria-hidden
                    />
                  ) : (
                    <ArrowUpFromLine
                      className="size-4 text-amber-600"
                      aria-hidden
                    />
                  )}
                  {ROTULO_TIPO_DE_MOVIMENTO[m.tipo]}
                  {m.ehEstorno ? (
                    <Badge variant="outline">
                      <Undo2 aria-hidden /> Estorno
                    </Badge>
                  ) : null}
                  {m.estornado ? (
                    <Badge variant="secondary">Estornado</Badge>
                  ) : null}
                  {m.semSaldoConfirmado ? (
                    <Badge variant="destructive">Sem saldo (confirmado)</Badge>
                  ) : null}
                </p>
                <p className="text-muted-foreground text-xs">
                  {formatarDataCalendario(m.data)}
                  {mostrarProduto ? (
                    <>
                      {" · "}
                      <Link
                        href={`/produtos/${m.produtoId}`}
                        className="hover:underline"
                      >
                        {m.codigo} {m.produto}
                      </Link>
                    </>
                  ) : null}
                  {m.obra ? (
                    <>
                      {" · "}
                      <Link
                        href={`/obras/${m.projetoId}`}
                        className="hover:underline"
                      >
                        {m.obra}
                      </Link>
                    </>
                  ) : null}
                  {m.justificativa ? ` · ${m.justificativa}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <span className="font-medium tabular-nums">
                  {entrada ? "+" : "−"}
                  {formatarQuantidade(Math.abs(m.quantidadeMilesimos))}{" "}
                  {sigla(m.unidade)}
                </span>
                {m.custoUnitarioCentavos !== null ? (
                  <span className="text-muted-foreground text-xs">
                    a {formatarMoeda(m.custoUnitarioCentavos)}
                  </span>
                ) : (
                  <Badge variant="outline">Sem custo</Badge>
                )}
                {podeEstornar ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEstornando(m)}
                  >
                    <RotateCcw aria-hidden /> Estornar
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {estornando ? (
        <DialogoDeEstorno
          movimento={estornando}
          aoFechar={() => setEstornando(null)}
        />
      ) : null}
    </>
  );
}
