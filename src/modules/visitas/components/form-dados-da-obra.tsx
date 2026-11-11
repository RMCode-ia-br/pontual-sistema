"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CampoMascarado } from "@/components/campo-mascarado";
import { CaixaMarcacao, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { centavosParaCampo, mascararMoeda, mascararTelefone } from "@/lib/formatadores/mascaras";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { CampoCliente } from "@/modules/clientes/components/campo-cliente";
import { FASES_OBRA, ROTULO_FASE_OBRA } from "@/modules/projetos/schemas";

import { salvarDadosDaObra } from "../actions";

export type DadosDaObraParaForm = {
  projetoId: string;
  eventoId: string;
  faseDaObra: string | null;
  arquiteto: { id: string; nome: string } | null;
  prazoDesejado: string | null;
  investimentoPrevistoCentavos: number | null;
  /** Sem endereço da obra no projeto, o condomínio não tem onde ser guardado. */
  temEndereco: boolean;
  condominio: boolean;
  condominioNome: string | null;
  exigeAprovacaoFachada: boolean;
  fachadaAprovada: boolean;
  horariosPermitidos: string | null;
  sindicoNome: string | null;
  sindicoTelefone: string | null;
};

/** Dados da obra levantados na visita (R9): fase, arquiteto, prazo, investimento e condomínio. */
export function FormDadosDaObra({ dados }: { dados: DadosDaObraParaForm }) {
  const router = useRouter();
  const [condominio, setCondominio] = useState(dados.condominio);
  const [exige, setExige] = useState(dados.exigeAprovacaoFachada);

  const { estado, pendente, aoEnviar } = useAcaoDeFormulario(
    (formData) => salvarDadosDaObra(null, formData),
    (r) => {
      if (r.ok) {
        toast.success(r.mensagem ?? "Salvo.");
        router.refresh();
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};

  return (
    <form onSubmit={aoEnviar} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2" aria-label="Dados da obra">
      <input type="hidden" name="projetoId" value={dados.projetoId} />
      <input type="hidden" name="eventoId" value={dados.eventoId} />

      <Campo id="faseDaObra" rotulo="Fase da obra" erro={erros.faseDaObra}>
        <Selecao id="faseDaObra" name="faseDaObra" defaultValue={dados.faseDaObra ?? ""} className="h-11 text-base" {...ariaDoCampo("faseDaObra", erros.faseDaObra)}>
          <option value="">Não informada</option>
          {FASES_OBRA.map((f) => (
            <option key={f} value={f}>
              {ROTULO_FASE_OBRA[f]}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo id="arquitetoId" rotulo="Arquiteto envolvido" erro={erros.arquitetoId}>
        <CampoCliente id="arquitetoId" name="arquitetoId" inicial={dados.arquiteto} />
      </Campo>
      <Campo id="prazoDesejado" rotulo="Prazo desejado" erro={erros.prazoDesejado}>
        <Input id="prazoDesejado" name="prazoDesejado" maxLength={120} defaultValue={dados.prazoDesejado ?? ""} autoComplete="off" className="h-11 text-base" {...ariaDoCampo("prazoDesejado", erros.prazoDesejado)} />
      </Campo>
      <Campo id="investimentoPrevistoCentavos" rotulo="Investimento previsto (R$)" erro={erros.investimentoPrevistoCentavos}>
        <CampoMascarado id="investimentoPrevistoCentavos" name="investimentoPrevistoCentavos" mascara={mascararMoeda} defaultValue={centavosParaCampo(dados.investimentoPrevistoCentavos)} inputMode="numeric" autoComplete="off" placeholder="0,00" className="h-11 text-base" {...ariaDoCampo("investimentoPrevistoCentavos", erros.investimentoPrevistoCentavos)} />
      </Campo>

      <fieldset className="grid gap-3 sm:col-span-2" disabled={!dados.temEndereco}>
        <legend className="text-sm font-medium">Condomínio</legend>
        {!dados.temEndereco ? <p className="text-muted-foreground text-xs">Escolha o endereço da obra no projeto para registrar o condomínio.</p> : null}
        <CaixaMarcacao id="condominio" name="condominio" rotulo="A obra é em condomínio" checked={condominio} onChange={(e) => setCondominio(e.target.checked)} />
        {condominio ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="condominioNome" rotulo="Nome do condomínio" erro={erros.condominioNome}>
              <Input id="condominioNome" name="condominioNome" maxLength={160} defaultValue={dados.condominioNome ?? ""} autoComplete="off" className="h-11 text-base" />
            </Campo>
            <Campo id="horariosPermitidos" rotulo="Horários permitidos para obra" erro={erros.horariosPermitidos}>
              <Input id="horariosPermitidos" name="horariosPermitidos" maxLength={200} defaultValue={dados.horariosPermitidos ?? ""} placeholder="Ex.: seg a sex, 8h às 17h" autoComplete="off" className="h-11 text-base" />
            </Campo>
            <div className="flex flex-wrap gap-x-5 sm:col-span-2">
              <CaixaMarcacao id="exigeAprovacaoFachada" name="exigeAprovacaoFachada" rotulo="Exige aprovação da fachada" checked={exige} onChange={(e) => setExige(e.target.checked)} />
              {exige ? <CaixaMarcacao id="fachadaAprovada" name="fachadaAprovada" rotulo="Fachada já aprovada" defaultChecked={dados.fachadaAprovada} /> : null}
            </div>
            <Campo id="sindicoNome" rotulo="Síndico" erro={erros.sindicoNome}>
              <Input id="sindicoNome" name="sindicoNome" maxLength={160} defaultValue={dados.sindicoNome ?? ""} autoComplete="off" className="h-11 text-base" />
            </Campo>
            <Campo id="sindicoTelefone" rotulo="Telefone do síndico" erro={erros.sindicoTelefone}>
              <CampoMascarado id="sindicoTelefone" name="sindicoTelefone" type="tel" mascara={mascararTelefone} defaultValue={dados.sindicoTelefone ?? ""} inputMode="tel" autoComplete="off" placeholder="(22) 99999-9999" className="h-11 text-base" {...ariaDoCampo("sindicoTelefone", erros.sindicoTelefone)} />
            </Campo>
          </div>
        ) : null}
      </fieldset>

      {estado && !estado.ok && Object.keys(erros).length === 0 ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {estado.erro}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" disabled={pendente} className="h-11 w-full sm:w-auto">
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Salvar dados da obra
        </Button>
      </div>
    </form>
  );
}
