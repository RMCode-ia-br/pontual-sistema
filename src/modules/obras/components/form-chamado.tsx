"use client";

import { Loader2, ShieldCheck, ShieldX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AreaTexto, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { ROTULO_TIPO_PROBLEMA, TIPOS_DE_PROBLEMA, type TipoDoProblema } from "@/lib/dominio/chamados";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { useProtecaoDeSaida } from "@/lib/hooks/usar-protecao-de-saida";
import { CampoCliente } from "@/modules/clientes/components/campo-cliente";

import { criarChamado, listarObrasDoClienteParaChamado, preverClassificacao } from "../actions/chamados";

type Props = {
  clienteInicial?: { id: string; nome: string } | null;
  obraInicial?: string;
};

type Previa = { chave: string; classificacao: "EM_GARANTIA" | "FORA_DA_GARANTIA"; motivo: string };

/** Abre um chamado de assistência. A classificação mostrada aqui é só uma prévia: o servidor recalcula ao gravar. */
export function FormChamado({ clienteInicial = null, obraInicial }: Props) {
  const router = useRouter();
  const [sujo, setSujo] = useState(false);
  useProtecaoDeSaida(sujo);

  const [clienteId, setClienteId] = useState(clienteInicial?.id ?? "");
  const [obras, setObras] = useState<{ clienteId: string; lista: { id: string; rotulo: string }[] } | null>(null);
  const [projetoId, setProjetoId] = useState(obraInicial ?? "");
  const [tipo, setTipo] = useState<TipoDoProblema>("REGULAGEM");
  const [previa, setPrevia] = useState<Previa | null>(null);

  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<{ id: string }>(
    (formData) => criarChamado(null, formData),
    (r) => {
      if (r.ok && r.dados) {
        setSujo(false);
        toast.success(r.mensagem ?? "Chamado aberto.");
        setTimeout(() => router.push(`/obras/assistencia/${r.dados!.id}`), 0);
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};

  // As obras oferecidas são as do cliente escolhido.
  useEffect(() => {
    if (!clienteId) return;
    let cancelado = false;
    void listarObrasDoClienteParaChamado(clienteId).then((r) => {
      if (cancelado) return;
      const lista = r.ok && r.dados ? r.dados : [];
      setObras({ clienteId, lista });
      setProjetoId((atual) => (lista.some((o) => o.id === atual) ? atual : ""));
    });
    return () => {
      cancelado = true;
    };
  }, [clienteId]);
  const listaDeObras = obras?.clienteId === clienteId ? obras.lista : [];

  // Prévia da classificação (não grava nada).
  const chave = `${projetoId}|${tipo}`;
  useEffect(() => {
    let cancelado = false;
    void preverClassificacao({ projetoId: projetoId || undefined, tipoProblema: tipo }).then((r) => {
      if (!cancelado && r.ok && r.dados) setPrevia({ chave, ...r.dados });
    });
    return () => {
      cancelado = true;
    };
  }, [projetoId, tipo, chave]);
  const previaAtual = previa?.chave === chave ? previa : null;

  return (
    <form onSubmit={aoEnviar} onChange={() => setSujo(true)} className="grid gap-5">
      <section aria-labelledby="sec-chamado" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-chamado" className="font-medium sm:col-span-2">
          Chamado
        </h2>
        <Campo id="clienteId" rotulo="Cliente" erro={erros.clienteId} obrigatorio className="sm:col-span-2">
          <CampoCliente
            id="clienteId"
            name="clienteId"
            inicial={clienteInicial}
            aoMudar={(c) => {
              setSujo(true);
              setClienteId(c?.id ?? "");
              setProjetoId("");
            }}
          />
        </Campo>
        <Campo id="projetoId" rotulo="Obra (opcional)" erro={erros.projetoId} dica={clienteId && listaDeObras.length === 0 ? "Esse cliente não tem obra aprovada: o chamado fica sem garantia a conferir." : "Sem obra, não há como conferir a garantia."}>
          <Selecao id="projetoId" name="projetoId" value={projetoId} onChange={(e) => setProjetoId(e.target.value)} disabled={!clienteId} {...ariaDoCampo("projetoId", erros.projetoId)}>
            <option value="">{clienteId ? "Nenhuma obra" : "Escolha o cliente"}</option>
            {listaDeObras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="tipoProblema" rotulo="Tipo do problema" erro={erros.tipoProblema} obrigatorio>
          <Selecao id="tipoProblema" name="tipoProblema" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDoProblema)} {...ariaDoCampo("tipoProblema", erros.tipoProblema)}>
            {TIPOS_DE_PROBLEMA.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_PROBLEMA[t]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="descricao" rotulo="O que aconteceu" erro={erros.descricao} obrigatorio className="sm:col-span-2">
          <AreaTexto id="descricao" name="descricao" required minLength={3} maxLength={2000} rows={4} {...ariaDoCampo("descricao", erros.descricao)} />
        </Campo>
      </section>

      <section aria-label="Garantia" aria-live="polite" className="rounded-xl border p-4 text-sm">
        {previaAtual ? (
          <div className="flex items-start gap-2">
            {previaAtual.classificacao === "EM_GARANTIA" ? <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" aria-hidden /> : <ShieldX className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />}
            <p>
              <strong>{previaAtual.classificacao === "EM_GARANTIA" ? "Em garantia" : "Fora da garantia"}.</strong> {previaAtual.motivo}
              <span className="text-muted-foreground block">É uma sugestão: depois de aberto, você pode ajustar a classificação e decidir se cobra a visita.</span>
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">Calculando a garantia…</p>
        )}
      </section>

      {estado && !estado.ok && Object.keys(erros).length === 0 ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.erro}
        </p>
      ) : null}

      <div className="bg-background/95 sticky bottom-14 z-10 -mx-1 flex flex-wrap gap-2 border-t px-1 py-3 backdrop-blur md:bottom-0">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Abrir chamado
        </Button>
        <Link href="/obras/assistencia" className="inline-flex h-8 items-center px-3 text-sm hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
