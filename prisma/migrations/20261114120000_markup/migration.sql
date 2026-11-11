-- Fase 3: o preço de composição passa a ser MARKUP SOBRE O CUSTO (custo × (1 + markup)), regra do dono
-- (2026-11-13), em vez de margem por dentro. Estruturas novas; a migração anterior (propostas) já estava aplicada.

-- CreateEnum
CREATE TYPE "CategoriaMarkup" AS ENUM ('PADRAO', 'VIDRO_TEMPERADO');

-- Renomeia (sem perder dados): margem → markup, nas duas tabelas.
ALTER TABLE "Proposta" RENAME COLUMN "margemPb" TO "markupPb";
ALTER TABLE "ItemProposta" RENAME COLUMN "margemPb" TO "markupPb";

-- Configurações: markup padrão (80%) e da categoria vidro temperado/guarda-corpo (100%), editáveis.
ALTER TABLE "ConfiguracaoEmpresa"
  ADD COLUMN "markupPadraoPb" INTEGER NOT NULL DEFAULT 8000,
  ADD COLUMN "markupVidroTemperadoPb" INTEGER NOT NULL DEFAULT 10000;

-- Tipologia: categoria de markup (qual dos dois padrões vale para os itens).
ALTER TABLE "Tipologia" ADD COLUMN "categoriaMarkup" "CategoriaMarkup" NOT NULL DEFAULT 'PADRAO';

-- Coerência: markup de 0% a 1.000% (100.000 pontos-base). Recria as restrições com o novo limite.
ALTER TABLE "ItemProposta" DROP CONSTRAINT "ItemProposta_valores_positivos";
ALTER TABLE "ItemProposta" ADD CONSTRAINT "ItemProposta_valores_positivos" CHECK (
  "precoTotalCentavos" >= 0
  AND ("valorManualCentavos" IS NULL OR "valorManualCentavos" >= 0)
  AND ("custoEstimadoCentavos" IS NULL OR "custoEstimadoCentavos" >= 0)
  AND ("markupPb" IS NULL OR ("markupPb" >= 0 AND "markupPb" <= 100000))
);

ALTER TABLE "Proposta" DROP CONSTRAINT "Proposta_percentuais_validos";
ALTER TABLE "Proposta" ADD CONSTRAINT "Proposta_percentuais_validos" CHECK (
  "revisao" >= 0
  AND "acrescimoNotaPb" BETWEEN 0 AND 10000
  AND "comissaoArquitetoPb" BETWEEN 0 AND 10000
  AND "comissaoIndicacaoPb" BETWEEN 0 AND 10000
  AND ("markupPb" IS NULL OR ("markupPb" >= 0 AND "markupPb" <= 100000))
);

ALTER TABLE "ConfiguracaoEmpresa" ADD CONSTRAINT "ConfiguracaoEmpresa_markup_valido" CHECK (
  "markupPadraoPb" BETWEEN 0 AND 100000 AND "markupVidroTemperadoPb" BETWEEN 0 AND 100000
);
