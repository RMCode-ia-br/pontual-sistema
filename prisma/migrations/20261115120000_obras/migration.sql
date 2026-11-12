-- Fase 4 (Obras): etapas da obra e modelo de etapas (R7), prazo e pausas (R8), assistência e garantia (R12).
-- Nenhuma duração de etapa é gravada (os dias vêm da proposta). Parte gerada pelo Prisma + parte manual no fim.

-- CreateEnum
CREATE TYPE "TipoEtapa" AS ENUM ('MEDICAO_EXATA', 'PEDIDO_MATERIAL', 'FABRICACAO', 'INSTALACAO_ESQUADRIAS', 'MEDICAO_VIDROS', 'PEDIDO_VIDROS', 'INSTALACAO_VIDROS', 'ACABAMENTO', 'ENTREGA', 'OUTRA');

-- CreateEnum
CREATE TYPE "StatusEtapa" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'BLOQUEADA', 'DISPENSADA');

-- CreateEnum
CREATE TYPE "GrupoPrazo" AS ENUM ('MATERIAL', 'EXECUCAO', 'VIDROS_FINALIZACAO');

-- CreateEnum
CREATE TYPE "TipoProblemaChamado" AS ENUM ('REGULAGEM', 'VIDRO', 'OUTRO');

-- CreateEnum
CREATE TYPE "ClassificacaoChamado" AS ENUM ('EM_GARANTIA', 'FORA_DA_GARANTIA');

-- CreateEnum
CREATE TYPE "StatusChamado" AS ENUM ('ABERTO', 'AGENDADO', 'EM_ATENDIMENTO', 'RESOLVIDO', 'CANCELADO');

-- AlterTable
ALTER TABLE "ContaReceber" ADD COLUMN     "etapaProjetoId" TEXT;

-- AlterTable
ALTER TABLE "EventoAgenda" ADD COLUMN     "chamadoId" TEXT,
ADD COLUMN     "etapaProjetoId" TEXT;

-- AlterTable
ALTER TABLE "Projeto" ADD COLUMN     "autorizaPortfolio" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "dataConclusao" DATE,
ADD COLUMN     "dataInicioPrazo" DATE,
ADD COLUMN     "diasPausaJustificada" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "prazoDias" INTEGER,
ADD COLUMN     "prazoExecucaoDias" INTEGER,
ADD COLUMN     "prazoFinalPrometido" DATE,
ADD COLUMN     "prazoMaterialDias" INTEGER,
ADD COLUMN     "prazoModo" "ModoPrazo" NOT NULL DEFAULT 'NENHUM',
ADD COLUMN     "prazoVidrosDias" INTEGER,
ADD COLUMN     "publicadoInstagramEm" DATE,
ADD COLUMN     "tipoDiasPrazo" "TipoDias" NOT NULL DEFAULT 'UTEIS';

