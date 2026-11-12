-- Fase 4, Bloco 0: "Sair" passa a revogar a sessão do aparelho (docs/DECISOES.md, item 92).
-- O proxy renova o cookie de sessão em toda requisição; uma resposta atrasada devolvia o cookie depois do
-- logout e, como o token não era revogado, a sessão voltava. O `sid` do JWT vai para esta tabela ao sair.

-- CreateTable
CREATE TABLE "SessaoRevogada" (
    "sid" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessaoRevogada_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE INDEX "SessaoRevogada_expiraEm_idx" ON "SessaoRevogada"("expiraEm");

-- CreateIndex
CREATE INDEX "SessaoRevogada_usuarioId_idx" ON "SessaoRevogada"("usuarioId");

-- AddForeignKey
ALTER TABLE "SessaoRevogada" ADD CONSTRAINT "SessaoRevogada_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Segurança (docs/DECISOES.md, item 15): RLS ligado e sem política, sem privilégios para anon/authenticated.
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
