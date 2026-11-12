"use client";

import { ImageUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AreaTexto, Campo, CaixaMarcacao, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { enviarAnexo } from "@/modules/anexos/components/anexos";

import { definirLogoEmpresa, salvarEmpresa } from "../actions/empresa";

import { CampoCor } from "./campo-cor";

type Props = {
  valores: Record<string, string>;
  marcados: { reiniciaNumeracaoPorAno: boolean; pdfExibirValorPorItem: boolean; pdfDescricoesMaiusculas: boolean };
  /** Categorias de receita ativas (para a categoria sugerida nos recebimentos). */
  categoriasDeReceita: { id: string; nome: string }[];
};

export function FormEmpresa({ valores, marcados, categoriasDeReceita }: Props) {
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario(
    (formData) => salvarEmpresa(null, formData),
    (r) => {
      if (r.ok) toast.success(r.mensagem ?? "Configurações salvas.");
      else toast.error(r.erro);
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};

  // Campo de texto com rótulo, dica e erro inline (valor inicial vem do banco).
  const t = (
    nome: string,
    rotulo: string,
    extra: { dica?: string; tipo?: string; modo?: "numeric" | "decimal" | "tel" | "email" | "url"; max?: number; obrigatorio?: boolean; sufixo?: string } = {},
  ) => (
    <Campo id={nome} rotulo={rotulo} erro={erros[nome]} dica={extra.dica} obrigatorio={extra.obrigatorio}>
      <div className="relative">
        <Input
          id={nome}
          name={nome}
          type={extra.tipo ?? "text"}
          inputMode={extra.modo}
          maxLength={extra.max ?? 200}
          defaultValue={valores[nome] ?? ""}
          className={extra.sufixo ? "pr-10" : undefined}
          {...ariaDoCampo(nome, erros[nome], extra.dica)}
        />
        {extra.sufixo ? (
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">{extra.sufixo}</span>
        ) : null}
      </div>
    </Campo>
  );

  return (
    <form onSubmit={aoEnviar} className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>Identidade da empresa</CardTitle>
          <CardDescription>Aparece nas propostas, nos PDFs e no cabeçalho do sistema.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {t("nomeFantasia", "Nome fantasia")}
          {t("razaoSocial", "Razão social")}
          {t("cnpj", "CNPJ", { modo: "numeric", max: 18 })}
          {t("endereco", "Endereço", { dica: "Confirme o número (propostas trazem 185, o site traz 195)." })}
          {t("cidade", "Cidade", { max: 80 })}
          {t("uf", "UF", { max: 2 })}
          {t("cep", "CEP", { modo: "numeric", max: 9 })}
          <CampoCor nome="corPrimaria" rotulo="Cor principal (opcional)" valorInicial={valores.corPrimaria ?? ""} erro={erros.corPrimaria} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>Contatos e links</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {t("telefone", "Telefone", { modo: "tel", max: 20 })}
          {t("whatsapp", "WhatsApp", { modo: "tel", max: 20 })}
          {t("emailContato", "E-mail de contato", { tipo: "email", modo: "email", max: 254 })}
          {t("emailPropostas", "E-mail nas propostas", { tipo: "email", modo: "email", max: 254, dica: "Hoje é um Gmail; use o institucional quando existir." })}
          {t("siteUrl", "Site", { modo: "url", max: 300 })}
          {t("instagramUrl", "Instagram", { modo: "url", max: 300 })}
          {t("googlePerfilUrl", "Perfil da Empresa no Google (compartilhar)", { modo: "url", max: 300 })}
          {t("linkAvaliacaoGoogle", "Link direto para avaliar no Google", {
            modo: "url",
            max: 300,
            dica: "É diferente do link de compartilhar o perfil. Usado no pedido de avaliação.",
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>Preços e metas</CardTitle>
          <CardDescription>Estes valores alimentam o preço das propostas, os alertas e o painel.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {t("markupPadraoPb", "Markup padrão sobre o custo", { modo: "decimal", max: 6, sufixo: "%", obrigatorio: true, dica: "Preço por composição = custo × (1 + markup). Padrão informado: 80%. Não vale para itens com preço manual ou de tabela." })}
          {t("markupVidroTemperadoPb", "Markup de vidro temperado e guarda-corpo", { modo: "decimal", max: 6, sufixo: "%", obrigatorio: true, dica: "Vale para as tipologias marcadas com essa categoria (hoje: guarda-corpo). Padrão informado: 100%." })}
          {t("acrescimoNotaPb", "Acréscimo quando a venda é com nota fiscal", { modo: "decimal", max: 5, sufixo: "%", obrigatorio: true, dica: "Somado ao total (preço × 1,05 com 5%), em linha separada na proposta. Vendas sem nota não têm acréscimo." })}
          {t("margemMinimaAlertaPercentual", "Margem mínima de alerta", { modo: "decimal", max: 6, sufixo: "%", dica: "Margem real sobre o preço (lucro ÷ preço). Abaixo disso a proposta mostra um aviso. Vazio = sem alerta." })}
          {t("metaFaturamentoMensalCentavos", "Meta de faturamento mensal", { modo: "decimal", max: 20, sufixo: "R$", obrigatorio: true })}
          {t("limiteSimplesCentavos", "Limite do faturamento com nota fiscal (opcional)", { modo: "decimal", max: 20, sufixo: "R$", dica: "Só para acompanhar no painel quanto já foi recebido com nota nos últimos 12 meses. Não calcula imposto. Vazio ou zero: o painel mostra o valor recebido sem percentual (\"limite não informado\"). O Marcelo informa o valor real quando quiser." })}
          {t("capacidadeProducaoM2Mes", "Capacidade de produção por mês", { modo: "numeric", max: 6, sufixo: "m²", obrigatorio: true })}
          {t("custoMaoDeObraPorM2Centavos", "Custo de mão de obra por m² (opcional)", { modo: "decimal", max: 20, sufixo: "R$" })}
          {t("retalhoMinimoMm", "Retalho mínimo reaproveitável (opcional)", { modo: "numeric", max: 4, sufixo: "mm" })}
          {t("garantiaRegulagemDias", "Garantia de regulagem", { modo: "numeric", max: 4, sufixo: "dias", obrigatorio: true })}
          <Campo id="tipoDias" rotulo="Contagem dos prazos" erro={erros.tipoDias}>
            <Selecao id="tipoDias" name="tipoDias" defaultValue={valores.tipoDias} {...ariaDoCampo("tipoDias", erros.tipoDias)}>
              <option value="UTEIS">Dias úteis (desconta feriados)</option>
              <option value="CORRIDOS">Dias corridos</option>
            </Selecao>
          </Campo>
          {t("diasFollowUpProposta", "Acompanhar proposta após", { modo: "numeric", max: 3, sufixo: "dias", obrigatorio: true })}
          {t("diasAlertaPrazoAmarelo", "Alerta amarelo do prazo", { modo: "numeric", max: 2, sufixo: "dias", obrigatorio: true, dica: "Quantos dias antes do vencimento o semáforo fica amarelo." })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>Funil e acompanhamento</CardTitle>
          <CardDescription>Prazos do acompanhamento comercial (em dias corridos) e porte dos projetos.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {t("diasSemRetornoProposta", "Proposta sem retorno após", { modo: "numeric", max: 3, sufixo: "dias", obrigatorio: true, dica: "Propostas enviadas paradas há mais que isso entram na lista \"Sem retorno\"." })}
          {t("diasPedidoAvaliacao", "Pedir avaliação no Google após", { modo: "numeric", max: 2, sufixo: "dias", obrigatorio: true, dica: "Dias depois da conclusão da obra." })}
          {t("porteMedioMinimoCentavos", "Projeto médio a partir de (opcional)", { modo: "decimal", max: 20, sufixo: "R$", dica: "Vazio = o porte é sempre escolhido à mão, sem sugestão." })}
          {t("porteGrandeMinimoCentavos", "Projeto grande a partir de (opcional)", { modo: "decimal", max: 20, sufixo: "R$" })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>Financeiro</CardTitle>
          <CardDescription>Prazos de cobrança e de geração das contas recorrentes. Imposto não é calculado: lance o DAS como despesa na categoria &quot;Impostos (DAS)&quot;.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {t("diasAlertaVencimento", "Vence em breve: próximos", { modo: "numeric", max: 2, sufixo: "dias", obrigatorio: true, dica: "Janela de \"vence em breve\" nas listas e no painel." })}
          {t("diasLembreteCobranca", "Lembrete de cobrança antes do vencimento", { modo: "numeric", max: 2, sufixo: "dias", obrigatorio: true, dica: "Quando a parcela abre, a tarefa \"Cobrar parcela\" vence tantos dias antes do vencimento (0 = no próprio dia)." })}
          {t("mesesRecorrenciaAFrente", "Gerar contas recorrentes para os próximos", { modo: "numeric", max: 2, sufixo: "meses", obrigatorio: true, dica: "Aluguel, energia, DAS e salários são lançados mês a mês até esse horizonte." })}
          <Campo id="categoriaReceitaPadraoId" rotulo="Categoria sugerida ao receber parcelas" erro={erros.categoriaReceitaPadraoId} dica="Pré-selecionada no recebimento; dá para trocar a cada vez. Vazio = escolher sempre.">
            <Selecao id="categoriaReceitaPadraoId" name="categoriaReceitaPadraoId" defaultValue={valores.categoriaReceitaPadraoId ?? ""} {...ariaDoCampo("categoriaReceitaPadraoId", erros.categoriaReceitaPadraoId)}>
              <option value="">Escolher a cada recebimento</option>
              {categoriasDeReceita.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>Horário de atendimento</CardTitle>
          <CardDescription>Usado para sugerir horários livres de visita. Deixe em branco o dia sem expediente.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {t("horarioSemanaInicio", "Segunda a sexta: início", { tipo: "time", max: 5 })}
          {t("horarioSemanaFim", "Segunda a sexta: fim", { tipo: "time", max: 5 })}
          {t("horarioSabadoInicio", "Sábado: início", { tipo: "time", max: 5 })}
          {t("horarioSabadoFim", "Sábado: fim", { tipo: "time", max: 5 })}
          {t("visitaDuracaoMin", "Duração da visita técnica", { modo: "numeric", max: 3, sufixo: "min", obrigatorio: true })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>Propostas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {t("proximoNumeroProposta", "Próximo número de proposta", { modo: "numeric", max: 6, dica: "O número que a próxima proposta vai receber (começa em 2000: 2000-26). Sobe sozinho a cada proposta criada." })}
          <div className="flex items-end pb-1">
            <CaixaMarcacao id="reiniciaNumeracaoPorAno" name="reiniciaNumeracaoPorAno" rotulo="Reiniciar a numeração a cada ano" defaultChecked={marcados.reiniciaNumeracaoPorAno} />
          </div>
          {t("consultorNome", "Consultor na assinatura")}
          {t("consultorCargo", "Cargo na assinatura")}
          <Campo id="dadosPagamento" rotulo="Dados para pagamento (aparecem nos termos)" erro={erros.dadosPagamento} className="sm:col-span-2">
            <AreaTexto id="dadosPagamento" name="dadosPagamento" maxLength={500} defaultValue={valores.dadosPagamento} {...ariaDoCampo("dadosPagamento", erros.dadosPagamento)} />
          </Campo>
          <div className="grid gap-1 sm:col-span-2">
            <CaixaMarcacao id="pdfExibirValorPorItem" name="pdfExibirValorPorItem" rotulo="Mostrar o valor de cada item no PDF" defaultChecked={marcados.pdfExibirValorPorItem} />
            <CaixaMarcacao id="pdfDescricoesMaiusculas" name="pdfDescricoesMaiusculas" rotulo="Descrições em maiúsculas no PDF" defaultChecked={marcados.pdfDescricoesMaiusculas} />
          </div>
        </CardContent>
      </Card>

      <div className="bg-background/95 sticky bottom-16 z-10 -mx-4 flex items-center justify-end gap-3 border-t px-4 py-3 backdrop-blur md:bottom-0 md:mx-0 md:rounded-b-xl">
        {estado && !estado.ok && Object.keys(erros).length > 0 ? (
          <p role="alert" className="text-destructive mr-auto text-sm">
            Corrija os campos destacados.
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {pendente ? "Salvando..." : "Salvar configurações"}
        </Button>
      </div>
    </form>
  );
}

export function LogoEmpresa({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setEnviando(true);
    try {
      const id = await enviarAnexo("ConfiguracaoEmpresa", "singleton", arquivo, "logo");
      const r = await definirLogoEmpresa(id);
      if (!r.ok) throw new Error(r.erro);
      toast.success("Logo atualizado.");
      router.refresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível enviar o logo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>Logo</CardTitle>
        <CardDescription>PNG, JPG ou WebP. Aparece no menu e nos PDFs. Você pode trocar a qualquer momento.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <div className="bg-muted flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage
            <img src={logoUrl} alt="Logo atual da empresa" className="size-full object-contain" />
          ) : (
            <span className="text-muted-foreground px-2 text-center text-xs">Sem logo</span>
          )}
        </div>
        <div>
          <Button type="button" variant="outline" onClick={() => entrada.current?.click()} disabled={enviando}>
            {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <ImageUp aria-hidden />}
            {enviando ? "Enviando..." : logoUrl ? "Trocar logo" : "Enviar logo"}
          </Button>
          <input
            ref={entrada}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-label="Escolher imagem do logo"
            onChange={aoEscolher}
            data-testid="entrada-logo"
          />
        </div>
      </CardContent>
    </Card>
  );
}
