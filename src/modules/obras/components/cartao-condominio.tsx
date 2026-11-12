"use client";

import { Building2, CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatarTelefone } from "@/lib/formatadores";

import { aprovarFachadaDoCondominio } from "../actions/obra";

type Props = {
  projetoId: string;
  condominio: { nome: string | null; exigeAprovacaoFachada: boolean; fachadaAprovada: boolean; horariosPermitidos: string | null; sindicoNome: string | null; sindicoTelefone: string | null };
  concluida: boolean;
};

/** Dados do condomínio da obra e a confirmação da aprovação da fachada (ela vale antes de instalar). */
export function CartaoCondominio({ projetoId, condominio: c, concluida }: Props) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const pendenteDeAprovacao = c.exigeAprovacaoFachada && !c.fachadaAprovada;

  function marcar() {
    iniciar(async () => {
      const r = await aprovarFachadaDoCondominio({ projetoId });
      if (r.ok) {
        toast.success(r.mensagem ?? "Registrado.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  return (
    <section className="grid content-start gap-3 rounded-xl border p-4" aria-labelledby="titulo-condominio">
      <h2 id="titulo-condominio" className="flex items-center gap-2 font-medium">
        <Building2 className="size-4" aria-hidden /> Condomínio{c.nome ? `: ${c.nome}` : ""}
      </h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground text-xs">Aprovação da fachada</dt>
          <dd className="flex items-center gap-1.5">
            {!c.exigeAprovacaoFachada ? (
              "Não exigida"
            ) : c.fachadaAprovada ? (
              <>
                <CheckCircle2 className="size-4 text-emerald-700 dark:text-emerald-400" aria-hidden /> Aprovada
              </>
            ) : (
              <strong className="text-destructive">Pendente</strong>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Horários permitidos para a obra</dt>
          <dd>{c.horariosPermitidos ?? <span className="text-muted-foreground">Não informado</span>}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Síndico</dt>
          <dd>{c.sindicoNome ?? <span className="text-muted-foreground">Não informado</span>}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Telefone do síndico</dt>
          <dd>{c.sindicoTelefone ? formatarTelefone(c.sindicoTelefone) : <span className="text-muted-foreground">Não informado</span>}</dd>
        </div>
      </dl>
      {pendenteDeAprovacao && !concluida ? (
        <div>
          <Button type="button" size="sm" onClick={marcar} disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />} Marcar fachada aprovada
          </Button>
        </div>
      ) : null}
    </section>
  );
}
