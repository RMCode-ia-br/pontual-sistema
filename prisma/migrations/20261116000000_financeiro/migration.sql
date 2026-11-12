-- CreateEnum
CREATE TYPE "GrupoDre" AS ENUM ('RECEITAS_OPERACIONAIS', 'OUTRAS_RECEITAS', 'IMPOSTOS', 'CUSTOS_DIRETOS', 'DESPESAS_FIXAS', 'DESPESAS_OPERACIONAIS', 'DESPESAS_COMERCIAIS', 'DESPESAS_ADMINISTRATIVAS', 'DESPESAS_FINANCEIRAS');

-- CreateEnum
CREATE TYPE "TipoContaFinanceira" AS ENUM ('BANCO', 'CAIXA', 'OUTRA');

-- CreateEnum
CREATE TYPE "TipoLancamento" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "StatusContaPagar" AS ENUM ('ABERTA', 'PARCIAL', 'PAGA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "PeriodicidadeRecorrencia" AS ENUM ('MENSAL', 'TRIMESTRAL', 'ANUAL');

-- AlterTable
ALTER TABLE "ConfiguracaoEmpresa" ADD COLUMN     "categoriaReceitaPadraoId" TEXT,
ADD COLUMN     "diasAlertaVencimento" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "diasLembreteCobranca" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mesesRecorrenciaAFrente" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "CategoriaFinanceira" ADD COLUMN     "grupo" "GrupoDre";

-- AlterTable
ALTER TABLE "ContaReceber" ADD COLUMN     "categoriaFinanceiraId" TEXT,
ADD COLUMN     "valorPagoCentavos" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ContaFinanceira" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoContaFinanceira" NOT NULL DEFAULT 'BANCO',
    "saldoInicialCentavos" INTEGER NOT NULL DEFAULT 0,
    "saldoInicialInformado" BOOLEAN NOT NULL DEFAULT false,
    "dataSaldoInicial" DATE,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "ContaFinanceira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lancamento" (
    "id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "tipo" "TipoLancamento" NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "contaFinanceiraId" TEXT NOT NULL,
    "categoriaId" TEXT,
    "descricao" TEXT NOT NULL,
    "forma" "FormaPagamento",
    "comNotaFiscal" BOOLEAN NOT NULL DEFAULT false,
    "projetoId" TEXT,
    "clienteId" TEXT,
    "fornecedorId" TEXT,
    "contaReceberId" TEXT,
    "contaPagarId" TEXT,
    "transferenciaId" TEXT,
    "conciliado" BOOLEAN NOT NULL DEFAULT false,
    "conciliadoEm" TIMESTAMP(3),
    "estornadoEm" TIMESTAMP(3),
    "estornadoPorId" TEXT,
    "motivoEstorno" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaPagar" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "funcionarioId" TEXT,
    "favorecido" TEXT,
    "categoriaId" TEXT,
    "projetoId" TEXT,
    "valorCentavos" INTEGER NOT NULL,
    "valorPagoCentavos" INTEGER NOT NULL DEFAULT 0,
    "vencimento" DATE NOT NULL,
    "competencia" DATE NOT NULL,
    "status" "StatusContaPagar" NOT NULL DEFAULT 'ABERTA',
    "forma" "FormaPagamento",
    "parcelamentoId" TEXT,
    "parcelaNumero" INTEGER,
    "parcelaTotal" INTEGER,
    "recorrenciaId" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "ContaPagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecorrenciaPagar" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "funcionarioId" TEXT,
    "favorecido" TEXT,
    "categoriaId" TEXT,
    "valorCentavos" INTEGER NOT NULL,
    "diaVencimento" INTEGER NOT NULL,
    "periodicidade" "PeriodicidadeRecorrencia" NOT NULL DEFAULT 'MENSAL',
    "inicio" DATE NOT NULL,
    "fim" DATE,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "forma" "FormaPagamento",
    "observacao" TEXT,
    "geradaAte" DATE,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "RecorrenciaPagar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContaFinanceira_deletadoEm_ativo_ordem_idx" ON "ContaFinanceira"("deletadoEm", "ativo", "ordem");

-- CreateIndex
CREATE INDEX "Lancamento_contaFinanceiraId_data_idx" ON "Lancamento"("contaFinanceiraId", "data");

-- CreateIndex
CREATE INDEX "Lancamento_data_idx" ON "Lancamento"("data");

-- CreateIndex
CREATE INDEX "Lancamento_categoriaId_data_idx" ON "Lancamento"("categoriaId", "data");

-- CreateIndex
CREATE INDEX "Lancamento_contaReceberId_idx" ON "Lancamento"("contaReceberId");

-- CreateIndex
CREATE INDEX "Lancamento_contaPagarId_idx" ON "Lancamento"("contaPagarId");

-- CreateIndex
CREATE INDEX "Lancamento_transferenciaId_idx" ON "Lancamento"("transferenciaId");

-- CreateIndex
CREATE INDEX "Lancamento_projetoId_idx" ON "Lancamento"("projetoId");

-- CreateIndex
CREATE INDEX "ContaPagar_status_vencimento_idx" ON "ContaPagar"("status", "vencimento");

-- CreateIndex
CREATE INDEX "ContaPagar_fornecedorId_idx" ON "ContaPagar"("fornecedorId");

-- CreateIndex
CREATE INDEX "ContaPagar_parcelamentoId_idx" ON "ContaPagar"("parcelamentoId");

-- CreateIndex
CREATE INDEX "ContaPagar_categoriaId_idx" ON "ContaPagar"("categoriaId");

-- CreateIndex
CREATE INDEX "ContaPagar_projetoId_idx" ON "ContaPagar"("projetoId");

-- CreateIndex
CREATE UNIQUE INDEX "ContaPagar_recorrenciaId_competencia_key" ON "ContaPagar"("recorrenciaId", "competencia");

-- CreateIndex
CREATE INDEX "RecorrenciaPagar_deletadoEm_ativo_idx" ON "RecorrenciaPagar"("deletadoEm", "ativo");

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_categoriaFinanceiraId_fkey" FOREIGN KEY ("categoriaFinanceiraId") REFERENCES "CategoriaFinanceira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_contaFinanceiraId_fkey" FOREIGN KEY ("contaFinanceiraId") REFERENCES "ContaFinanceira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaFinanceira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_contaReceberId_fkey" FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaFinanceira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_recorrenciaId_fkey" FOREIGN KEY ("recorrenciaId") REFERENCES "RecorrenciaPagar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecorrenciaPagar" ADD CONSTRAINT "RecorrenciaPagar_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecorrenciaPagar" ADD CONSTRAINT "RecorrenciaPagar_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecorrenciaPagar" ADD CONSTRAINT "RecorrenciaPagar_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaFinanceira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================================
-- Parte manual (não gerada pelo Prisma)
-- =====================================================================================

-- 1) Segurança (docs/DECISOES.md, item 15): toda tabela nova com RLS ligado e sem política,
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

-- 2) Grupo do DRE: preenche a coluna nova a partir do texto atual de "grupoDre" (que NÃO é alterado nem
--    removido). Texto desconhecido cai em "Outras receitas" (receita) ou "Despesas administrativas" (despesa).
UPDATE "CategoriaFinanceira"
SET "grupo" = CASE
  WHEN "tipo" = 'RECEITA' THEN
    CASE WHEN lower(btrim("grupoDre")) = 'receitas operacionais'
      THEN 'RECEITAS_OPERACIONAIS'::"GrupoDre" ELSE 'OUTRAS_RECEITAS'::"GrupoDre" END
  ELSE
    CASE lower(btrim("grupoDre"))
      WHEN 'impostos' THEN 'IMPOSTOS'::"GrupoDre"
      WHEN 'custos diretos' THEN 'CUSTOS_DIRETOS'::"GrupoDre"
      WHEN 'despesas fixas' THEN 'DESPESAS_FIXAS'::"GrupoDre"
      WHEN 'despesas operacionais' THEN 'DESPESAS_OPERACIONAIS'::"GrupoDre"
      WHEN 'despesas comerciais' THEN 'DESPESAS_COMERCIAIS'::"GrupoDre"
      WHEN 'despesas financeiras' THEN 'DESPESAS_FINANCEIRAS'::"GrupoDre"
      ELSE 'DESPESAS_ADMINISTRATIVAS'::"GrupoDre"
    END
