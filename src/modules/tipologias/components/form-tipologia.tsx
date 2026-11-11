"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { AreaTexto, Campo, CaixaMarcacao, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResultadoAcao } from "@/lib/acoes";
import { VARIAVEIS_TEMPLATE } from "@/lib/dominio/descricao-item";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { useProtecaoDeSaida } from "@/lib/hooks/usar-protecao-de-saida";

import { criarTipologia, editarTipologia } from "../actions/tipologias";
import {
  CATEGORIAS_MARKUP,
  CATEGORIAS_TIPOLOGIA,
  COBRANCAS,
  ROTULO_CATEGORIA_MARKUP,
  ROTULO_CATEGORIA_TIPOLOGIA,
  ROTULO_COBRANCA,
  ROTULO_TIPO_DESENHO,
  TIPOS_DESENHO,
} from "../schemas";
import type { TipologiaDetalhe } from "../queries";

type Props = { tipologia?: Pick<TipologiaDetalhe, "id" | "nome" | "categoria" | "tipoDesenho" | "opcoesFolhas" | "templateDescricao" | "revisarTexto" | "cobrancaPadrao" | "categoriaMarkup" | "exigeEsquadria"> };

export function FormTipologia({ tipologia }: Props) {
  const router = useRouter();
  const editando = !!tipologia;
  const [sujo, setSujo] = useState(false);
  useProtecaoDeSaida(sujo);

  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<{ id: string }>(
    (formData): Promise<ResultadoAcao<{ id: string }>> => (editando ? editarTipologia(null, formData) : criarTipologia(null, formData)),
    (r) => {
      if (r.ok && r.dados) {
        setSujo(false);
        toast.success(r.mensagem ?? "Salvo.");
        setTimeout(() => router.push(`/tipologias/${r.dados!.id}`), 0);
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};

  return (
    <form onSubmit={aoEnviar} onChange={() => setSujo(true)} className="grid gap-5">
      {tipologia ? <input type="hidden" name="id" value={tipologia.id} /> : null}

      <section aria-labelledby="sec-tipologia" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-tipologia" className="font-medium sm:col-span-2">
          Tipologia
        </h2>
        <Campo id="nome" rotulo="Nome" erro={erros.nome} obrigatorio className="sm:col-span-2">
          <Input id="nome" name="nome" required maxLength={120} defaultValue={tipologia?.nome ?? ""} autoFocus={!editando} autoComplete="off" {...ariaDoCampo("nome", erros.nome)} />
        </Campo>
        <Campo id="categoria" rotulo="Categoria" erro={erros.categoria} obrigatorio>
          <Selecao id="categoria" name="categoria" defaultValue={tipologia?.categoria ?? "JANELA"} {...ariaDoCampo("categoria", erros.categoria)}>
            {CATEGORIAS_TIPOLOGIA.map((c) => (
              <option key={c} value={c}>
                {ROTULO_CATEGORIA_TIPOLOGIA[c]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="tipoDesenho" rotulo="Desenho" erro={erros.tipoDesenho} obrigatorio dica="Define o desenho esquemático que aparece na proposta.">
          <Selecao id="tipoDesenho" name="tipoDesenho" defaultValue={tipologia?.tipoDesenho ?? "GENERICO"} {...ariaDoCampo("tipoDesenho", erros.tipoDesenho, "Define o desenho esquemático que aparece na proposta.")}>
            {TIPOS_DESENHO.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_DESENHO[t]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="opcoesFolhas" rotulo="Opções de folhas" erro={erros.opcoesFolhas} dica="Separe por vírgula. Ex.: 2, 3, 4. Vazio = sem escolha de folhas.">
          <Input id="opcoesFolhas" name="opcoesFolhas" maxLength={40} defaultValue={tipologia?.opcoesFolhas.join(", ") ?? ""} autoComplete="off" {...ariaDoCampo("opcoesFolhas", erros.opcoesFolhas, "Separe por vírgula. Ex.: 2, 3, 4. Vazio = sem escolha de folhas.")} />
        </Campo>
        <Campo id="cobrancaPadrao" rotulo="Cobrança padrão" erro={erros.cobrancaPadrao} obrigatorio dica="Como a tabela de preços cobra: por m², por unidade ou por metro linear.">
          <Selecao id="cobrancaPadrao" name="cobrancaPadrao" defaultValue={tipologia?.cobrancaPadrao ?? "POR_M2"} {...ariaDoCampo("cobrancaPadrao", erros.cobrancaPadrao, "Como a tabela de preços cobra: por m², por unidade ou por metro linear.")}>
            {COBRANCAS.map((c) => (
              <option key={c} value={c}>
                {ROTULO_COBRANCA[c]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo
          id="categoriaMarkup"
          rotulo="Categoria de markup"
          erro={erros.categoriaMarkup}
          obrigatorio
          dica="Define qual markup sobre o custo vale na composição (valores em Configurações → Empresa). Só afeta itens com preço por composição."
          className="sm:col-span-2"
        >
          <Selecao id="categoriaMarkup" name="categoriaMarkup" defaultValue={tipologia?.categoriaMarkup ?? "PADRAO"} {...ariaDoCampo("categoriaMarkup", erros.categoriaMarkup)}>
            {CATEGORIAS_MARKUP.map((c) => (
              <option key={c} value={c}>
                {ROTULO_CATEGORIA_MARKUP[c]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo
          id="templateDescricao"
          rotulo="Modelo da descrição técnica"
          erro={erros.templateDescricao}
          obrigatorio
          className="sm:col-span-2"
          dica={`Variáveis: ${VARIAVEIS_TEMPLATE.map((v) => `{${v}}`).join(" ")}. Plural pela quantidade: JANELA(S), PAINEL(IS), PORTÃO(ÕES).`}
        >
          <AreaTexto id="templateDescricao" name="templateDescricao" required maxLength={1000} rows={5} defaultValue={tipologia?.templateDescricao ?? ""} {...ariaDoCampo("templateDescricao", erros.templateDescricao)} />
        </Campo>
        <CaixaMarcacao id="exigeEsquadria" name="exigeEsquadria" rotulo="Exige esquadria (linha de alumínio) no item" defaultChecked={tipologia?.exigeEsquadria ?? true} />
        <CaixaMarcacao id="revisarTexto" name="revisarTexto" rotulo="Texto a revisar com o Marcelo" defaultChecked={tipologia?.revisarTexto ?? false} />
      </section>

      {estado && !estado.ok && Object.keys(erros).length === 0 ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.erro}
        </p>
      ) : null}

      <div className="bg-background/95 sticky bottom-14 z-10 -mx-1 flex flex-wrap gap-2 border-t px-1 py-3 backdrop-blur md:bottom-0">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {editando ? "Salvar alterações" : "Criar tipologia"}
        </Button>
        <Link href={editando ? `/tipologias/${tipologia.id}` : "/tipologias"} className="inline-flex h-8 items-center px-3 text-sm hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
