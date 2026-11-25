-- Fase 3.6a, Bloco 1: formas de pagamento alternativas na proposta.
-- Aditiva: cria um tipo, duas tabelas e colunas opcionais. Nenhuma linha existente é apagada ou perde valor;
-- as propostas aprovadas ganham, por preenchimento a partir do próprio snapshot, os campos novos do aceite.

-- CreateEnum
CREATE TYPE "ModoAjustePagamento" AS ENUM ('PERCENTUAL', 'TOTAL_DIGITADO');

-- AlterTable
ALTER TABLE "Proposta" ADD COLUMN "nomePagamentoPrincipal" TEXT,
ADD COLUMN "alternativaAprovadaId" TEXT,
ADD COLUMN "valorReferenciaAprovadoCentavos" INTEGER,
ADD COLUMN "ajusteAprovadoCentavos" INTEGER,
ADD COLUMN "acrescimoNotaAprovadoCentavos" INTEGER;

-- AlterTable
ALTER TABLE "PropostaParcela" ADD COLUMN "alternativaId" TEXT;

-- CreateTable
CREATE TABLE "AlternativaPagamento" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "nome" TEXT NOT NULL,
    "condicaoId" TEXT,
    "textoLivre" TEXT,
    "modoAjuste" "ModoAjustePagamento" NOT NULL DEFAULT 'PERCENTUAL',
    "ajustePb" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "AlternativaPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlternativaPagamentoTotal" (
    "id" TEXT NOT NULL,
    "alternativaId" TEXT NOT NULL,
    "opcaoId" TEXT NOT NULL,
    "baseCentavos" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "AlternativaPagamentoTotal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlternativaPagamento_propostaId_deletadoEm_ordem_idx" ON "AlternativaPagamento"("propostaId", "deletadoEm", "ordem");

-- CreateIndex
CREATE INDEX "AlternativaPagamentoTotal_opcaoId_idx" ON "AlternativaPagamentoTotal"("opcaoId");

-- CreateIndex
CREATE INDEX "PropostaParcela_alternativaId_idx" ON "PropostaParcela"("alternativaId");

-- AddForeignKey
ALTER TABLE "Proposta" ADD CONSTRAINT "Proposta_alternativaAprovadaId_fkey" FOREIGN KEY ("alternativaAprovadaId") REFERENCES "AlternativaPagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaParcela" ADD CONSTRAINT "PropostaParcela_alternativaId_fkey" FOREIGN KEY ("alternativaId") REFERENCES "AlternativaPagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlternativaPagamento" ADD CONSTRAINT "AlternativaPagamento_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "Proposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlternativaPagamento" ADD CONSTRAINT "AlternativaPagamento_condicaoId_fkey" FOREIGN KEY ("condicaoId") REFERENCES "CondicaoPagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlternativaPagamentoTotal" ADD CONSTRAINT "AlternativaPagamentoTotal_alternativaId_fkey" FOREIGN KEY ("alternativaId") REFERENCES "AlternativaPagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlternativaPagamentoTotal" ADD CONSTRAINT "AlternativaPagamentoTotal_opcaoId_fkey" FOREIGN KEY ("opcaoId") REFERENCES "OpcaoProposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regras que o banco garante mesmo se o código falhar.
ALTER TABLE "AlternativaPagamento" ADD CONSTRAINT "AlternativaPagamento_ajuste_no_limite" CHECK ("ajustePb" BETWEEN -5000 AND 5000);
ALTER TABLE "AlternativaPagamento" ADD CONSTRAINT "AlternativaPagamento_nome_preenchido" CHECK (btrim("nome") <> '');
ALTER TABLE "AlternativaPagamentoTotal" ADD CONSTRAINT "AlternativaPagamentoTotal_base_positiva" CHECK ("baseCentavos" > 0);
-- Um total por (forma, opção) entre os não excluídos (o editor troca por exclusão lógica + recriação).
CREATE UNIQUE INDEX "AlternativaPagamentoTotal_alternativa_opcao_unico"
  ON "AlternativaPagamentoTotal" ("alternativaId", "opcaoId")
  WHERE "deletadoEm" IS NULL;

-- Propostas JÁ aprovadas: grava referência, ajuste (zero: não havia formas alternativas) e acréscimo da nota a partir do
-- snapshot da opção aprovada, a mesma leitura que os relatórios faziam. Nenhum valor existente é alterado.
UPDATE "Proposta" p
SET "acrescimoNotaAprovadoCentavos" = COALESCE((o.elem -> 'totais' ->> 'acrescimoNotaCentavos')::int, 0),
    "valorReferenciaAprovadoCentavos" = p."valorAprovadoCentavos" - COALESCE((o.elem -> 'totais' ->> 'acrescimoNotaCentavos')::int, 0),
    "ajusteAprovadoCentavos" = 0
FROM (
  SELECT q."id", e.elem
  FROM "Proposta" q, LATERAL jsonb_array_elements(q."snapshot" -> 'opcoes') AS e(elem)
  WHERE q."status" = 'APROVADA' AND q."opcaoAprovadaId" IS NOT NULL AND q."valorAprovadoCentavos" IS NOT NULL
    AND e.elem ->> 'id' = q."opcaoAprovadaId"
) o
WHERE o."id" = p."id";

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
