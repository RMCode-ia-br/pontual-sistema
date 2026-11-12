-- Fase 7 (M1): o limite do "recebido com nota fiscal nos últimos 12 meses" passa a nascer VAZIO.
-- A coluna existia sem uso, obrigatória e com R$ 4.800.000,00 de padrão (desenho antigo do Simples). Agora é opcional e sem padrão;
-- o valor antigo (o padrão que nunca foi informado por ninguém) vira vazio. Nada que já esteja preenchido com outro valor é tocado.
ALTER TABLE "ConfiguracaoEmpresa" ALTER COLUMN "limiteSimplesCentavos" DROP NOT NULL;
ALTER TABLE "ConfiguracaoEmpresa" ALTER COLUMN "limiteSimplesCentavos" DROP DEFAULT;
UPDATE "ConfiguracaoEmpresa" SET "limiteSimplesCentavos" = NULL WHERE "limiteSimplesCentavos" = 480000000;
