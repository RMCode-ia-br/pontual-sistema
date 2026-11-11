import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AcoesDoCadastro } from "@/components/acoes-do-cadastro";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { exigirSessao } from "@/lib/auth/sessao";
import { excluirCondicoes, inativarCondicoes, reativarCondicoes } from "@/modules/condicoes-pagamento/actions";
import { FormCondicao } from "@/modules/condicoes-pagamento/components/form-condicao";
import { obterCondicao } from "@/modules/condicoes-pagamento/queries";

export const metadata: Metadata = { title: "Condição de pagamento" };

export default async function PaginaCondicao({ params }: { params: Promise<{ id: string }> }) {
  await exigirSessao();
  const { id } = await params;
  const condicao = await obterCondicao(id);
  if (!condicao) notFound();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/configuracoes/condicoes-pagamento" className="text-muted-foreground hover:underline">
          ← Voltar para as condições
        </Link>
      </p>
      <CabecalhoPagina
        titulo={condicao.nome}
        descricao="Mudar um modelo não altera propostas já feitas: cada proposta guarda a sua cópia do cronograma."
        acoes={
          <AcoesDoCadastro
            id={condicao.id}
            nome={condicao.nome}
            ativo={condicao.ativo}
            voltarPara="/configuracoes/condicoes-pagamento"
            inativar={inativarCondicoes}
            reativar={reativarCondicoes}
            excluir={excluirCondicoes}
            preservado="As propostas já feitas mantêm o cronograma."
          />
        }
      />
      {condicao.ativo ? null : (
        <div className="mb-4">
          <Badge variant="destructive">Inativa</Badge>
        </div>
      )}
      <div className="max-w-3xl">
        <FormCondicao condicao={condicao} />
      </div>
    </>
  );
}