-- CreateTable
CREATE TABLE "ModeloEtapas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "ModeloEtapas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModeloEtapaItem" (
    "id" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "tipo" "TipoEtapa" NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "grupoPrazo" "GrupoPrazo",
    "peso" INTEGER NOT NULL DEFAULT 1,
    "liberaGatilho" "GatilhoPagamento",
    "marcoGarantia" BOOLEAN NOT NULL DEFAULT false,
    "exigeEsquadria" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "ModeloEtapaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtapaProjeto" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "tipo" "TipoEtapa" NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "grupoPrazo" "GrupoPrazo",
    "peso" INTEGER NOT NULL DEFAULT 1,
    "liberaGatilho" "GatilhoPagamento",
    "marcoGarantia" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusEtapa" NOT NULL DEFAULT 'PENDENTE',
    "responsavelId" TEXT,
    "equipeId" TEXT,
    "inicioPrevisto" DATE,
    "fimPrevisto" DATE,
    "provisoria" BOOLEAN NOT NULL DEFAULT false,
    "inicioReal" DATE,
    "fimReal" DATE,
    "motivoBloqueioId" TEXT,
    "detalheBloqueio" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "EtapaProjeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PausaProjeto" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE,
    "motivoBloqueioId" TEXT NOT NULL,
    "justificada" BOOLEAN NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "PausaProjeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chamado" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "clienteId" TEXT NOT NULL,
    "projetoId" TEXT,
    "descricao" TEXT NOT NULL,
    "tipoProblema" "TipoProblemaChamado" NOT NULL,
    "classificacaoSugerida" "ClassificacaoChamado" NOT NULL,
    "classificacao" "ClassificacaoChamado" NOT NULL,
    "motivoClassificacao" TEXT,
    "cobrarVisita" BOOLEAN NOT NULL DEFAULT false,
    "valorCobradoCentavos" INTEGER,
    "contaReceberId" TEXT,
    "status" "StatusChamado" NOT NULL DEFAULT 'ABERTO',
    "abertoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvidoEm" TIMESTAMP(3),
    "solucao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Chamado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModeloEtapaItem_modeloId_ordem_idx" ON "ModeloEtapaItem"("modeloId", "ordem");

-- CreateIndex
CREATE INDEX "EtapaProjeto_projetoId_ordem_idx" ON "EtapaProjeto"("projetoId", "ordem");

-- CreateIndex
CREATE INDEX "EtapaProjeto_status_fimPrevisto_idx" ON "EtapaProjeto"("status", "fimPrevisto");

-- CreateIndex
CREATE INDEX "EtapaProjeto_equipeId_inicioPrevisto_idx" ON "EtapaProjeto"("equipeId", "inicioPrevisto");

-- CreateIndex
CREATE INDEX "PausaProjeto_projetoId_inicio_idx" ON "PausaProjeto"("projetoId", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "Chamado_numero_key" ON "Chamado"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Chamado_contaReceberId_key" ON "Chamado"("contaReceberId");

-- CreateIndex
CREATE INDEX "Chamado_status_abertoEm_idx" ON "Chamado"("status", "abertoEm");

-- CreateIndex
CREATE INDEX "Chamado_clienteId_idx" ON "Chamado"("clienteId");

-- CreateIndex
CREATE INDEX "Chamado_projetoId_idx" ON "Chamado"("projetoId");

-- CreateIndex
CREATE INDEX "ContaReceber_etapaProjetoId_idx" ON "ContaReceber"("etapaProjetoId");

-- CreateIndex
CREATE INDEX "EventoAgenda_etapaProjetoId_idx" ON "EventoAgenda"("etapaProjetoId");

-- CreateIndex
CREATE INDEX "EventoAgenda_chamadoId_idx" ON "EventoAgenda"("chamadoId");

-- CreateIndex
CREATE INDEX "Projeto_status_prazoFinalPrometido_idx" ON "Projeto"("status", "prazoFinalPrometido");

-- AddForeignKey
ALTER TABLE "EventoAgenda" ADD CONSTRAINT "EventoAgenda_etapaProjetoId_fkey" FOREIGN KEY ("etapaProjetoId") REFERENCES "EtapaProjeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoAgenda" ADD CONSTRAINT "EventoAgenda_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "Chamado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_etapaProjetoId_fkey" FOREIGN KEY ("etapaProjetoId") REFERENCES "EtapaProjeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModeloEtapaItem" ADD CONSTRAINT "ModeloEtapaItem_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "ModeloEtapas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapaProjeto" ADD CONSTRAINT "EtapaProjeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapaProjeto" ADD CONSTRAINT "EtapaProjeto_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapaProjeto" ADD CONSTRAINT "EtapaProjeto_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapaProjeto" ADD CONSTRAINT "EtapaProjeto_motivoBloqueioId_fkey" FOREIGN KEY ("motivoBloqueioId") REFERENCES "MotivoBloqueio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PausaProjeto" ADD CONSTRAINT "PausaProjeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PausaProjeto" ADD CONSTRAINT "PausaProjeto_motivoBloqueioId_fkey" FOREIGN KEY ("motivoBloqueioId") REFERENCES "MotivoBloqueio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_contaReceberId_fkey" FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- 2) Unicidade só entre os não excluídos (o Prisma não expressa índice parcial).
-- Um único modelo de etapas é o padrão.
CREATE UNIQUE INDEX "ModeloEtapas_padrao_unico" ON "ModeloEtapas" ((true)) WHERE "padrao" AND "deletadoEm" IS NULL;
-- Em cada modelo: um item por gatilho de pagamento e um único marco de garantia.
CREATE UNIQUE INDEX "ModeloEtapaItem_gatilho_unico" ON "ModeloEtapaItem" ("modeloId", "liberaGatilho")
  WHERE "liberaGatilho" IS NOT NULL AND "deletadoEm" IS NULL;
