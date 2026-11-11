import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { formatarRevisao } from "@/lib/dominio/numeracao-proposta";
import { linkWhatsApp, preencherModelo, primeiroNome } from "@/lib/dominio/modelos-texto";
import { calcularTotais } from "@/lib/dominio/preco";
import { formatarData, formatarMoeda, formatarDataHora, hojeCalendario } from "@/lib/formatadores";
import { Anexos } from "@/modules/anexos/components/anexos";
import { listarAnexos } from "@/modules/anexos/queries";
import { AcoesDaProposta } from "@/modules/propostas/components/acoes-da-proposta";
import { EditorProposta } from "@/modules/propostas/components/editor-proposta";
import { PainelCiclo } from "@/modules/propostas/components/painel-ciclo";
import { itensComCustoDesatualizado, listarMotivosDeRecusa, listarOpcoesDoEditor, listarRevisoes, obterMensagemDeEnvio, obterPropostaParaEditor } from "@/modules/propostas/queries";
import { ROTULO_STATUS_PROPOSTA } from "@/modules/propostas/schemas";
import { serializarProposta } from "@/modules/propostas/tipos";
import type { StatusProposta } from "@/lib/dominio/ciclo-proposta";

export const metadata: Metadata = { title: "Proposta" };

export default async function PaginaProposta({ params }: { params: Promise<{ id: string }> }) {
  await exigirSessao();
  const { id } = await params;
  const proposta = await obterPropostaParaEditor(id);
  if (!proposta) notFound();
  const [opcoes, medidasDaVisita, motivos, revisoes, desatualizados, modeloEnvio, anexos, empresa] = await Promise.all([
    listarOpcoesDoEditor(),
    prisma.medidaRascunho.count({ where: { projetoId: proposta.projetoId, deletadoEm: null, larguraMm: { not: null }, alturaMm: { not: null } } }),
    listarMotivosDeRecusa(),
    listarRevisoes(proposta.numero),
    proposta.status === "RASCUNHO" || proposta.status === "ENVIADA" ? itensComCustoDesatualizado(proposta.id) : Promise.resolve(0),
    obterMensagemDeEnvio(),
    listarAnexos("Proposta", proposta.id),
    prisma.configuracaoEmpresa.findUnique({ where: { id: "singleton" }, select: { nomeFantasia: true, emailPropostas: true } }),
  ]);
  const rascunho = proposta.status === "RASCUNHO";
  const status = proposta.status as StatusProposta;

  const totais = calcularTotais(
    proposta.itens.map((i) => ({ opcaoId: i.opcaoId, precoTotalCentavos: i.precoTotalCentavos, medidas: i.medidas })),
    proposta.opcoes.map((o) => ({ id: o.id, descontoCentavos: o.descontoCentavos })),
    proposta.comNotaFiscal,
    proposta.acrescimoNotaPb,
  );

  // Mensagem de envio (modelo editável) para WhatsApp e e-mail.
  const mensagem = preencherModelo(modeloEnvio?.conteudo ?? "Olá, {{cliente}}! Segue a proposta {{numeroProposta}} da {{nomeFantasia}}.", {
    cliente: primeiroNome(proposta.clienteNome),
    numeroProposta: proposta.numero,
    nomeFantasia: empresa?.nomeFantasia ?? undefined,
  }).texto;
  const wa = proposta.clienteTelefone ? linkWhatsApp(proposta.clienteTelefone, mensagem) : null;
  const email = proposta.clienteEmail ? `mailto:${encodeURIComponent(proposta.clienteEmail).replace(/%40/g, "@")}?subject=${encodeURIComponent(`Proposta ${proposta.numero}${empresa?.nomeFantasia ? ` — ${empresa.nomeFantasia}` : ""}`)}&body=${encodeURIComponent(mensagem)}` : null;

  const vencida = status === "ENVIADA" && proposta.validadeAte && proposta.validadeAte < hojeCalendario();
  const variante = status === "APROVADA" ? "default" : status === "RECUSADA" || status === "CANCELADA" ? "destructive" : "secondary";

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/projetos/${proposta.projeto.id}?aba=propostas`} className="text-muted-foreground hover:underline">
          ← {proposta.projeto.codigo} · {proposta.projeto.titulo}
        </Link>
      </p>
      <CabecalhoPagina
        titulo={`Proposta ${proposta.numero}`}
        descricao={`${proposta.clienteNome}${proposta.parte ? ` · ${proposta.parte}` : ""}${proposta.revisao > 0 ? ` · ${formatarRevisao(proposta.revisao)}` : ""}`}
        acoes={<AcoesDaProposta propostaId={proposta.id} numero={proposta.numero} rascunho={rascunho} />}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant={variante}>{ROTULO_STATUS_PROPOSTA[status]}</Badge>
        {proposta.comNotaFiscal ? <Badge variant="outline">Com nota fiscal</Badge> : <Badge variant="outline">Sem nota fiscal</Badge>}
        {vencida ? <Badge variant="destructive">Validade vencida em {formatarData(proposta.validadeAte as Date)}</Badge> : null}
        {proposta.validadeEncerradaPorReajuste ? <Badge variant="destructive">Validade encerrada por reajuste</Badge> : null}
        {proposta.enviadaEm ? <span className="text-muted-foreground text-sm">Enviada em {formatarDataHora(proposta.enviadaEm)}</span> : null}
        {status === "APROVADA" && proposta.valorAprovadoCentavos !== null ? <span className="text-sm">Aprovada: <strong>{formatarMoeda(proposta.valorAprovadoCentavos)}</strong>{proposta.aceitaEm ? ` em ${formatarData(proposta.aceitaEm)}` : ""}</span> : null}
        {status === "RASCUNHO" ? null : <span className="text-muted-foreground text-sm">Conteúdo congelado: para alterar, crie uma nova revisão.</span>}
      </div>

      {desatualizados > 0 ? (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <span>
            <strong>Custo desatualizado desde a emissão:</strong> {desatualizados} {desatualizados === 1 ? "item por composição usa" : "itens por composição usam"} insumo(s) cujo custo mudou depois do cálculo. Revise o preço (abra o item e salve) ou crie uma revisão.
          </span>
        </p>
      ) : null}

      <div className="mb-6">
        <PainelCiclo
          propostaId={proposta.id}
          numero={proposta.numero}
          status={status}
          revisaoAnteriorId={proposta.revisaoDeId}
          validadeEncerrada={proposta.validadeEncerradaPorReajuste}
          opcoes={proposta.opcoes.map((o) => ({ id: o.id, nome: o.nome, totalFormatado: formatarMoeda(totais.find((t) => t.opcaoId === o.id)?.totalCentavos ?? 0) }))}
          condicaoSemParcelas={proposta.parcelas.length === 0}
          qtdParcelas={proposta.parcelas.length}
          hoje={hojeCalendario().toISOString().slice(0, 10)}
          motivos={motivos}
          linkWhatsApp={wa}
          linkEmail={email}
        />
        {revisoes.length > 1 ? (
          <p className="text-muted-foreground mt-2 text-sm">
            Revisões deste número:{" "}
            {revisoes.map((r, i) => (
              <span key={r.id}>
                {i > 0 ? " · " : ""}
                {r.id === proposta.id ? <strong>{r.revisao === 0 ? "original" : formatarRevisao(r.revisao)}</strong> : <Link href={`/propostas/${r.id}`} className="text-primary underline">{r.revisao === 0 ? "original" : formatarRevisao(r.revisao)}</Link>}
                {` (${ROTULO_STATUS_PROPOSTA[r.status as StatusProposta].toLowerCase()})`}
              </span>
            ))}
          </p>
        ) : null}
      </div>

      <EditorProposta proposta={serializarProposta(proposta)} opcoes={opcoes} somenteLeitura={!rascunho} temMedidasDaVisita={medidasDaVisita > 0} />

      <div className="mt-6 max-w-3xl">
        <Anexos entidadeTipo="Proposta" entidadeId={proposta.id} anexos={anexos} titulo="Arquivos da proposta (aceite, comprovantes)" />
      </div>
    </>
  );
}
