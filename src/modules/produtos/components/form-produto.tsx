"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CampoMascarado } from "@/components/campo-mascarado";
import { AreaTexto, CaixaMarcacao, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResultadoAcao } from "@/lib/acoes";
import { centavosParaCampo, mascararMoeda } from "@/lib/formatadores/mascaras";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { useProtecaoDeSaida } from "@/lib/hooks/usar-protecao-de-saida";

import { criarProduto, editarProduto } from "../actions/produtos";
import type { ProdutoDetalhe } from "../queries";
import { COMPRIMENTO_BARRA_PADRAO_MM, ROTULO_UNIDADE, UNIDADES } from "../schemas";

type Opcao = { id: string; nome: string };
type Props = {
  produto?: ProdutoDetalhe;
  opcoes: { categorias: Opcao[]; linhas: Opcao[]; acabamentos: Opcao[]; fornecedores: Opcao[] };
};

/** "6.000" → "6000": o campo mostra o número como o servidor guardou. */
const numeroNoCampo = (n: number | string | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

export function FormProduto({ produto, opcoes }: Props) {
  const router = useRouter();
  const editando = !!produto;
  const [sujo, setSujo] = useState(false);
  const [unidade, setUnidade] = useState<string>(produto?.unidade ?? "UN");
  const [porKg, setPorKg] = useState(produto?.custoPorKg ?? false);
  useProtecaoDeSaida(sujo);

  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<{ id: string }>(
    (formData): Promise<ResultadoAcao<{ id: string }>> => (editando ? editarProduto(null, formData) : criarProduto(null, formData)),
    (r) => {
      if (r.ok && r.dados) {
        setSujo(false);
        toast.success(r.mensagem ?? "Salvo.");
        setTimeout(() => router.push(`/produtos/${r.dados!.id}`), 0);
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};

  return (
    <form onSubmit={aoEnviar} onChange={() => setSujo(true)} className="grid gap-5">
      {produto ? <input type="hidden" name="id" value={produto.id} /> : null}
      {produto ? <input type="hidden" name="custoOriginal" value={produto.custoUnitarioCentavos ?? ""} /> : null}

      <section aria-labelledby="sec-produto" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-produto" className="font-medium sm:col-span-2">
          Produto
        </h2>
        <Campo id="codigo" rotulo="Código" erro={erros.codigo} obrigatorio dica="O código que você usa na loja ou o do fornecedor. Não se repete.">
          <Input id="codigo" name="codigo" required maxLength={40} defaultValue={produto?.codigo ?? ""} autoFocus={!editando} autoComplete="off" {...ariaDoCampo("codigo", erros.codigo, "O código que você usa na loja ou o do fornecedor. Não se repete.")} />
        </Campo>
        <Campo id="unidade" rotulo="Unidade de medida" erro={erros.unidade} obrigatorio>
          <Selecao id="unidade" name="unidade" value={unidade} onChange={(e) => setUnidade(e.target.value)} {...ariaDoCampo("unidade", erros.unidade)}>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {ROTULO_UNIDADE[u]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="descricao" rotulo="Descrição" erro={erros.descricao} obrigatorio className="sm:col-span-2">
          <Input id="descricao" name="descricao" required maxLength={200} defaultValue={produto?.descricao ?? ""} autoComplete="off" {...ariaDoCampo("descricao", erros.descricao)} />
        </Campo>
        <Campo id="categoriaId" rotulo="Categoria" erro={erros.categoriaId}>
          <Selecao id="categoriaId" name="categoriaId" defaultValue={produto?.categoriaId ?? ""} {...ariaDoCampo("categoriaId", erros.categoriaId)}>
            <option value="">Sem categoria</option>
            {opcoes.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="fornecedorPrincipalId" rotulo="Fornecedor principal" erro={erros.fornecedorPrincipalId}>
          <Selecao id="fornecedorPrincipalId" name="fornecedorPrincipalId" defaultValue={produto?.fornecedorPrincipalId ?? ""} {...ariaDoCampo("fornecedorPrincipalId", erros.fornecedorPrincipalId)}>
            <option value="">Sem fornecedor</option>
            {opcoes.fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="linhaId" rotulo="Linha de alumínio (opcional)" erro={erros.linhaId}>
          <Selecao id="linhaId" name="linhaId" defaultValue={produto?.linhaId ?? ""} {...ariaDoCampo("linhaId", erros.linhaId)}>
            <option value="">Nenhuma</option>
            {opcoes.linhas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="acabamentoId" rotulo="Acabamento (opcional)" erro={erros.acabamentoId}>
          <Selecao id="acabamentoId" name="acabamentoId" defaultValue={produto?.acabamentoId ?? ""} {...ariaDoCampo("acabamentoId", erros.acabamentoId)}>
            <option value="">Nenhum</option>
            {opcoes.acabamentos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
      </section>

      <section aria-labelledby="sec-custo-produto" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-custo-produto" className="font-medium sm:col-span-2">
          Custo
        </h2>
        <div className="grid gap-2 sm:col-span-2">
          <CaixaMarcacao id="custoPorKg" name="custoPorKg" rotulo="Perfil de alumínio comprado por kg: o custo vem do preço do kg do acabamento" checked={porKg} onChange={(e) => setPorKg(e.target.checked)} />
          {porKg ? (
            <p className="text-muted-foreground text-xs">
              O custo por barra e por metro é calculado do <Link href="/estoque/preco-do-kg" className="underline">preço do kg</Link> do acabamento escolhido, do peso por metro e do comprimento da barra. Falta alguma dessas informações? O custo continua vazio (“sem custo”), nunca zero.
            </p>
          ) : null}
        </div>
        <Campo
          id="custo"
          rotulo="Custo unitário (R$)"
          erro={erros.custo}
          dica={porKg ? "Calculado pelo preço do kg." : produto?.custoAtualizadoEm ? "Cada mudança de valor fica registrada na aba Histórico de preço." : "Deixe vazio se ainda não souber: o sistema nunca inventa preço."}
        >
          <CampoMascarado
            id="custo"
            name="custo"
            mascara={mascararMoeda}
            defaultValue={centavosParaCampo(produto?.custoUnitarioCentavos)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="0,00"
            disabled={porKg}
            {...ariaDoCampo("custo", erros.custo)}
          />
        </Campo>
        <Campo id="estoqueMinimo" rotulo="Estoque mínimo (opcional)" erro={erros.estoqueMinimo} dica="Vazio = sem alerta de estoque baixo.">
          <Input id="estoqueMinimo" name="estoqueMinimo" inputMode="decimal" maxLength={20} defaultValue={numeroNoCampo(produto?.estoqueMinimo)} autoComplete="off" {...ariaDoCampo("estoqueMinimo", erros.estoqueMinimo, "Vazio = sem alerta de estoque baixo.")} />
        </Campo>
      </section>

      <section aria-labelledby="sec-medidas" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-medidas" className="font-medium sm:col-span-2">
          Medidas e local
        </h2>
        <Campo
          id="comprimentoBarraMm"
          rotulo="Comprimento da barra (mm)"
          erro={erros.comprimentoBarraMm}
          dica={unidade === "BARRA" ? `Para perfil vendido por barra. Se ficar vazio, usamos ${COMPRIMENTO_BARRA_PADRAO_MM.toLocaleString("pt-BR")} mm.` : "Só para perfis."}
        >
          <Input id="comprimentoBarraMm" name="comprimentoBarraMm" inputMode="numeric" maxLength={6} defaultValue={produto?.comprimentoBarraMm ?? ""} autoComplete="off" {...ariaDoCampo("comprimentoBarraMm", erros.comprimentoBarraMm)} />
        </Campo>
        <Campo id="pesoKgPorMetro" rotulo="Peso por metro (kg/m)" erro={erros.pesoKgPorMetro} dica="Para perfis; usado para calcular o peso da sucata.">
          <Input id="pesoKgPorMetro" name="pesoKgPorMetro" inputMode="decimal" maxLength={10} defaultValue={numeroNoCampo(produto?.pesoKgPorMetro)} autoComplete="off" {...ariaDoCampo("pesoKgPorMetro", erros.pesoKgPorMetro)} />
        </Campo>
        <Campo id="larguraMm" rotulo="Largura (mm) — produto acabado" erro={erros.larguraMm}>
          <Input id="larguraMm" name="larguraMm" inputMode="numeric" maxLength={6} defaultValue={produto?.larguraMm ?? ""} autoComplete="off" {...ariaDoCampo("larguraMm", erros.larguraMm)} />
        </Campo>
        <Campo id="alturaMm" rotulo="Altura (mm) — produto acabado" erro={erros.alturaMm}>
          <Input id="alturaMm" name="alturaMm" inputMode="numeric" maxLength={6} defaultValue={produto?.alturaMm ?? ""} autoComplete="off" {...ariaDoCampo("alturaMm", erros.alturaMm)} />
        </Campo>
        <Campo id="localizacao" rotulo="Localização (opcional)" erro={erros.localizacao} dica="Onde fica guardado. Ex.: Prateleira B3." className="sm:col-span-2">
          <Input id="localizacao" name="localizacao" maxLength={120} defaultValue={produto?.localizacao ?? ""} autoComplete="off" />
        </Campo>
        <Campo id="observacoes" rotulo="Observações (opcional)" erro={erros.observacoes} className="sm:col-span-2">
          <AreaTexto id="observacoes" name="observacoes" maxLength={4000} rows={3} defaultValue={produto?.observacoes ?? ""} />
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
          {editando ? "Salvar alterações" : "Cadastrar produto"}
        </Button>
        <Link href={editando ? `/produtos/${produto.id}` : "/produtos"} className="inline-flex h-8 items-center px-3 text-sm hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
