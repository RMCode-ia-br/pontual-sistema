import { FileText } from "lucide-react";
import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { ListaModelos } from "@/modules/modelos-texto/components/lista-modelos";

export const metadata: Metadata = { title: "Modelos de texto" };

export default async function PaginaModelosTexto() {
  await exigirSessao();
  const modelos = await prisma.modeloTexto.findMany({
    where: { deletadoEm: null },
    orderBy: [{ ordem: "asc" }, { titulo: "asc" }],
    select: { id: true, chave: true, titulo: true, categoria: true, conteudo: true, ativo: true },
  });

  return (
    <>
      <CabecalhoPagina
        titulo="Modelos de texto"
        descricao="Notas e termos das propostas e mensagens de WhatsApp. Edite uma vez e valem para todas as próximas."
      />
      {modelos.length === 0 ? (
        <EstadoVazio
          icone={FileText}
          titulo="Nenhum modelo cadastrado"
          descricao="Rode o seed base (npm run seed) para criar os modelos padrão de propostas e mensagens."
        />
      ) : (
        <ListaModelos modelos={modelos} />
      )}
    </>
  );
}
