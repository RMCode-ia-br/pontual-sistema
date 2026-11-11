-- CreateEnum
CREATE TYPE "TipoCobranca" AS ENUM ('POR_M2', 'POR_UNIDADE', 'POR_METRO_LINEAR');

-- CreateEnum
CREATE TYPE "ModoPreco" AS ENUM ('MANUAL', 'TABELA', 'COMPOSICAO');

-- CreateEnum
CREATE TYPE "TipoDesenho" AS ENUM ('JANELA_CORRER', 'PORTA_CORRER', 'BASCULA', 'PAINEL_FIXO', 'PORTA_GIRO', 'BOX_FRONTAL', 'GUARDA_CORPO', 'FECHAMENTO_SACADA', 'PORTAO', 'PERGOLADO', 'ESPELHO', 'GENERICO');

-- CreateEnum
CREATE TYPE "PapelMaoDeObra" AS ENUM ('FABRICA', 'INSTALACAO');

-- CreateEnum
CREATE TYPE "BaseMaoDeObra" AS ENUM ('HORAS_POR_M2', 'HORAS_POR_UNIDADE');

-- CreateEnum
CREATE TYPE "StatusProposta" AS ENUM ('RASCUNHO', 'ENVIADA', 'APROVADA', 'RECUSADA', 'EXPIRADA', 'SUBSTITUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ModoPrazo" AS ENUM ('NENHUM', 'TOTAL', 'POR_ETAPA');

-- CreateEnum
CREATE TYPE "FormaAceite" AS ENUM ('WHATSAPP', 'EMAIL', 'ASSINATURA', 'VERBAL');

-- CreateEnum
CREATE TYPE "GatilhoPagamento" AS ENUM ('CONFIRMACAO', 'ENTREGA_MATERIAL', 'ENTREGA_E_INSTALACAO', 'DATA_FIXA', 'DIAS_APOS_APROVACAO');

-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('PIX', 'TRANSFERENCIA', 'ESPECIE', 'CARTAO_CREDITO', 'BOLETO');

-- CreateEnum
CREATE TYPE "StatusContaReceber" AS ENUM ('AGUARDANDO_GATILHO', 'ABERTA', 'PARCIAL', 'PAGA', 'CANCELADA');

-- AlterTable
ALTER TABLE "ConfiguracaoEmpresa" ADD COLUMN     "acrescimoNotaPb" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN     "anoNumeracaoProposta" INTEGER;

-- AlterTable
ALTER TABLE "Projeto" ADD COLUMN     "dataFechamento" TIMESTAMP(3),
ADD COLUMN     "valorFechadoCentavos" INTEGER;

-- CreateTable
CREATE TABLE "Tipologia" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" "TipoServico" NOT NULL DEFAULT 'OUTRO',
    "tipoDesenho" "TipoDesenho" NOT NULL DEFAULT 'GENERICO',
    "opcoesFolhas" INTEGER[],
    "templateDescricao" TEXT NOT NULL,
    "revisarTexto" BOOLEAN NOT NULL DEFAULT false,
    "cobrancaPadrao" "TipoCobranca" NOT NULL DEFAULT 'POR_M2',
    "exigeEsquadria" BOOLEAN NOT NULL DEFAULT true,
    "exemplo" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Tipologia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComposicaoInsumo" (
    "id" TEXT NOT NULL,
    "tipologiaId" TEXT NOT NULL,
    "produtoId" TEXT,
    "descricao" TEXT,
    "unidade" "UnidadeProduto" NOT NULL,
    "formulaQuantidade" TEXT NOT NULL,
    "perdaPb" INTEGER NOT NULL DEFAULT 0,
    "custoUnitarioCentavos" INTEGER,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "ComposicaoInsumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComposicaoMaoDeObra" (
    "id" TEXT NOT NULL,
    "tipologiaId" TEXT NOT NULL,
    "papel" "PapelMaoDeObra" NOT NULL,
    "base" "BaseMaoDeObra" NOT NULL,
    "horasCentesimos" INTEGER NOT NULL,
    "custoHoraCentavos" INTEGER,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "ComposicaoMaoDeObra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TabelaPreco" (
    "id" TEXT NOT NULL,
    "tipologiaId" TEXT NOT NULL,
    "linhaId" TEXT,
    "acabamentoId" TEXT,
    "tipoVidroId" TEXT,
    "espessuraVidroMm" INTEGER,
    "cobranca" "TipoCobranca" NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "vigenciaInicio" DATE,
    "vigenciaFim" DATE,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "TabelaPreco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CondicaoPagamento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "textoLivre" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "CondicaoPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CondicaoParcela" (
    "id" TEXT NOT NULL,
    "condicaoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "percentualPb" INTEGER NOT NULL,
    "gatilho" "GatilhoPagamento" NOT NULL,
    "forma" "FormaPagamento",
    "diasApos" INTEGER,
    "parcelasCartao" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "CondicaoParcela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposta" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "numeroSequencial" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "revisao" INTEGER NOT NULL DEFAULT 0,
    "revisaoDeId" TEXT,
    "parte" TEXT,
    "status" "StatusProposta" NOT NULL DEFAULT 'RASCUNHO',
    "data" DATE NOT NULL,
    "consultorNome" TEXT,
    "consultorCargo" TEXT,
    "clienteNome" TEXT NOT NULL,
    "clienteDocumento" TEXT,
    "clienteContato" TEXT,
    "clienteTelefone" TEXT,
    "clienteEmail" TEXT,
    "enderecoObra" TEXT,
    "tituloEscopo" TEXT NOT NULL DEFAULT 'ESCOPO DO SERVIÇO',
    "comNotaFiscal" BOOLEAN NOT NULL DEFAULT false,
    "acrescimoNotaPb" INTEGER NOT NULL DEFAULT 500,
    "comissaoArquitetoPb" INTEGER NOT NULL DEFAULT 0,
    "comissaoIndicacaoPb" INTEGER NOT NULL DEFAULT 0,
    "margemPb" INTEGER,
    "modoPrazo" "ModoPrazo" NOT NULL DEFAULT 'NENHUM',
    "prazoTotalMinDias" INTEGER,
    "prazoTotalMaxDias" INTEGER,
    "prazoMaterialDias" INTEGER,
    "prazoExecucaoDias" INTEGER,
    "prazoVidrosDias" INTEGER,
    "validadeTexto" TEXT,
    "validadeAte" DATE,
    "validadeEncerradaPorReajuste" BOOLEAN NOT NULL DEFAULT false,
    "condicaoId" TEXT,
    "condicaoTextoLivre" TEXT,
    "dadosPagamento" TEXT,
    "notas" TEXT[],
    "exibirValorPorItem" BOOLEAN NOT NULL DEFAULT true,
    "descricoesMaiusculas" BOOLEAN NOT NULL DEFAULT true,
    "observacoesInternas" TEXT,
    "enviadaEm" TIMESTAMP(3),
    "snapshot" JSONB,
    "aceitaEm" TIMESTAMP(3),
    "formaAceite" "FormaAceite",
    "aceiteObservacao" TEXT,
    "aceiteAnexoId" TEXT,
    "opcaoAprovadaId" TEXT,
    "valorAprovadoCentavos" INTEGER,
    "recusadaEm" TIMESTAMP(3),
    "motivoPerdaId" TEXT,
    "motivoRecusaDetalhe" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Proposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpcaoProposta" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "descontoCentavos" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "OpcaoProposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoProposta" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "GrupoProposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemProposta" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "opcaoId" TEXT NOT NULL,
    "grupoId" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "tipologiaId" TEXT,
    "linhaId" TEXT,
    "acabamentoId" TEXT,
    "tipoVidroId" TEXT,
    "espessuraVidroMm" INTEGER,
    "folhas" INTEGER,
    "faces" INTEGER,
    "torresCm" INTEGER,
    "descricao" TEXT NOT NULL,
    "descricaoEditada" BOOLEAN NOT NULL DEFAULT false,
    "local" TEXT,
    "observacoes" TEXT,
    "desenhoConfig" JSONB,
    "modoPreco" "ModoPreco" NOT NULL DEFAULT 'MANUAL',
    "cobranca" "TipoCobranca",
    "valorManualCentavos" INTEGER,
    "precoTotalCentavos" INTEGER NOT NULL DEFAULT 0,
    "custoEstimadoCentavos" INTEGER,
    "margemPb" INTEGER,
    "calculadoEm" TIMESTAMP(3),
    "avisoPreco" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "ItemProposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPropostaMedida" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "larguraMm" INTEGER NOT NULL,
    "alturaMm" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "local" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "ItemPropostaMedida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropostaParcela" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "percentualPb" INTEGER NOT NULL,
    "gatilho" "GatilhoPagamento" NOT NULL,
    "forma" "FormaPagamento",
    "diasApos" INTEGER,
    "dataFixa" DATE,
    "parcelasCartao" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "PropostaParcela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaReceber" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "propostaId" TEXT,
    "clienteId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "percentualPb" INTEGER,
    "vencimento" DATE,
    "gatilho" "GatilhoPagamento",
    "forma" "FormaPagamento",
    "parcelasCartao" INTEGER,
    "status" "StatusContaReceber" NOT NULL DEFAULT 'ABERTA',
    "comNotaFiscal" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "ContaReceber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tipologia_deletadoEm_ativo_ordem_idx" ON "Tipologia"("deletadoEm", "ativo", "ordem");

-- CreateIndex
CREATE INDEX "ComposicaoInsumo_tipologiaId_deletadoEm_ordem_idx" ON "ComposicaoInsumo"("tipologiaId", "deletadoEm", "ordem");

-- CreateIndex
CREATE INDEX "ComposicaoInsumo_produtoId_idx" ON "ComposicaoInsumo"("produtoId");

-- CreateIndex
CREATE INDEX "ComposicaoMaoDeObra_tipologiaId_deletadoEm_ordem_idx" ON "ComposicaoMaoDeObra"("tipologiaId", "deletadoEm", "ordem");

-- CreateIndex
CREATE INDEX "TabelaPreco_tipologiaId_deletadoEm_ativo_idx" ON "TabelaPreco"("tipologiaId", "deletadoEm", "ativo");

-- CreateIndex
CREATE INDEX "CondicaoPagamento_deletadoEm_ativo_ordem_idx" ON "CondicaoPagamento"("deletadoEm", "ativo", "ordem");

-- CreateIndex
CREATE INDEX "CondicaoParcela_condicaoId_deletadoEm_ordem_idx" ON "CondicaoParcela"("condicaoId", "deletadoEm", "ordem");

-- CreateIndex
CREATE INDEX "Proposta_projetoId_deletadoEm_status_idx" ON "Proposta"("projetoId", "deletadoEm", "status");

-- CreateIndex
CREATE INDEX "Proposta_status_enviadaEm_idx" ON "Proposta"("status", "enviadaEm");

-- CreateIndex
CREATE INDEX "Proposta_numeroSequencial_idx" ON "Proposta"("numeroSequencial");

-- CreateIndex
CREATE INDEX "Proposta_criadoEm_idx" ON "Proposta"("criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Proposta_numero_revisao_key" ON "Proposta"("numero", "revisao");

-- CreateIndex
CREATE INDEX "OpcaoProposta_propostaId_deletadoEm_ordem_idx" ON "OpcaoProposta"("propostaId", "deletadoEm", "ordem");

-- CreateIndex
CREATE INDEX "GrupoProposta_propostaId_deletadoEm_ordem_idx" ON "GrupoProposta"("propostaId", "deletadoEm", "ordem");

-- CreateIndex
CREATE INDEX "ItemProposta_propostaId_deletadoEm_ordem_idx" ON "ItemProposta"("propostaId", "deletadoEm", "ordem");

-- CreateIndex
CREATE INDEX "ItemProposta_opcaoId_deletadoEm_ordem_idx" ON "ItemProposta"("opcaoId", "deletadoEm", "ordem");

-- CreateIndex
CREATE INDEX "ItemProposta_grupoId_idx" ON "ItemProposta"("grupoId");

-- CreateIndex
CREATE INDEX "ItemProposta_tipologiaId_idx" ON "ItemProposta"("tipologiaId");

-- CreateIndex
CREATE INDEX "ItemPropostaMedida_itemId_deletadoEm_ordem_idx" ON "ItemPropostaMedida"("itemId", "deletadoEm", "ordem");

-- CreateIndex
CREATE INDEX "PropostaParcela_propostaId_deletadoEm_ordem_idx" ON "PropostaParcela"("propostaId", "deletadoEm", "ordem");

-- CreateIndex
CREATE INDEX "ContaReceber_projetoId_deletadoEm_idx" ON "ContaReceber"("projetoId", "deletadoEm");

-- CreateIndex
CREATE INDEX "ContaReceber_status_vencimento_idx" ON "ContaReceber"("status", "vencimento");

-- CreateIndex
CREATE INDEX "ContaReceber_clienteId_idx" ON "ContaReceber"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "ContaReceber_propostaId_ordem_key" ON "ContaReceber"("propostaId", "ordem");

-- AddForeignKey
ALTER TABLE "ComposicaoInsumo" ADD CONSTRAINT "ComposicaoInsumo_tipologiaId_fkey" FOREIGN KEY ("tipologiaId") REFERENCES "Tipologia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComposicaoInsumo" ADD CONSTRAINT "ComposicaoInsumo_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComposicaoMaoDeObra" ADD CONSTRAINT "ComposicaoMaoDeObra_tipologiaId_fkey" FOREIGN KEY ("tipologiaId") REFERENCES "Tipologia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabelaPreco" ADD CONSTRAINT "TabelaPreco_tipologiaId_fkey" FOREIGN KEY ("tipologiaId") REFERENCES "Tipologia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabelaPreco" ADD CONSTRAINT "TabelaPreco_linhaId_fkey" FOREIGN KEY ("linhaId") REFERENCES "LinhaAluminio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabelaPreco" ADD CONSTRAINT "TabelaPreco_acabamentoId_fkey" FOREIGN KEY ("acabamentoId") REFERENCES "AcabamentoAluminio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabelaPreco" ADD CONSTRAINT "TabelaPreco_tipoVidroId_fkey" FOREIGN KEY ("tipoVidroId") REFERENCES "TipoVidro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondicaoParcela" ADD CONSTRAINT "CondicaoParcela_condicaoId_fkey" FOREIGN KEY ("condicaoId") REFERENCES "CondicaoPagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposta" ADD CONSTRAINT "Proposta_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposta" ADD CONSTRAINT "Proposta_condicaoId_fkey" FOREIGN KEY ("condicaoId") REFERENCES "CondicaoPagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposta" ADD CONSTRAINT "Proposta_motivoPerdaId_fkey" FOREIGN KEY ("motivoPerdaId") REFERENCES "MotivoPerda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcaoProposta" ADD CONSTRAINT "OpcaoProposta_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "Proposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoProposta" ADD CONSTRAINT "GrupoProposta_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "Proposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemProposta" ADD CONSTRAINT "ItemProposta_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "Proposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemProposta" ADD CONSTRAINT "ItemProposta_opcaoId_fkey" FOREIGN KEY ("opcaoId") REFERENCES "OpcaoProposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemProposta" ADD CONSTRAINT "ItemProposta_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "GrupoProposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemProposta" ADD CONSTRAINT "ItemProposta_tipologiaId_fkey" FOREIGN KEY ("tipologiaId") REFERENCES "Tipologia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemProposta" ADD CONSTRAINT "ItemProposta_linhaId_fkey" FOREIGN KEY ("linhaId") REFERENCES "LinhaAluminio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemProposta" ADD CONSTRAINT "ItemProposta_acabamentoId_fkey" FOREIGN KEY ("acabamentoId") REFERENCES "AcabamentoAluminio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemProposta" ADD CONSTRAINT "ItemProposta_tipoVidroId_fkey" FOREIGN KEY ("tipoVidroId") REFERENCES "TipoVidro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPropostaMedida" ADD CONSTRAINT "ItemPropostaMedida_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemProposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaParcela" ADD CONSTRAINT "PropostaParcela_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "Proposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "Proposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =====================================================================================
-- Parte manual (não gerada pelo Prisma)
-- =====================================================================================

-- 1) Regra do dono (2026-11-13): a numeração das propostas começa em 2000 (o último real é próximo de 1200).
--    Só preenche se ainda estiver vazio; nunca sobrescreve um valor que o gestor já definiu.
UPDATE "ConfiguracaoEmpresa" SET "proximoNumeroProposta" = 2000 WHERE "proximoNumeroProposta" IS NULL;

-- 2) Segurança (docs/DECISOES.md, item 15): toda tabela nova com RLS ligado e sem política,
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

-- 3) Unicidade só entre os não excluídos (o Prisma não expressa índice parcial).
CREATE UNIQUE INDEX "Tipologia_nome_ativo_unico" ON "Tipologia" (lower("nome")) WHERE "deletadoEm" IS NULL;
CREATE UNIQUE INDEX "CondicaoPagamento_nome_ativo_unico" ON "CondicaoPagamento" (lower("nome")) WHERE "deletadoEm" IS NULL;
-- Uma linha de preço por combinação (colunas vazias contam como "qualquer"), só entre as não excluídas.
CREATE UNIQUE INDEX "TabelaPreco_combinacao_unica" ON "TabelaPreco" (
  "tipologiaId",
  COALESCE("linhaId", ''),
  COALESCE("acabamentoId", ''),
  COALESCE("tipoVidroId", ''),
  COALESCE("espessuraVidroMm", 0)
) WHERE "deletadoEm" IS NULL;

-- 4) Coerência dos dados na própria base (a aplicação valida, o banco garante).
ALTER TABLE "ItemPropostaMedida" ADD CONSTRAINT "ItemPropostaMedida_positivas" CHECK ("larguraMm" > 0 AND "alturaMm" > 0 AND "quantidade" > 0);
ALTER TABLE "ItemProposta" ADD CONSTRAINT "ItemProposta_valores_positivos" CHECK (
  "precoTotalCentavos" >= 0
  AND ("valorManualCentavos" IS NULL OR "valorManualCentavos" >= 0)
  AND ("custoEstimadoCentavos" IS NULL OR "custoEstimadoCentavos" >= 0)
  AND ("margemPb" IS NULL OR ("margemPb" >= 0 AND "margemPb" < 10000))
);
ALTER TABLE "OpcaoProposta" ADD CONSTRAINT "OpcaoProposta_desconto_positivo" CHECK ("descontoCentavos" >= 0);
ALTER TABLE "Proposta" ADD CONSTRAINT "Proposta_percentuais_validos" CHECK (
  "revisao" >= 0
  AND "acrescimoNotaPb" BETWEEN 0 AND 10000
  AND "comissaoArquitetoPb" BETWEEN 0 AND 9999
  AND "comissaoIndicacaoPb" BETWEEN 0 AND 9999
  AND ("margemPb" IS NULL OR ("margemPb" >= 0 AND "margemPb" < 10000))
);
ALTER TABLE "CondicaoParcela" ADD CONSTRAINT "CondicaoParcela_percentual_valido" CHECK ("percentualPb" BETWEEN 1 AND 10000);
ALTER TABLE "PropostaParcela" ADD CONSTRAINT "PropostaParcela_percentual_valido" CHECK ("percentualPb" BETWEEN 1 AND 10000);
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_valor_positivo" CHECK ("valorCentavos" >= 0);
ALTER TABLE "ConfiguracaoEmpresa" ADD CONSTRAINT "ConfiguracaoEmpresa_acrescimo_nota_valido" CHECK ("acrescimoNotaPb" BETWEEN 0 AND 10000);

-- 5) Busca sem acento por número da proposta e nome do cliente (mesma expressão das consultas,
--    `public.f_unaccent(lower(...))`; docs/DECISOES.md, item 30).
CREATE INDEX "Proposta_busca_trgm" ON "Proposta"
  USING gin (public.f_unaccent(lower("numero" || ' ' || "clienteNome")) gin_trgm_ops);
