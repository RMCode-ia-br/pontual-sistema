"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CampoMascarado } from "@/components/campo-mascarado";
import { AreaTexto, CaixaMarcacao, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { valorParaCentavos } from "@/lib/dominio/numeros";
import { sugerirPorte } from "@/lib/dominio/porte";
import { centavosParaCampo, mascararMoeda } from "@/lib/formatadores/mascaras";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { useProtecaoDeSaida } from "@/lib/hooks/usar-protecao-de-saida";
import { CampoCliente } from "@/modules/clientes/components/campo-cliente";
import { ORIGENS, ROTULO_ORIGEM } from "@/modules/clientes/schemas";

import { criarProjeto, editarProjeto } from "../actions/projetos";
import { listarEnderecosDoCliente, type EnderecoParaEscolha } from "../actions/consultas";
import {
  FASES_OBRA,
  INTERESSES,
  PORTES,
  ROTULO_FASE_OBRA,
  ROTULO_INTERESSE,
  ROTULO_PORTE,
  ROTULO_TEMPERATURA,
  ROTULO_TIPO_SERVICO,
  TEMPERATURAS,
  TIPOS_SERVICO,
} from "../schemas";

export type ProjetoParaForm = {
  id: string;
  codigo: string;
  titulo: string;
  cliente: { id: string; nome: string };
  enderecoObraId: string | null;
  arquiteto: { id: string; nome: string } | null;
  construtora: { id: string; nome: string } | null;
  responsavelId: string | null;
  tiposServico: string[];
  origem: string | null;
  origemDetalhe: string | null;
  porte: string | null;
  interesse: string;
  temperatura: string | null;
  faseDaObra: string | null;
  investimentoPrevistoCentavos: number | null;
  valorEstimadoCentavos: number | null;
  prazoDesejado: string | null;
  observacoes: string | null;
};

type Props = {
  projeto?: ProjetoParaForm;
  usuarios: { id: string; nome: string }[];
  usuarioAtualId: string;
  /** Cliente já escolhido (vindo da ficha do cliente). */
  clienteInicial?: { id: string; nome: string } | null;
  /** Faixas de porte configuradas: só para sugerir (nunca preenche sozinho). */
  faixasDePorte?: { medioMinimoCentavos: number | null; grandeMinimoCentavos: number | null };
};

export function FormProjeto({ projeto, usuarios, usuarioAtualId, clienteInicial = null, faixasDePorte }: Props) {
  const router = useRouter();
  const editando = !!projeto;
  const [sujo, setSujo] = useState(false);
  const [clienteId, setClienteId] = useState<string>(projeto?.cliente.id ?? clienteInicial?.id ?? "");
  const [enderecos, setEnderecos] = useState<EnderecoParaEscolha[]>([]);
  const [valorEstimado, setValorEstimado] = useState(centavosParaCampo(projeto?.valorEstimadoCentavos));
  const [porte, setPorte] = useState(projeto?.porte ?? "");
  useProtecaoDeSaida(sujo);

  // Os endereços de obra são os do cliente escolhido.
  useEffect(() => {
    if (!clienteId) return;
    let cancelado = false;
    void listarEnderecosDoCliente(clienteId).then((r) => {
      if (!cancelado) setEnderecos(r.ok && r.dados ? r.dados : []);
    });
    return () => {
      cancelado = true;
    };
  }, [clienteId]);

  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<{ id: string }>(
    (formData) => (editando ? editarProjeto(null, formData) : criarProjeto(null, formData)),
    (r) => {
      if (r.ok && r.dados) {
        setSujo(false);
        toast.success(r.mensagem ?? "Salvo.");
        setTimeout(() => router.push(`/projetos/${r.dados!.id}`), 0);
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const enderecosDoCliente = clienteId ? enderecos : [];
  // Sugestão só existe se o gestor configurou as faixas (nunca inventadas) e aparece apenas como dica.
  const centavosEstimados = valorEstimado ? valorParaCentavos(valorEstimado) : null;
  const porteSugerido = faixasDePorte ? sugerirPorte(centavosEstimados, faixasDePorte) : null;

  return (
    <form
      onSubmit={aoEnviar}
      onChange={(e) => {
        setSujo(true);
        const alvo: EventTarget = e.target;
        if (alvo instanceof HTMLInputElement && alvo.name === "valorEstimado") setValorEstimado(alvo.value);
      }}
      className="grid gap-5"
    >
      {projeto ? <input type="hidden" name="id" value={projeto.id} /> : null}

      <section aria-labelledby="sec-projeto" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-projeto" className="font-medium sm:col-span-2">
          Projeto
        </h2>
        <Campo id="titulo" rotulo="Título" erro={erros.titulo} obrigatorio className="sm:col-span-2" dica="Como vocês chamam essa obra. Ex.: Casa Búzios — esquadrias e boxes.">
          <Input id="titulo" name="titulo" required maxLength={160} defaultValue={projeto?.titulo ?? ""} autoFocus={!editando} autoComplete="off" {...ariaDoCampo("titulo", erros.titulo)} />
        </Campo>

        <Campo id="clienteId" rotulo="Cliente" erro={erros.clienteId} obrigatorio className="sm:col-span-2">
          {editando ? (
            <>
              <input type="hidden" name="clienteId" value={projeto.cliente.id} />
              <span id="clienteId" className="bg-muted flex min-h-9 items-center rounded-lg px-3 text-sm">
                {projeto.cliente.nome}
              </span>
            </>
          ) : (
            <CampoCliente id="clienteId" name="clienteId" inicial={clienteInicial} aoMudar={(c) => setClienteId(c?.id ?? "")} />
          )}
        </Campo>

        <Campo id="enderecoObraId" rotulo="Endereço da obra" erro={erros.enderecoObraId} dica={clienteId && enderecosDoCliente.length === 0 ? "Esse cliente ainda não tem endereço cadastrado. Cadastre na ficha do cliente." : undefined}>
          <Selecao id="enderecoObraId" name="enderecoObraId" defaultValue={projeto?.enderecoObraId ?? ""} disabled={!clienteId} {...ariaDoCampo("enderecoObraId", erros.enderecoObraId)}>
            <option value="">{clienteId ? "Não informado" : "Escolha o cliente primeiro"}</option>
            {enderecosDoCliente.map((e) => (
              <option key={e.id} value={e.id}>
                {e.rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>

        <Campo id="responsavelId" rotulo="Responsável" erro={erros.responsavelId}>
          <Selecao id="responsavelId" name="responsavelId" defaultValue={projeto?.responsavelId ?? usuarioAtualId} {...ariaDoCampo("responsavelId", erros.responsavelId)}>
            <option value="">Sem responsável</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Selecao>
        </Campo>

        <fieldset className="grid gap-1 sm:col-span-2">
          <legend className="text-sm font-medium">O que o cliente quer</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {TIPOS_SERVICO.map((t) => (
              <CaixaMarcacao key={t} id={`servico_${t}`} name={`servico_${t}`} rotulo={ROTULO_TIPO_SERVICO[t]} defaultChecked={projeto?.tiposServico.includes(t)} />
            ))}
          </div>
        </fieldset>
      </section>

      <section aria-labelledby="sec-qualificacao" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-qualificacao" className="font-medium sm:col-span-2">
          Qualificação
        </h2>
        <Campo id="origem" rotulo="Origem" erro={erros.origem} dica={editando ? undefined : "Vazio = a origem do cadastro do cliente."}>
          <Selecao id="origem" name="origem" defaultValue={projeto?.origem ?? ""} {...ariaDoCampo("origem", erros.origem)}>
            <option value="">Não informada</option>
            {ORIGENS.map((o) => (
              <option key={o} value={o}>
                {ROTULO_ORIGEM[o]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="origemDetalhe" rotulo="Detalhe da origem (opcional)" erro={erros.origemDetalhe}>
          <Input id="origemDetalhe" name="origemDetalhe" maxLength={160} defaultValue={projeto?.origemDetalhe ?? ""} autoComplete="off" {...ariaDoCampo("origemDetalhe", erros.origemDetalhe)} />
        </Campo>
        <Campo id="interesse" rotulo="Interesse" erro={erros.interesse} obrigatorio>
          <Selecao id="interesse" name="interesse" defaultValue={projeto?.interesse ?? "INDEFINIDO"} {...ariaDoCampo("interesse", erros.interesse)}>
            {INTERESSES.map((i) => (
              <option key={i} value={i}>
                {ROTULO_INTERESSE[i]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="temperatura" rotulo="Temperatura" erro={erros.temperatura}>
          <Selecao id="temperatura" name="temperatura" defaultValue={projeto?.temperatura ?? ""} {...ariaDoCampo("temperatura", erros.temperatura)}>
            <option value="">Não definida</option>
            {TEMPERATURAS.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TEMPERATURA[t]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo
          id="porte"
          rotulo="Porte"
          erro={erros.porte}
          dica={porteSugerido && porteSugerido !== porte ? `Pelo valor estimado, o sistema sugere: ${ROTULO_PORTE[porteSugerido]}.` : undefined}
        >
          <Selecao id="porte" name="porte" value={porte} onChange={(e) => setPorte(e.target.value)} {...ariaDoCampo("porte", erros.porte)}>
            <option value="">Não definido</option>
            {PORTES.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PORTE[p]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="faseDaObra" rotulo="Fase da obra do cliente" erro={erros.faseDaObra}>
          <Selecao id="faseDaObra" name="faseDaObra" defaultValue={projeto?.faseDaObra ?? ""} {...ariaDoCampo("faseDaObra", erros.faseDaObra)}>
            <option value="">Não informada</option>
            {FASES_OBRA.map((f) => (
              <option key={f} value={f}>
                {ROTULO_FASE_OBRA[f]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="arquitetoId" rotulo="Arquiteto/designer (opcional)" erro={erros.arquitetoId}>
          <CampoCliente id="arquitetoId" name="arquitetoId" inicial={projeto?.arquiteto ?? null} aoMudar={() => setSujo(true)} />
        </Campo>
        <Campo id="construtoraId" rotulo="Construtora (opcional)" erro={erros.construtoraId}>
          <CampoCliente id="construtoraId" name="construtoraId" inicial={projeto?.construtora ?? null} aoMudar={() => setSujo(true)} />
        </Campo>
      </section>

      <section aria-labelledby="sec-valores" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-valores" className="font-medium sm:col-span-2">
          Valores e prazo
        </h2>
        <Campo id="investimentoPrevisto" rotulo="Investimento previsto pelo cliente (opcional)" erro={erros.investimentoPrevistoCentavos} dica="O quanto o cliente disse que pretende gastar.">
          <CampoMascarado id="investimentoPrevisto" name="investimentoPrevisto" mascara={mascararMoeda} defaultValue={centavosParaCampo(projeto?.investimentoPrevistoCentavos)} inputMode="numeric" autoComplete="off" placeholder="0,00" {...ariaDoCampo("investimentoPrevisto", erros.investimentoPrevistoCentavos)} />
        </Campo>
        <Campo id="valorEstimado" rotulo="Valor estimado do projeto (opcional)" erro={erros.valorEstimadoCentavos} dica="Sua estimativa, só para o funil. O valor da proposta é calculado nela.">
          <CampoMascarado id="valorEstimado" name="valorEstimado" mascara={mascararMoeda} defaultValue={centavosParaCampo(projeto?.valorEstimadoCentavos)} inputMode="numeric" autoComplete="off" placeholder="0,00" {...ariaDoCampo("valorEstimado", erros.valorEstimadoCentavos)} />
        </Campo>
        <Campo id="prazoDesejado" rotulo="Prazo desejado pelo cliente (opcional)" erro={erros.prazoDesejado} className="sm:col-span-2">
          <Input id="prazoDesejado" name="prazoDesejado" maxLength={120} defaultValue={projeto?.prazoDesejado ?? ""} autoComplete="off" placeholder="Ex.: até março, antes da mudança" {...ariaDoCampo("prazoDesejado", erros.prazoDesejado)} />
        </Campo>
        <Campo id="observacoes" rotulo="Observações (opcional)" erro={erros.observacoes} className="sm:col-span-2">
          <AreaTexto id="observacoes" name="observacoes" maxLength={4000} rows={4} defaultValue={projeto?.observacoes ?? ""} {...ariaDoCampo("observacoes", erros.observacoes)} />
        </Campo>
      </section>

      {estado && !estado.ok && Object.keys(erros).length === 0 ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.erro}
        </p>
      ) : null}

      <div className="bg-background/95 sticky bottom-14 z-10 -mx-1 flex flex-wrap gap-2 border-t px-1 py-3 backdrop-blur md:bottom-0">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {editando ? "Salvar alterações" : "Criar projeto"}
        </Button>
        <Link href={editando ? `/projetos/${projeto.id}` : "/projetos"} className="inline-flex h-8 items-center px-3 text-sm hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