END
WHERE "grupo" IS NULL;

-- 3) Unicidade só entre os não excluídos (o Prisma não expressa índice parcial), sem diferenciar maiúsculas.
CREATE UNIQUE INDEX "ContaFinanceira_nome_ativo_key" ON "ContaFinanceira" (lower("nome")) WHERE "deletadoEm" IS NULL;

-- 4) Restrições de integridade (o app valida antes; o banco é a última barreira).
-- Categoria: a receita só tem grupos de receita, e a despesa só grupos de despesa.
ALTER TABLE "CategoriaFinanceira" ADD CONSTRAINT "CategoriaFinanceira_grupo_tipo_check"
  CHECK ("grupo" IS NULL OR (("tipo" = 'RECEITA') = ("grupo" IN ('RECEITAS_OPERACIONAIS', 'OUTRAS_RECEITAS'))));

-- Conta financeira: saldo informado exige a data a que ele se refere.
ALTER TABLE "ContaFinanceira" ADD CONSTRAINT "ContaFinanceira_saldo_data_check"
  CHECK ("saldoInicialInformado" = false OR "dataSaldoInicial" IS NOT NULL);

-- Lançamento: valor positivo; um vínculo de título só, coerente com o sentido; transferência sem categoria
-- nem título; estorno sempre com motivo; conciliado sempre com data.
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_valor_check" CHECK ("valorCentavos" > 0);
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_titulo_unico_check"
  CHECK ("contaReceberId" IS NULL OR "contaPagarId" IS NULL);
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_sentido_check"
  CHECK (("contaReceberId" IS NULL OR "tipo" = 'ENTRADA') AND ("contaPagarId" IS NULL OR "tipo" = 'SAIDA'));
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_transferencia_check"
  CHECK ("transferenciaId" IS NULL OR ("categoriaId" IS NULL AND "contaReceberId" IS NULL AND "contaPagarId" IS NULL));
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_estorno_check"
  CHECK ("estornadoEm" IS NULL OR "motivoEstorno" IS NOT NULL);
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_conciliado_check"
  CHECK ("conciliado" = false OR "conciliadoEm" IS NOT NULL);

