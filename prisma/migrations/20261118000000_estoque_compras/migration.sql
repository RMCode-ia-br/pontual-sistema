-- Fase 6, Bloco 1: estoque, retalhos, sucata, compras, preço do kg do alumínio e custo de material informado na proposta.
-- Aditiva: só cria tipos, tabelas e colunas opcionais (nenhum dado existente é alterado ou apagado).

-- CreateEnum
CREATE TYPE "TipoMovimentoEstoque" AS ENUM ('INVENTARIO_INICIAL', 'ENTRADA_COMPRA', 'SAIDA_OBRA', 'DEVOLUCAO', 'AJUSTE', 'PERDA');

-- CreateEnum
CREATE TYPE "StatusRetalho" AS ENUM ('DISPONIVEL', 'CONSUMIDO', 'DESCARTADO');

-- CreateEnum
CREATE TYPE "TipoMovimentoSucata" AS ENUM ('GERACAO', 'VENDA', 'AJUSTE');

-- CreateEnum
CREATE TYPE "TipoCompra" AS ENUM ('MATERIAL', 'VIDRO');

-- CreateEnum
CREATE TYPE "DestinoCompra" AS ENUM ('ESTOQUE', 'OBRA');

-- CreateEnum
CREATE TYPE "StatusCompra" AS ENUM ('RASCUNHO', 'PEDIDO', 'RECEBIDO_PARCIAL', 'RECEBIDO', 'CANCELADO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrigemPreco" ADD VALUE 'COMPRA';
ALTER TYPE "OrigemPreco" ADD VALUE 'PRECO_KG';

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "custoPorKg" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "saldoCache" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "HistoricoPreco" ADD COLUMN     "compraId" TEXT;

-- AlterTable
ALTER TABLE "OpcaoProposta" ADD COLUMN     "custoMaterialInformadoCentavos" INTEGER;

-- AlterTable
ALTER TABLE "ItemProposta" ADD COLUMN     "custoMaterialInformadoCentavos" INTEGER;

-- AlterTable
ALTER TABLE "ContaPagar" ADD COLUMN     "compraId" TEXT;

-- CreateTable
CREATE TABLE "PrecoKgAluminio" (
    "id" TEXT NOT NULL,
    "acabamentoId" TEXT NOT NULL,
    "linhaId" TEXT,
    "fornecedorId" TEXT,
    "custoKgCentavos" INTEGER,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "PrecoKgAluminio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoPrecoKg" (
    "id" TEXT NOT NULL,
    "precoKgId" TEXT NOT NULL,
    "custoAnteriorCentavos" INTEGER,
    "custoNovoCentavos" INTEGER,
    "origem" "OrigemPreco" NOT NULL,
    "compraId" TEXT,
    "usuarioId" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "HistoricoPrecoKg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoEstoque" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "tipo" "TipoMovimentoEstoque" NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "custoUnitarioCentavos" INTEGER,
    "data" DATE NOT NULL,
    "projetoId" TEXT,
    "itemRecebimentoId" TEXT,
    "estornoDeId" TEXT,
    "semSaldoConfirmado" BOOLEAN NOT NULL DEFAULT false,
    "justificativa" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "MovimentoEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Retalho" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "comprimentoMm" INTEGER NOT NULL,
    "local" TEXT,
    "status" "StatusRetalho" NOT NULL DEFAULT 'DISPONIVEL',
    "origemProjetoId" TEXT,
    "origemMovimentoId" TEXT,
    "consumidoProjetoId" TEXT,
    "consumidoEm" TIMESTAMP(3),
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Retalho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoSucata" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimentoSucata" NOT NULL,
    "data" DATE NOT NULL,
    "pesoKg" DECIMAL(10,3),
    "comprimentoMm" INTEGER,
    "valorCentavos" INTEGER,
    "lancamentoId" TEXT,
    "projetoId" TEXT,
    "produtoId" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "MovimentoSucata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compra" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "tipo" "TipoCompra" NOT NULL DEFAULT 'MATERIAL',
    "destino" "DestinoCompra" NOT NULL DEFAULT 'ESTOQUE',
    "projetoId" TEXT,
    "status" "StatusCompra" NOT NULL DEFAULT 'RASCUNHO',
    "dataPedido" DATE,
    "previsaoEntrega" DATE,
    "condicoes" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemCompra" (
    "id" TEXT NOT NULL,
    "compraId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "produtoId" TEXT,
    "descricao" TEXT,
    "unidadeCompra" "UnidadeProduto" NOT NULL DEFAULT 'UN',
    "quantidade" DECIMAL(12,3) NOT NULL,
    "quantidadeRecebida" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "precoUnitarioCentavos" INTEGER,
    "larguraMm" INTEGER,
    "alturaMm" INTEGER,
    "espessuraMm" INTEGER,
    "tipoVidroId" TEXT,
    "beneficiamentos" TEXT,
    "itemPropostaId" TEXT,
    "itemPropostaMedidaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "ItemCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecebimentoCompra" (
    "id" TEXT NOT NULL,
    "compraId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "RecebimentoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemRecebimento" (
    "id" TEXT NOT NULL,
    "recebimentoId" TEXT NOT NULL,
    "itemCompraId" TEXT NOT NULL,
    "quantidadeCompra" DECIMAL(12,3) NOT NULL,
    "quantidadeEstoque" DECIMAL(12,3) NOT NULL,
    "valorCentavos" INTEGER,
    "custoUnitarioCentavos" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "ItemRecebimento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrecoKgAluminio_acabamentoId_idx" ON "PrecoKgAluminio"("acabamentoId");

-- CreateIndex
CREATE INDEX "PrecoKgAluminio_linhaId_idx" ON "PrecoKgAluminio"("linhaId");

-- CreateIndex
CREATE INDEX "HistoricoPrecoKg_precoKgId_criadoEm_idx" ON "HistoricoPrecoKg"("precoKgId", "criadoEm");

-- CreateIndex
CREATE INDEX "HistoricoPrecoKg_compraId_idx" ON "HistoricoPrecoKg"("compraId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentoEstoque_estornoDeId_key" ON "MovimentoEstoque"("estornoDeId");

-- CreateIndex
CREATE INDEX "MovimentoEstoque_produtoId_data_idx" ON "MovimentoEstoque"("produtoId", "data");

-- CreateIndex
CREATE INDEX "MovimentoEstoque_projetoId_idx" ON "MovimentoEstoque"("projetoId");

-- CreateIndex
CREATE INDEX "MovimentoEstoque_itemRecebimentoId_idx" ON "MovimentoEstoque"("itemRecebimentoId");

-- CreateIndex
CREATE INDEX "Retalho_produtoId_status_idx" ON "Retalho"("produtoId", "status");

-- CreateIndex
CREATE INDEX "Retalho_origemProjetoId_idx" ON "Retalho"("origemProjetoId");

-- CreateIndex
CREATE INDEX "MovimentoSucata_data_idx" ON "MovimentoSucata"("data");

-- CreateIndex
CREATE INDEX "MovimentoSucata_projetoId_idx" ON "MovimentoSucata"("projetoId");

-- CreateIndex
CREATE UNIQUE INDEX "Compra_numero_key" ON "Compra"("numero");

-- CreateIndex
CREATE INDEX "Compra_status_previsaoEntrega_idx" ON "Compra"("status", "previsaoEntrega");

-- CreateIndex
CREATE INDEX "Compra_fornecedorId_idx" ON "Compra"("fornecedorId");

-- CreateIndex
CREATE INDEX "Compra_projetoId_idx" ON "Compra"("projetoId");

-- CreateIndex
CREATE INDEX "ItemCompra_produtoId_idx" ON "ItemCompra"("produtoId");

-- CreateIndex
CREATE INDEX "ItemCompra_itemPropostaId_idx" ON "ItemCompra"("itemPropostaId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemCompra_compraId_ordem_key" ON "ItemCompra"("compraId", "ordem");

-- CreateIndex
CREATE INDEX "RecebimentoCompra_compraId_idx" ON "RecebimentoCompra"("compraId");

-- CreateIndex
CREATE INDEX "ItemRecebimento_recebimentoId_idx" ON "ItemRecebimento"("recebimentoId");

-- CreateIndex
CREATE INDEX "ItemRecebimento_itemCompraId_idx" ON "ItemRecebimento"("itemCompraId");

-- AddForeignKey
ALTER TABLE "HistoricoPreco" ADD CONSTRAINT "HistoricoPreco_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecoKgAluminio" ADD CONSTRAINT "PrecoKgAluminio_acabamentoId_fkey" FOREIGN KEY ("acabamentoId") REFERENCES "AcabamentoAluminio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecoKgAluminio" ADD CONSTRAINT "PrecoKgAluminio_linhaId_fkey" FOREIGN KEY ("linhaId") REFERENCES "LinhaAluminio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecoKgAluminio" ADD CONSTRAINT "PrecoKgAluminio_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoPrecoKg" ADD CONSTRAINT "HistoricoPrecoKg_precoKgId_fkey" FOREIGN KEY ("precoKgId") REFERENCES "PrecoKgAluminio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoPrecoKg" ADD CONSTRAINT "HistoricoPrecoKg_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_itemRecebimentoId_fkey" FOREIGN KEY ("itemRecebimentoId") REFERENCES "ItemRecebimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "MovimentoEstoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retalho" ADD CONSTRAINT "Retalho_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retalho" ADD CONSTRAINT "Retalho_origemProjetoId_fkey" FOREIGN KEY ("origemProjetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retalho" ADD CONSTRAINT "Retalho_origemMovimentoId_fkey" FOREIGN KEY ("origemMovimentoId") REFERENCES "MovimentoEstoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retalho" ADD CONSTRAINT "Retalho_consumidoProjetoId_fkey" FOREIGN KEY ("consumidoProjetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoSucata" ADD CONSTRAINT "MovimentoSucata_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "Lancamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoSucata" ADD CONSTRAINT "MovimentoSucata_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoSucata" ADD CONSTRAINT "MovimentoSucata_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCompra" ADD CONSTRAINT "ItemCompra_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCompra" ADD CONSTRAINT "ItemCompra_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCompra" ADD CONSTRAINT "ItemCompra_tipoVidroId_fkey" FOREIGN KEY ("tipoVidroId") REFERENCES "TipoVidro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCompra" ADD CONSTRAINT "ItemCompra_itemPropostaId_fkey" FOREIGN KEY ("itemPropostaId") REFERENCES "ItemProposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCompra" ADD CONSTRAINT "ItemCompra_itemPropostaMedidaId_fkey" FOREIGN KEY ("itemPropostaMedidaId") REFERENCES "ItemPropostaMedida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecebimentoCompra" ADD CONSTRAINT "RecebimentoCompra_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRecebimento" ADD CONSTRAINT "ItemRecebimento_recebimentoId_fkey" FOREIGN KEY ("recebimentoId") REFERENCES "RecebimentoCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRecebimento" ADD CONSTRAINT "ItemRecebimento_itemCompraId_fkey" FOREIGN KEY ("itemCompraId") REFERENCES "ItemCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =====================================================================================
-- Parte manual (não gerada pelo Prisma)
-- =====================================================================================

-- 1) Um preço do kg por (acabamento, linha) entre os não excluídos; linha vazia = "qualquer linha" (conta como um valor só).
CREATE UNIQUE INDEX "PrecoKgAluminio_acabamento_linha_unico"
  ON "PrecoKgAluminio" ("acabamentoId", COALESCE("linhaId", ''))
  WHERE "deletadoEm" IS NULL;

-- 2) Regras que o banco garante mesmo se o código falhar.
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_obra_exige_projeto" CHECK ("destino" <> 'OBRA' OR "projetoId" IS NOT NULL);
ALTER TABLE "ItemCompra" ADD CONSTRAINT "ItemCompra_quantidade_positiva" CHECK ("quantidade" > 0);
ALTER TABLE "ItemCompra" ADD CONSTRAINT "ItemCompra_produto_ou_descricao" CHECK ("produtoId" IS NOT NULL OR ("descricao" IS NOT NULL AND btrim("descricao") <> ''));
ALTER TABLE "ItemRecebimento" ADD CONSTRAINT "ItemRecebimento_quantidades_positivas" CHECK ("quantidadeCompra" > 0 AND "quantidadeEstoque" > 0);
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_quantidade_nao_zero" CHECK ("quantidade" <> 0);
ALTER TABLE "Retalho" ADD CONSTRAINT "Retalho_comprimento_positivo" CHECK ("comprimentoMm" > 0);

-- 3) Segurança (docs/DECISOES.md, item 15): toda tabela nova com RLS ligado e sem política,
--    e sem privilégios para os papéis públicos do Supabase (anon/authenticated).
DO $$
DECLARE
  tabela record;
  papel text;
BEGIN
  FOR tabela IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela.tablename);
  END LOOP;

  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', papel);
    END IF;
  END LOOP;
END
$$;
