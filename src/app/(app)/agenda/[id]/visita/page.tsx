import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { formatarDataHora } from "@/lib/formatadores";
import { Anexos } from "@/modules/anexos/components/anexos";
import { listarAnexos } from "@/modules/anexos/queries";
import { obterEvento } from "@/modules/agenda/queries";
import { FormDadosDaObra } from "@/modules/visitas/components/form-dados-da-obra";
import { FormMedida, SugestoesDeTipologia } from "@/modules/visitas/components/form-medida";
import { listarMedidasDoProjeto, obterDadosDaObra } from "@/modules/visitas/queries";

export const metadata: Metadata = { title: "Visita" };

/** Tela de visita para o celular: medidas-rascunho com foto por vão, dados da obra e condomínio (R9). */
export default async function PaginaVisita({ params }: { params: Promise<{ id: string }> }) {
  await exigirSessao();
  const { id } = await params;
  const evento = await obterEvento(id);
  if (!evento || !evento.projetoId) notFound();

  const [dados, medidas, fotosDaVisita] = await Promise.all([obterDadosDaObra(evento.projetoId), listarMedidasDoProjeto(evento.projetoId), listarAnexos("EventoAgenda", evento.id)]);
  if (!dados) notFound();
  const fotos = await Promise.all(medidas.map((m) => listarAnexos("MedidaRascunho", m.id)));
  const e = dados.enderecoObra;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/agenda/${evento.id}`} className="text-muted-foreground hover:underline">
          ← Voltar para o compromisso
        </Link>
      </p>
      <CabecalhoPagina
        titulo={`Visita — ${evento.clienteNome ?? "cliente"}`}
        descricao={`${evento.projetoCodigo} · ${evento.projetoTitulo} · ${formatarDataHora(evento.inicio)}`}
        acoes={
          <Link href={`/agenda/${evento.id}`} className={buttonVariants()}>
            Concluir na agenda
          </Link>
        }
      />
      {evento.local ? (
        <p className="text-muted-foreground mb-4 flex items-start gap-1.5 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {evento.local}
        </p>
      ) : null}

      <div className="grid max-w-3xl gap-6">
        <SugestoesDeTipologia />
        <section aria-labelledby="titulo-medidas" className="grid gap-3">
          <h2 id="titulo-medidas" className="text-lg font-semibold">
            Medidas dos vãos <span className="text-muted-foreground text-sm font-normal">({medidas.length})</span>
          </h2>
          <p className="text-muted-foreground text-sm">Anote cada vão e tire a foto. São medidas-rascunho: a medição exata para produção vem depois.</p>
          {medidas.map((m, i) => (
            <FormMedida key={m.id} projetoId={evento.projetoId!} eventoId={evento.id} medida={m} numero={i + 1}>
              <Anexos entidadeTipo="MedidaRascunho" entidadeId={m.id} anexos={fotos[i]} titulo="Fotos do vão" camera />
            </FormMedida>
          ))}
          <FormMedida projetoId={evento.projetoId} eventoId={evento.id} />
        </section>

        <section aria-labelledby="titulo-obra" className="grid gap-3">
          <h2 id="titulo-obra" className="text-lg font-semibold">
            Dados da obra
          </h2>
          <FormDadosDaObra
            dados={{
              projetoId: dados.id,
              eventoId: evento.id,
              faseDaObra: dados.faseDaObra,
              arquiteto: dados.arquiteto,
              prazoDesejado: dados.prazoDesejado,
              investimentoPrevistoCentavos: dados.investimentoPrevistoCentavos,
              temEndereco: !!e,
              condominio: e?.condominio ?? false,
              condominioNome: e?.condominioNome ?? null,
              exigeAprovacaoFachada: e?.exigeAprovacaoFachada ?? false,
              fachadaAprovada: e?.fachadaAprovada ?? false,
              horariosPermitidos: e?.horariosPermitidos ?? null,
              sindicoNome: e?.sindicoNome ?? null,
              sindicoTelefone: e?.sindicoTelefone ?? null,
            }}
          />
        </section>

        <Anexos entidadeTipo="EventoAgenda" entidadeId={evento.id} anexos={fotosDaVisita} titulo="Fotos gerais da visita" camera />
      </div>
    </>
  );
}
