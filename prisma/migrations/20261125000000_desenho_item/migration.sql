-- Fase 3.6b-1: desenho personalizado no item da proposta (imagem colada ou enviada).
-- Aditiva: três colunas opcionais no Anexo (hash e dimensões da imagem processada) e a referência opcional do item.

ALTER TABLE "Anexo" ADD COLUMN "sha256" TEXT,
ADD COLUMN "larguraPx" INTEGER,
ADD COLUMN "alturaPx" INTEGER;

-- Dimensões, quando existem, são positivas (índice de segurança contra dado corrompido).
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_dimensoes_positivas"
  CHECK (("larguraPx" IS NULL OR "larguraPx" > 0) AND ("alturaPx" IS NULL OR "alturaPx" > 0));

ALTER TABLE "ItemProposta" ADD COLUMN "desenhoAnexoId" TEXT;

CREATE INDEX "ItemProposta_desenhoAnexoId_idx" ON "ItemProposta"("desenhoAnexoId");

ALTER TABLE "ItemProposta" ADD CONSTRAINT "ItemProposta_desenhoAnexoId_fkey"
  FOREIGN KEY ("desenhoAnexoId") REFERENCES "Anexo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Segurança (docs/DECISOES.md, item 15): toda tabela com RLS ligado e sem política,
-- e sem privilégios para os papéis públicos do Supabase (anon/authenticated). Idempotente; não há tabela nova.
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
