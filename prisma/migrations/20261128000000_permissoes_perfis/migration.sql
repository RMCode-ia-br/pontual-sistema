-- Fase 7C: permissões por perfil e por módulo (decisões 176 a 184). Migração ADITIVA.
-- Os valores novos do enum só nascem aqui; NADA nesta migração os usa (PostgreSQL não deixa usar um valor
-- de enum na mesma transação em que ele foi criado). Os usuários atuais continuam ADMIN: nenhum UPDATE.

-- AlterEnum
ALTER TYPE "PapelUsuario" ADD VALUE 'ESCRITORIO';
ALTER TYPE "PapelUsuario" ADD VALUE 'CAMPO';

-- AlterTable
-- ajustesPermissao: ajustes por módulo sobre o perfil (vazio = perfil puro).
-- papel perde o padrão: usuário novo só nasce escolhendo um perfil.
ALTER TABLE "Usuario" ADD COLUMN     "ajustesPermissao" JSONB,
ALTER COLUMN "papel" DROP DEFAULT;

-- Sem tabela nova: RLS e REVOKE já cobrem "Usuario" (tests/integration/seguranca-banco.test.ts).
