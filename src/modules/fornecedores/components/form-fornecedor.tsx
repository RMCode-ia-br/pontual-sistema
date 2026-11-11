"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CampoMascarado } from "@/components/campo-mascarado";
import { AreaTexto, CaixaMarcacao, Campo, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResultadoAcao } from "@/lib/acoes";
import { mascararCnpj, mascararTelefone } from "@/lib/formatadores/mascaras";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { useProtecaoDeSaida } from "@/lib/hooks/usar-protecao-de-saida";

import { criarFornecedor, editarFornecedor } from "../actions";
import type { FornecedorDetalhe } from "../queries";

type Props = { fornecedor?: FornecedorDetalhe; categorias: { id: string; nome: string }[] };

export function FormFornecedor({ fornecedor, categorias }: Props) {
  const router = useRouter();
  const editando = !!fornecedor;
  const [sujo, setSujo] = useState(false);
  useProtecaoDeSaida(sujo);

  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<{ id: string }>(
    (formData): Promise<ResultadoAcao<{ id: string }>> => (editando ? editarFornecedor(null, formData) : criarFornecedor(null, formData)),
    (r) => {
      if (r.ok && r.dados) {
        setSujo(false);
        toast.success(r.mensagem ?? "Salvo.");
        setTimeout(() => router.push(`/fornecedores/${r.dados!.id}`), 0);
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};

  return (
    <form onSubmit={aoEnviar} onChange={() => setSujo(true)} className="grid gap-5">
      {fornecedor ? <input type="hidden" name="id" value={fornecedor.id} /> : null}

      <section aria-labelledby="sec-empresa" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-empresa" className="font-medium sm:col-span-2">
          Empresa
        </h2>
        <Campo id="razaoSocial" rotulo="Razão social ou nome" erro={erros.razaoSocial} obrigatorio className="sm:col-span-2">
          <Input id="razaoSocial" name="razaoSocial" required maxLength={160} defaultValue={fornecedor?.razaoSocial ?? ""} autoFocus={!editando} autoComplete="off" {...ariaDoCampo("razaoSocial", erros.razaoSocial)} />
        </Campo>
        <Campo id="nomeFantasia" rotulo="Nome fantasia (opcional)" erro={erros.nomeFantasia}>
          <Input id="nomeFantasia" name="nomeFantasia" maxLength={160} defaultValue={fornecedor?.nomeFantasia ?? ""} autoComplete="off" />
        </Campo>
        <Campo id="cnpj" rotulo="CNPJ (opcional)" erro={erros.cnpj}>
          <CampoMascarado id="cnpj" name="cnpj" mascara={mascararCnpj} defaultValue={fornecedor?.cnpj ?? ""} inputMode="numeric" maxLength={18} autoComplete="off" placeholder="00.000.000/0000-00" {...ariaDoCampo("cnpj", erros.cnpj)} />
        </Campo>
        <fieldset className="grid gap-1 sm:col-span-2">
          <legend className="text-sm font-medium">O que fornece</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {categorias.map((c) => (
              <CaixaMarcacao key={c.id} id={`cat-${c.id}`} name="categoriaIds" value={c.id} rotulo={c.nome} defaultChecked={fornecedor?.categoriaIds.includes(c.id)} />
            ))}
          </div>
          {erros.categoriaIds ? (
            <p role="alert" className="text-destructive text-xs">
              {erros.categoriaIds}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">As categorias vêm de Cadastros → Catálogos.</p>
          )}
        </fieldset>
      </section>

      <section aria-labelledby="sec-contato-forn" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-contato-forn" className="font-medium sm:col-span-2">
          Contato e condições
        </h2>
        <Campo id="vendedorNome" rotulo="Vendedor ou contato" erro={erros.vendedorNome}>
          <Input id="vendedorNome" name="vendedorNome" maxLength={160} defaultValue={fornecedor?.vendedorNome ?? ""} autoComplete="off" />
        </Campo>
        <Campo id="telefone" rotulo="Telefone ou WhatsApp" erro={erros.telefone}>
          <CampoMascarado id="telefone" name="telefone" type="tel" mascara={mascararTelefone} defaultValue={fornecedor?.telefone ?? ""} inputMode="tel" autoComplete="off" placeholder="(22) 99999-9999" {...ariaDoCampo("telefone", erros.telefone)} />
        </Campo>
        <Campo id="email" rotulo="E-mail" erro={erros.email}>
          <Input id="email" name="email" type="email" maxLength={254} defaultValue={fornecedor?.email ?? ""} autoComplete="off" {...ariaDoCampo("email", erros.email)} />
        </Campo>
        <Campo id="prazoEntregaDias" rotulo="Prazo de entrega (dias)" erro={erros.prazoEntregaDias} dica="Prazo médio de entrega, em dias corridos.">
          <Input id="prazoEntregaDias" name="prazoEntregaDias" inputMode="numeric" maxLength={3} defaultValue={fornecedor?.prazoEntregaDias ?? ""} autoComplete="off" {...ariaDoCampo("prazoEntregaDias", erros.prazoEntregaDias, "Prazo médio de entrega, em dias corridos.")} />
        </Campo>
        <Campo id="condicoesPagamento" rotulo="Condições de pagamento" erro={erros.condicoesPagamento} className="sm:col-span-2" dica="Ex.: 28 dias, boleto; à vista com 3% de desconto.">
          <Input id="condicoesPagamento" name="condicoesPagamento" maxLength={300} defaultValue={fornecedor?.condicoesPagamento ?? ""} autoComplete="off" />
        </Campo>
        <Campo id="observacoes" rotulo="Observações (opcional)" erro={erros.observacoes} className="sm:col-span-2">
          <AreaTexto id="observacoes" name="observacoes" maxLength={4000} rows={3} defaultValue={fornecedor?.observacoes ?? ""} />
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
          {editando ? "Salvar alterações" : "Cadastrar fornecedor"}
        </Button>
        <Link href={editando ? `/fornecedores/${fornecedor.id}` : "/fornecedores"} className="inline-flex h-8 items-center px-3 text-sm hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
