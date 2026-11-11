-- Fase 2 (Comercial: funil e agenda). Gerado com `prisma migrate diff` + parte manual ao final.

-- Antes das chaves estrangeiras: nenhum Projeto existia até aqui, então qualquer `projetoId`
-- já gravado em Tarefa/Interacao seria órfão (nenhuma tela o preenchia). Zera para a FK poder nascer.
UPDATE "Tarefa" SET "projetoId" = NULL WHERE "projetoId" IS NOT NULL;
UPDATE "Interacao" SET "projetoId" = NULL WHERE "projetoId" IS NOT NULL;

-- CreateEnum
CREATE TYPE "StatusProjeto" AS ENUM ('NOVO_LEAD', 'VISITA_AGENDADA', 'ELABORANDO_PROPOSTA', 'PROPOSTA_ENVIADA', 'NEGOCIACAO', 'APROVADO', 'EM_EXECUCAO', 'CONCLUIDO', 'PERDIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PorteProjeto" AS ENUM ('PEQUENO', 'MEDIO', 'GRANDE');

-- CreateEnum
CREATE TYPE "InteresseProjeto" AS ENUM ('COMPRA_REAL', 'SO_ORCAMENTO_ESPECULACAO', 'INDEFINIDO');

-- CreateEnum
CREATE TYPE "TemperaturaProjeto" AS ENUM ('FRIA', 'MORNA', 'QUENTE');

-- CreateEnum
CREATE TYPE "FaseObraCliente" AS ENUM ('PLANTA', 'EM_CONSTRUCAO', 'PRONTA');

-- CreateEnum
CREATE TYPE "TipoServico" AS ENUM ('JANELA', 'PORTA', 'BOX', 'GUARDA_CORPO', 'FECHAMENTO_SACADA', 'PORTAO', 'PERGOLADO', 'ESPELHO', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoEventoAgenda" AS ENUM ('VISITA_TECNICA', 'MEDICAO_EXATA', 'MEDICAO_VIDROS', 'INSTALACAO', 'ENTREGA', 'ASSISTENCIA', 'REUNIAO');

-- CreateEnum
CREATE TYPE "StatusEventoAgenda" AS ENUM ('AGENDADO', 'CONFIRMADO', 'REALIZADO', 'REMARCADO', 'CANCELADO', 'NAO_COMPARECEU');

-- AlterTable
ALTER TABLE "ConfiguracaoEmpresa" ADD COLUMN     "diasPedidoAvaliacao" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "diasSemRetornoProposta" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "porteGrandeMinimoCentavos" INTEGER,
ADD COLUMN     "porteMedioMinimoCentavos" INTEGER;

-- CreateTable
CREATE TABLE "Projeto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "enderecoObraId" TEXT,
    "arquitetoId" TEXT,
    "construtoraId" TEXT,
    "responsavelId" TEXT,
    "status" "StatusProjeto" NOT NULL DEFAULT 'NOVO_LEAD',
    "tiposServico" "TipoServico"[],
    "origem" "OrigemContato",
    "origemDetalhe" TEXT,
    "canal" TEXT,
    "porte" "PorteProjeto",
    "interesse" "InteresseProjeto" NOT NULL DEFAULT 'INDEFINIDO',
    "temperatura" "TemperaturaProjeto",
    "faseDaObra" "FaseObraCliente",
    "investimentoPrevistoCentavos" INTEGER,
    "valorEstimadoCentavos" INTEGER,
    "prazoDesejado" TEXT,
    "motivoPerdaId" TEXT,
    "motivoPerdaDetalhe" TEXT,
    "concorrente" TEXT,
    "resumoAtendimento" TEXT,
    "observacoes" TEXT,
    "perdidoEm" TIMESTAMP(3),
    "ultimaMovimentacaoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoFaseProjeto" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "de" "StatusProjeto",
    "para" "StatusProjeto" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" TEXT,

    CONSTRAINT "HistoricoFaseProjeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoAgenda" (
    "id" TEXT NOT NULL,
    "tipo" "TipoEventoAgenda" NOT NULL,
    "titulo" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "responsavelId" TEXT,
    "equipeId" TEXT,
    "clienteId" TEXT,
    "projetoId" TEXT,
    "enderecoId" TEXT,
    "local" TEXT,
    "status" "StatusEventoAgenda" NOT NULL DEFAULT 'AGENDADO',
    "lembreteMin" INTEGER,
    "observacoes" TEXT,
    "realizadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "EventoAgenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedidaRascunho" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "eventoId" TEXT,
    "ambiente" TEXT,
    "tipologia" TEXT,
    "larguraMm" INTEGER,
    "alturaMm" INTEGER,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "observacao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "MedidaRascunho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedAgenda" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nome" TEXT,
    "tokenHash" TEXT NOT NULL,
    "ultimoAcessoEm" TIMESTAMP(3),
    "revogadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "FeedAgenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContadorSequencia" (
    "chave" TEXT NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContadorSequencia_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE UNIQUE INDEX "Projeto_codigo_key" ON "Projeto"("codigo");

-- CreateIndex
CREATE INDEX "Projeto_deletadoEm_status_ultimaMovimentacaoEm_idx" ON "Projeto"("deletadoEm", "status", "ultimaMovimentacaoEm");

-- CreateIndex
CREATE INDEX "Projeto_clienteId_idx" ON "Projeto"("clienteId");

-- CreateIndex
CREATE INDEX "Projeto_responsavelId_status_idx" ON "Projeto"("responsavelId", "status");

-- CreateIndex
CREATE INDEX "Projeto_origem_idx" ON "Projeto"("origem");

-- CreateIndex
CREATE INDEX "Projeto_arquitetoId_idx" ON "Projeto"("arquitetoId");

-- CreateIndex
CREATE INDEX "Projeto_construtoraId_idx" ON "Projeto"("construtoraId");

-- CreateIndex
CREATE INDEX "Projeto_criadoEm_idx" ON "Projeto"("criadoEm");

-- CreateIndex
CREATE INDEX "HistoricoFaseProjeto_projetoId_criadoEm_idx" ON "HistoricoFaseProjeto"("projetoId", "criadoEm");

-- CreateIndex
CREATE INDEX "HistoricoFaseProjeto_para_criadoEm_idx" ON "HistoricoFaseProjeto"("para", "criadoEm");

-- CreateIndex
CREATE INDEX "EventoAgenda_deletadoEm_inicio_idx" ON "EventoAgenda"("deletadoEm", "inicio");

-- CreateIndex
CREATE INDEX "EventoAgenda_responsavelId_inicio_idx" ON "EventoAgenda"("responsavelId", "inicio");

-- CreateIndex
CREATE INDEX "EventoAgenda_equipeId_inicio_idx" ON "EventoAgenda"("equipeId", "inicio");

-- CreateIndex
CREATE INDEX "EventoAgenda_projetoId_idx" ON "EventoAgenda"("projetoId");

-- CreateIndex
CREATE INDEX "EventoAgenda_clienteId_idx" ON "EventoAgenda"("clienteId");

-- CreateIndex
CREATE INDEX "EventoAgenda_status_inicio_idx" ON "EventoAgenda"("status", "inicio");

-- CreateIndex
CREATE INDEX "MedidaRascunho_projetoId_deletadoEm_ordem_idx" ON "MedidaRascunho"("projetoId", "deletadoEm", "ordem");

-- CreateIndex
CREATE INDEX "MedidaRascunho_eventoId_idx" ON "MedidaRascunho"("eventoId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedAgenda_tokenHash_key" ON "FeedAgenda"("tokenHash");

-- CreateIndex
CREATE INDEX "FeedAgenda_usuarioId_revogadoEm_idx" ON "FeedAgenda"("usuarioId", "revogadoEm");

-- AddForeignKey
ALTER TABLE "Interacao" ADD CONSTRAINT "Interacao_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Projeto" ADD CONSTRAINT "Projeto_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Projeto" ADD CONSTRAINT "Projeto_enderecoObraId_fkey" FOREIGN KEY ("enderecoObraId") REFERENCES "EnderecoCliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Projeto" ADD CONSTRAINT "Projeto_arquitetoId_fkey" FOREIGN KEY ("arquitetoId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Projeto" ADD CONSTRAINT "Projeto_construtoraId_fkey" FOREIGN KEY ("construtoraId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Projeto" ADD CONSTRAINT "Projeto_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Projeto" ADD CONSTRAINT "Projeto_motivoPerdaId_fkey" FOREIGN KEY ("motivoPerdaId") REFERENCES "MotivoPerda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoFaseProjeto" ADD CONSTRAINT "HistoricoFaseProjeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoAgenda" ADD CONSTRAINT "EventoAgenda_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoAgenda" ADD CONSTRAINT "EventoAgenda_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoAgenda" ADD CONSTRAINT "EventoAgenda_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoAgenda" ADD CONSTRAINT "EventoAgenda_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoAgenda" ADD CONSTRAINT "EventoAgenda_enderecoId_fkey" FOREIGN KEY ("enderecoId") REFERENCES "EnderecoCliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedidaRascunho" ADD CONSTRAINT "MedidaRascunho_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedidaRascunho" ADD CONSTRAINT "MedidaRascunho_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "EventoAgenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedAgenda" ADD CONSTRAINT "FeedAgenda_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- =====================================================================================
-- Parte manual (não gerada pelo Prisma)
-- =====================================================================================

-- 1) Segurança (docs/DECISOES.md, item 15): toda tabela nova com RLS ligado e sem política,
--    e sem privilégios para os papéis públicos do Supabase (anon/authenticated).
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

-- 2) Coerência dos dados na própria base (a aplicação valida, o banco garante).
ALTER TABLE "EventoAgenda" ADD CONSTRAINT "EventoAgenda_fim_depois_do_inicio" CHECK ("fim" > "inicio");
ALTER TABLE "EventoAgenda" ADD CONSTRAINT "EventoAgenda_lembrete_positivo" CHECK ("lembreteMin" IS NULL OR "lembreteMin" > 0);
ALTER TABLE "MedidaRascunho" ADD CONSTRAINT "MedidaRascunho_medidas_positivas" CHECK (
  ("larguraMm" IS NULL OR "larguraMm" > 0) AND ("alturaMm" IS NULL OR "alturaMm" > 0) AND "quantidade" > 0
);
ALTER TABLE "Projeto" ADD CONSTRAINT "Projeto_valores_positivos" CHECK (
  ("investimentoPrevistoCentavos" IS NULL OR "investimentoPrevistoCentavos" >= 0)
  AND ("valorEstimadoCentavos" IS NULL OR "valorEstimadoCentavos" >= 0)
);
ALTER TABLE "ConfiguracaoEmpresa" ADD CONSTRAINT "ConfiguracaoEmpresa_dias_followup_positivos" CHECK (
  "diasSemRetornoProposta" > 0 AND "diasPedidoAvaliacao" >= 0
);

-- 3) Busca sem acento e tolerante a erros de digitação em projetos (mesma expressão das consultas:
--    `public.f_unaccent(lower(...))`, ver docs/DECISOES.md, item 30).
CREATE INDEX "Projeto_busca_trgm" ON "Projeto"
  USING gin (public.f_unaccent(lower("codigo" || ' ' || "titulo")) gin_trgm_ops);