-- Conta a receber (já existente): o recebido nunca passa do valor; paga = recebido igual ao valor;
-- parcial = algo recebido, mas não tudo. (Hoje nenhuma linha está paga ou parcial: o banco não tem pagamentos.)
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_pago_check"
  CHECK ("valorPagoCentavos" >= 0 AND "valorPagoCentavos" <= "valorCentavos");
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_status_pago_check"
  CHECK (("status" <> 'PAGA' OR "valorPagoCentavos" = "valorCentavos")
     AND ("status" <> 'PARCIAL' OR ("valorPagoCentavos" > 0 AND "valorPagoCentavos" < "valorCentavos")));

-- Conta a pagar: mesmas regras; competência sempre no dia 1; parcelamento coerente.
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_valor_check" CHECK ("valorCentavos" > 0);
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_pago_check"
  CHECK ("valorPagoCentavos" >= 0 AND "valorPagoCentavos" <= "valorCentavos");
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_status_pago_check"
  CHECK (("status" <> 'PAGA' OR "valorPagoCentavos" = "valorCentavos")
     AND ("status" <> 'PARCIAL' OR ("valorPagoCentavos" > 0 AND "valorPagoCentavos" < "valorCentavos")));
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_competencia_check" CHECK (EXTRACT(DAY FROM "competencia") = 1);
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_parcelamento_check"
  CHECK (("parcelamentoId" IS NULL AND "parcelaNumero" IS NULL AND "parcelaTotal" IS NULL)
      OR ("parcelamentoId" IS NOT NULL AND "parcelaNumero" >= 1 AND "parcelaTotal" >= "parcelaNumero"));

-- Recorrência: valor positivo, dia do mês válido e fim depois do início.
ALTER TABLE "RecorrenciaPagar" ADD CONSTRAINT "RecorrenciaPagar_valor_check" CHECK ("valorCentavos" > 0);
ALTER TABLE "RecorrenciaPagar" ADD CONSTRAINT "RecorrenciaPagar_dia_check" CHECK ("diaVencimento" BETWEEN 1 AND 31);
ALTER TABLE "RecorrenciaPagar" ADD CONSTRAINT "RecorrenciaPagar_periodo_check" CHECK ("fim" IS NULL OR "fim" >= "inicio");

-- Parâmetros do financeiro em Configurações.
ALTER TABLE "ConfiguracaoEmpresa" ADD CONSTRAINT "ConfiguracaoEmpresa_financeiro_check"
  CHECK ("mesesRecorrenciaAFrente" BETWEEN 1 AND 24
     AND "diasAlertaVencimento" BETWEEN 0 AND 90
     AND "diasLembreteCobranca" BETWEEN 0 AND 60);
