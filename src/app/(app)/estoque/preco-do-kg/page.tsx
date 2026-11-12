import { Scale } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { buttonVariants } from "@/components/ui/button";
import { exigirSessao } from "@/lib/auth/sessao";
import { CartaoDePrecoKg } from "@/modules/produtos/components/cartao-preco-kg";
import { ReajusteDoKg } from "@/modules/produtos/components/reajuste-do-kg";
import { carregarTelaDoPrecoKg } from "@/modules/produtos/queries-preco-kg";

export const metadata: Metadata = { title: "Preço do kg do alumínio" };

export default async function PaginaPrecoDoKg() {
  await exigirSessao();
  const tela = await carregarTelaDoPrecoKg();
  const comPreco = tela.acabamentos.filter((a) => a.geralCentavos !== null || a.porLinha.some((p) => p.custoKgCentavos !== null)).length;

  return (
    <>
      <CabecalhoPagina
        titulo="Preço do kg do alumínio"
        descricao="O Marcelo compra o alumínio por kg: informe aqui o preço do kg de cada acabamento. O custo por barra e por metro dos perfis é calculado com o peso por metro e o comprimento da barra, e acompanha cada mudança de preço."
        acoes={
          <Link href="/produtos?custo=sem" className={buttonVariants({ variant: "outline" })}>
            Produtos sem custo
          </Link>
        }
      />

      {tela.acabamentos.length === 0 ? (
        <EstadoVazio
          icone={Scale}
          titulo="Nenhum acabamento cadastrado"
          descricao="O preço do kg é por acabamento (anodizado natural, preto, branco…). Cadastre os acabamentos em Catálogos e volte aqui."
          acao={
            <Link href="/configuracoes/catalogos" className={buttonVariants()}>
              Abrir os catálogos
            </Link>
          }
        />
      ) : (
        <div className="grid gap-6">
          <p role="status" className="text-muted-foreground text-sm">
            {comPreco === 0 ? "Nenhum preço do kg informado ainda: nada foi inventado. Preencha o que você sabe e deixe em branco o resto." : `${comPreco} de ${tela.acabamentos.length} acabamentos com preço do kg.`}
          </p>
          {tela.perfisSemAcabamento > 0 ? (
            <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              {tela.perfisSemAcabamento} {tela.perfisSemAcabamento === 1 ? "perfil" : "perfis"} por kg sem acabamento escolhido: sem acabamento não há preço do kg. Edite o produto e escolha o acabamento.
            </p>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            {tela.acabamentos.map((a) => (
              <CartaoDePrecoKg key={a.id} acabamento={a} linhas={tela.linhas} />
            ))}
          </div>
          <ReajusteDoKg />
        </div>
      )}
    </>
  );
}