CREATE UNIQUE INDEX "ModeloEtapaItem_marco_garantia_unico" ON "ModeloEtapaItem" ("modeloId")
  WHERE "marcoGarantia" AND "deletadoEm" IS NULL;
-- Em cada obra: uma posição por etapa e uma etapa de cada tipo (exceto "outra"). Também protege contra
-- a geração das etapas em duplicidade por aprovações simultâneas.
CREATE UNIQUE INDEX "EtapaProjeto_ordem_unica" ON "EtapaProjeto" ("projetoId", "ordem") WHERE "deletadoEm" IS NULL;
CREATE UNIQUE INDEX "EtapaProjeto_tipo_unico" ON "EtapaProjeto" ("projetoId", "tipo")
  WHERE "tipo" <> 'OUTRA' AND "deletadoEm" IS NULL;

-- 3) Coerência dos dados.
ALTER TABLE "ModeloEtapaItem" ADD CONSTRAINT "ModeloEtapaItem_valores_validos" CHECK (
  "peso" >= 1
  AND ("liberaGatilho" IS NULL OR "liberaGatilho" IN ('ENTREGA_MATERIAL', 'ENTREGA_E_INSTALACAO'))
);

ALTER TABLE "EtapaProjeto" ADD CONSTRAINT "EtapaProjeto_valores_validos" CHECK (
  "peso" >= 1
  AND ("liberaGatilho" IS NULL OR "liberaGatilho" IN ('ENTREGA_MATERIAL', 'ENTREGA_E_INSTALACAO'))
  AND ("inicioPrevisto" IS NULL OR "fimPrevisto" IS NULL OR "fimPrevisto" >= "inicioPrevisto")
  AND ("inicioReal" IS NULL OR "fimReal" IS NULL OR "fimReal" >= "inicioReal")
  -- Bloqueada sempre tem motivo (R7).
  AND ("status" <> 'BLOQUEADA' OR "motivoBloqueioId" IS NOT NULL)
);

ALTER TABLE "PausaProjeto" ADD CONSTRAINT "PausaProjeto_periodo_valido" CHECK ("fim" IS NULL OR "fim" >= "inicio");

ALTER TABLE "Projeto" ADD CONSTRAINT "Projeto_prazo_valido" CHECK (
  ("prazoDias" IS NULL OR "prazoDias" BETWEEN 0 AND 3650)
  AND ("prazoMaterialDias" IS NULL OR "prazoMaterialDias" BETWEEN 0 AND 3650)
  AND ("prazoExecucaoDias" IS NULL OR "prazoExecucaoDias" BETWEEN 0 AND 3650)
  AND ("prazoVidrosDias" IS NULL OR "prazoVidrosDias" BETWEEN 0 AND 3650)
  AND "diasPausaJustificada" >= 0
);

ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_valores_validos" CHECK (
  "numero" > 0 AND ("valorCobradoCentavos" IS NULL OR "valorCobradoCentavos" >= 0)
);
