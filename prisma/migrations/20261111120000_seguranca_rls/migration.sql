-- Fecha a API de dados do Supabase (PostgREST) para as tabelas do sistema.
--
-- Por padrão o Supabase expõe o schema "public" aos papéis "anon" e "authenticated" (chave pública
-- do projeto). Sem RLS e com privilégios abertos, quem tivesse a chave "anon" poderia LER (ex.: hash
-- de senha em "Usuario") e GRAVAR dados sem passar pelo sistema. O app NUNCA usa essa API: ele se
-- conecta direto como o dono das tabelas (papel postgres), que ignora RLS. Então:
--   1) liga RLS em todas as tabelas, sem nenhuma política (nega tudo a quem não é o dono);
--   2) retira os privilégios de anon/authenticated (defesa em profundidade);
--   3) faz o mesmo para tabelas criadas no futuro (privilégios padrão).
-- Toda tabela nova ainda precisa de "ENABLE ROW LEVEL SECURITY" na sua migração; o teste
-- tests/integration/seguranca-banco.test.ts falha se alguma ficar sem.
--
-- Os papéis só existem no Supabase; em um PostgreSQL comum (ex.: restauração local) só o RLS é aplicado.

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
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', papel);
    END IF;
  END LOOP;
END
$$;
