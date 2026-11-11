import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AcoesDoCadastro } from "@/components/acoes-do-cadastro";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { exigirSessao } from "@/lib/auth/sessao";
import { combinacoesSemPreco } from "@/lib/dominio/composicao";
import { dataParaInput, hojeCalendario } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { excluirTipologias, inativarTipologias, reativarTipologias } from "@/modules/tipologias/actions/tipologias";
import { EditorComposicao } from "@/modules/tipologias/components/editor-composicao";
import { FormTipologia } from "@/modules/tipologias/components/form-tipologia";
import { PainelPrecos, type PrecoSerializado } from "@/modules/tipologias/components/painel-precos";
import { listarOpcoesDeTipologia, listarPrecosDaTipologia, obterTipologia, paraDominio } from "@/modules/tipologias/queries";

export const metadata: Metadata = { title: "Tipologia" };

const ABAS = [
  { valor: "dados", titulo: "Dados" },
  { valor: "composicao", titulo: "Composição de custo" },
  { valor: "precos", titulo: "Tabela de preços" },
] as const;

export default async function PaginaTipologia({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  await exigirSessao();
  const { id } = await params;
  const { aba: abaBruta } = await searchParams;

  const tipologia = await obterTipologia(id);
  if (!tipologia) notFound();
  const aba = ABAS.find((a) => a.valor === abaBruta)?.valor ?? "dados";

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/tipologias" className="text-muted-foreground hover:underline">
          ← Voltar para as tipologias
        </Link>
      </p>
      <CabecalhoPagina
        titulo={tipologia.nome}
        acoes={
          <AcoesDoCadastro
            id={tipologia.id}
            nome={tipologia.nome}
            ativo={tipologia.ativo}
            voltarPara="/tipologias"
            inativar={inativarTipologias}
            reativar={reativarTipologias}
            excluir={excluirTipologias}
            preservado="Só é possível enquanto nenhuma proposta usa esta tipologia."
          />
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {tipologia.exemplo ? <Badge variant="outline">EXEMPLO — validar com o Marcelo</Badge> : null}
        {tipologia.revisarTexto ? <Badge variant="outline">Revisar texto da descrição</Badge> : null}
        {tipologia.ativo ? null : <Badge variant="destructive">Inativa</Badge>}
      </div>

      <nav aria-label="Seções da tipologia" className="mb-6 flex gap-1 overflow-x-auto border-b">
        {ABAS.map((a) => (
          <Link
            key={a.valor}
            href={`/tipologias/${tipologia.id}?aba=${a.valor}`}
            aria-current={aba === a.valor ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center border-b-2 px-3 text-sm",
              aba === a.valor ? "border-primary text-primary font-medium" : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {a.titulo}
          </Link>
        ))}
      </nav>

      <div className={aba === "dados" ? "max-w-3xl" : "max-w-5xl"}>
        {aba === "dados" ? <FormTipologia tipologia={tipologia} /> : null}
        {aba === "composicao" ? <Composicao tipologia={tipologia} /> : null}
        {aba === "precos" ? <Precos tipologia={tipologia} /> : null}
      </div>
    </>
  );
}

async function Composicao({ tipologia }: { tipologia: NonNullable<Awaited<ReturnType<typeof obterTipologia>>> }) {
  const opcoes = await listarOpcoesDeTipologia();
  return (
    <EditorComposicao
      tipologiaId={tipologia.id}
      nomeDaTipologia={tipologia.nome}
      exemplo={tipologia.exemplo}
      produtos={opcoes.produtos}
      insumos={tipologia.insumos.map((i) => ({ produtoId: i.produtoId, descricao: i.descricao, unidade: i.unidade, formulaQuantidade: i.formulaQuantidade, perdaPb: i.perdaPb, custoUnitarioCentavos: i.custoUnitarioCentavos }))}
      maoDeObra={tipologia.maoDeObra}
    />
  );
}

async function Precos({ tipologia }: { tipologia: NonNullable<Awaited<ReturnType<typeof obterTipologia>>> }) {
  const [opcoes, precos] = await Promise.all([listarOpcoesDeTipologia(), listarPrecosDaTipologia(tipologia.id)]);
  const hoje = dataParaInput(hojeCalendario());
  const nomeLinha = new Map(opcoes.linhas.map((l) => [l.id, l.nome]));
  const nomeAcab = new Map(opcoes.acabamentos.map((a) => [a.id, a.nome]));
  const semPreco = combinacoesSemPreco(opcoes.linhas, opcoes.acabamentos, paraDominio(precos), hoje).map((c) => `${nomeLinha.get(c.linhaId)} × ${nomeAcab.get(c.acabamentoId)}`);
  const serializados: PrecoSerializado[] = precos.map((p) => ({
    id: p.id,
    linhaId: p.linhaId,
    acabamentoId: p.acabamentoId,
    tipoVidroId: p.tipoVidroId,
    espessuraVidroMm: p.espessuraVidroMm,
    cobranca: p.cobranca,
    valorCentavos: p.valorCentavos,
    vigenciaInicio: p.vigenciaInicio ? dataParaInput(p.vigenciaInicio) : null,
    vigenciaFim: p.vigenciaFim ? dataParaInput(p.vigenciaFim) : null,
    linha: p.linha?.nome ?? null,
    acabamento: p.acabamento?.nome ?? null,
    tipoVidro: p.tipoVidro?.nome ?? null,
  }));
  return <PainelPrecos tipologiaId={tipologia.id} cobrancaPadrao={tipologia.cobrancaPadrao} precos={serializados} opcoes={opcoes} semPreco={semPreco} />;
}
