-- Busca sem acento nem maiúscula (Fase 7B, Bloco 8) nas contas a receber, contas a pagar e chamados de assistência.
-- A extensão pg_trgm, a extensão unaccent e a função public.f_unaccent JÁ EXISTEM no banco (criadas na migração "cadastros"); aqui só entram
-- os índices trigram das três tabelas cujo texto ainda não tinha índice. As expressões são EXATAMENTE as usadas por
-- src/modules/busca/ids-por-busca.ts (o Postgres só usa o índice se a expressão for a mesma).
-- Não muda dado nenhum e não bloqueia leitura de forma relevante (tabelas pequenas); IF NOT EXISTS torna a migração repetível.
CREATE INDEX IF NOT EXISTS "ContaReceber_descricao_busca_idx" ON "ContaReceber"
  USING gin (public.f_unaccent(lower("descricao")) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ContaPagar_descricao_favorecido_busca_idx" ON "ContaPagar"
  USING gin (public.f_unaccent(lower("descricao" || ' ' || coalesce("favorecido", ''))) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Chamado_descricao_busca_idx" ON "Chamado"
  USING gin (public.f_unaccent(lower("descricao")) gin_trgm_ops);
