-- Fase 6, Bloco 0: "cliente pediu até o dia X" (prorrogação de recebimento). Aditiva: uma coluna opcional e uma tabela nova.
-- O vencimento original NÃO é alterado por nada daqui: a data prometida só alimenta o fluxo projetado.

-- AlterTable
ALTER TABLE "ContaReceber" ADD COLUMN     "dataPrometida" DATE;

-- CreateTable
CREATE TABLE "ProrrogacaoReceber" (
    "id" TEXT NOT NULL,
    "contaReceberId" TEXT NOT NULL,
    "dataAnterior" DATE,
    "dataPrometida" DATE NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "ProrrogacaoReceber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProrrogacaoReceber_contaReceberId_criadoEm_idx" ON "ProrrogacaoReceber"("contaReceberId", "criadoEm");

-- AddForeignKey
ALTER TABLE "ProrrogacaoReceber" ADD CONSTRAINT "ProrrogacaoReceber_contaReceberId_fkey" FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================================
-- Parte manual (não gerada pelo Prisma)
-- =====================================================================================

-- Segurança (docs/DECISOES.md, item 15): toda tabela nova com RLS ligado e sem política,
-- e sem privilégios para os papéis públicos do Supabase (anon/authenticated).
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
