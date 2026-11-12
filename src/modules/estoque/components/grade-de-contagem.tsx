"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Campo, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarMoeda } from "@/lib/formatadores";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { SIGLA_UNIDADE } from "@/modules/produtos/schemas";

import { contarInicial } from "../actions/movimentos";
import type { ProdutoParaContagem } from "../queries";

type Valores = Record<string, { quantidade: string; custo: string }>;

/**
 * Grade da contagem inicial: uma linha por produto sem movimentos, com a quantidade contada e o custo (opcional). Nada vem
 * preenchido: o que não for contado fica de fora e custo vazio = "sem custo".
 */
export function GradeDeContagem({ produtos, hoje }: { produtos: ProdutoParaContagem[]; hoje: string }) {
  const router = useRouter();
  const [valores, setValores] = useState<Valores>({});
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<unknown>((fd) => contarInicial(null, fd), (r) => {
    if (r.ok) {
      toast.success(r.mensagem ?? "Contagem registrada.");
      setValores({});
      router.refresh();
    }
  });
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const contados = Object.values(valores).filter((v) => v.quantidade.trim() !== "").length;
  const linhas = JSON.stringify(produtos.map((p) => ({ produtoId: p.id, quantidade: valores[p.id]?.quantidade ?? "", custo: valores[p.id]?.custo ?? "" })));

  function mudar(id: string, campo: "quantidade" | "custo", valor: string) {
    setValores((v) => ({ ...v, [id]: { quantidade: v[id]?.quantidade ?? "", custo: v[id]?.custo ?? "", [campo]: valor } }));
  }

  return (
    <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
      <input type="hidden" name="linhas" value={linhas} />
      <div className="max-w-xs">
        <Campo id="cont-data" rotulo="Data da contagem" erro={erros.data} obrigatorio>
          <Input id="cont-data" name="data" type="date" required defaultValue={hoje} max={hoje} {...ariaDoCampo("cont-data", erros.data)} />
        </Campo>
      </div>

      <ul className="grid gap-2">
        {produtos.map((p) => (
          <li key={p.id} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_9rem_10rem] sm:items-end">
            <div className="grid gap-0.5">
              <span className="text-sm font-medium">{p.descricao}</span>
              <span className="text-muted-foreground text-xs">
                {p.codigo} · {p.custoUnitarioCentavos !== null ? `custo atual ${formatarMoeda(p.custoUnitarioCentavos)}` : "sem custo informado"}
              </span>
            </div>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Quantidade ({SIGLA_UNIDADE[p.unidade as keyof typeof SIGLA_UNIDADE] ?? p.unidade})</span>
              <Input inputMode="decimal" autoComplete="off" aria-label={`Quantidade contada de ${p.descricao}`} value={valores[p.id]?.quantidade ?? ""} onChange={(e) => mudar(p.id, "quantidade", e.target.value)} className="h-9" />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Custo unitário (opcional)</span>
              <Input inputMode="decimal" autoComplete="off" placeholder="R$" aria-label={`Custo unitário de ${p.descricao}`} value={valores[p.id]?.custo ?? ""} onChange={(e) => mudar(p.id, "custo", e.target.value)} className="h-9" />
            </label>
          </li>
        ))}
      </ul>

      {estado && !estado.ok ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.erro}
        </p>
      ) : null}
      <div className="bg-background sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t py-3">
        <p className="text-muted-foreground text-sm" role="status">
          {contados === 0 ? "Digite a quantidade dos produtos que você contou." : `${contados} produto${contados === 1 ? "" : "s"} para registrar.`}
        </p>
        <Button type="submit" disabled={pendente || contados === 0}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Registrar a contagem
        </Button>
      </div>
    </form>
  );
}
