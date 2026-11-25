-- Fase 3.6a, Bloco 2 (início): repasse da taxa de cartão (decisão 144).
-- Aditiva: duas colunas. O acréscimo de uma forma marcada como "taxa da maquininha" entra no Vendido e nas parcelas,
-- mas sai da margem como o repasse da nota. Propostas já aprovadas recebem zero (não havia formas alternativas).

-- AlterTable
ALTER TABLE "AlternativaPagamento" ADD COLUMN "repasseCartao" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Proposta" ADD COLUMN "repasseCartaoAprovadoCentavos" INTEGER;

UPDATE "Proposta"
SET "repasseCartaoAprovadoCentavos" = 0
WHERE "status" = 'APROVADA' AND "opcaoAprovadaId" IS NOT NULL AND "valorAprovadoCentavos" IS NOT NULL;
