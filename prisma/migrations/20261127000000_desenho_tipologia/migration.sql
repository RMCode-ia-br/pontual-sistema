-- Fase 3.6b-3: desenho personalizado na tipologia e "salvar o desenho do item como nova tipologia".
-- Aditiva: quatro colunas em "Tipologia" (referência da imagem, configuração, marca de revisão e item de origem),
-- dois índices e duas chaves estrangeiras. Nenhuma tabela nova; nenhum dado existente muda.

ALTER TABLE "Tipologia" ADD COLUMN     "criadaDeItemId" TEXT,
ADD COLUMN     "desenhoAnexoId" TEXT,
ADD COLUMN     "desenhoConfig" JSONB,
ADD COLUMN     "revisarCadastro" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Tipologia_desenhoAnexoId_idx" ON "Tipologia"("desenhoAnexoId");

CREATE INDEX "Tipologia_criadaDeItemId_idx" ON "Tipologia"("criadaDeItemId");

ALTER TABLE "Tipologia" ADD CONSTRAINT "Tipologia_desenhoAnexoId_fkey" FOREIGN KEY ("desenhoAnexoId") REFERENCES "Anexo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Tipologia" ADD CONSTRAINT "Tipologia_criadaDeItemId_fkey" FOREIGN KEY ("criadaDeItemId") REFERENCES "ItemProposta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
