-- Extensões para busca sem acento e tolerante a erros de digitação (spec seção 3).
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PapelUsuario" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "TipoDias" AS ENUM ('UTEIS', 'CORRIDOS');

-- CreateEnum
CREATE TYPE "TipoFeriado" AS ENUM ('FERIADO', 'FERIAS_COLETIVA_FORNECEDORES', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoInteracao" AS ENUM ('LIGACAO', 'WHATSAPP', 'VISITA', 'EMAIL', 'NOTA', 'SISTEMA');

-- CreateEnum
CREATE TYPE "StatusTarefa" AS ENUM ('ABERTA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "MomentoFoto" AS ENUM ('ANTES', 'DURANTE', 'DEPOIS');

-- CreateEnum
CREATE TYPE "TipoCategoriaFinanceira" AS ENUM ('RECEITA', 'DESPESA');

-- CreateEnum
CREATE TYPE "CategoriaModeloTexto" AS ENUM ('PROPOSTA_NOTAS', 'PROPOSTA_TERMOS', 'WHATSAPP', 'OUTRO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "email" TEXT,
    "senhaHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "papel" "PapelUsuario" NOT NULL DEFAULT 'ADMIN',
    "precisaTrocarSenha" BOOLEAN NOT NULL DEFAULT true,
    "versaoSessao" INTEGER NOT NULL DEFAULT 1,
    "ultimoLoginEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TentativaLogin" (
    "id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "sucesso" BOOLEAN NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TentativaLogin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoEmpresa" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "razaoSocial" TEXT,
    "nomeFantasia" TEXT,
    "cnpj" TEXT,
    "endereco" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "cep" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "emailContato" TEXT,
    "emailPropostas" TEXT,
    "siteUrl" TEXT,
    "instagramUrl" TEXT,
    "googlePerfilUrl" TEXT,
    "linkAvaliacaoGoogle" TEXT,
    "logoCaminho" TEXT,
    "corPrimaria" TEXT,
    "horarioSemanaInicio" TEXT DEFAULT '08:00',
    "horarioSemanaFim" TEXT DEFAULT '18:00',
    "horarioSabadoInicio" TEXT DEFAULT '08:00',
    "horarioSabadoFim" TEXT DEFAULT '12:00',
    "visitaDuracaoMin" INTEGER NOT NULL DEFAULT 60,
    "aliquotaImpostoPercentual" DECIMAL(5,2),
    "margemPadraoPercentual" DECIMAL(5,2),
    "margemMinimaAlertaPercentual" DECIMAL(5,2),
    "metaFaturamentoMensalCentavos" INTEGER NOT NULL DEFAULT 30000000,
    "capacidadeProducaoM2Mes" INTEGER NOT NULL DEFAULT 300,
    "garantiaRegulagemDias" INTEGER NOT NULL DEFAULT 90,
    "retalhoMinimoMm" INTEGER,
    "custoMaoDeObraPorM2Centavos" INTEGER,
    "tipoDias" "TipoDias" NOT NULL DEFAULT 'UTEIS',
    "diasFollowUpProposta" INTEGER NOT NULL DEFAULT 3,
    "diasAlertaPrazoAmarelo" INTEGER NOT NULL DEFAULT 3,
    "limiteSimplesCentavos" INTEGER NOT NULL DEFAULT 480000000,
    "proximoNumeroProposta" INTEGER,
    "reiniciaNumeracaoPorAno" BOOLEAN NOT NULL DEFAULT false,
    "consultorNome" TEXT,
    "consultorCargo" TEXT,
    "dadosPagamento" TEXT,
    "pdfExibirValorPorItem" BOOLEAN NOT NULL DEFAULT true,
    "pdfDescricoesMaiusculas" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,

    CONSTRAINT "ConfiguracaoEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feriado" (
    "id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoFeriado" NOT NULL DEFAULT 'FERIADO',
    "dataFim" DATE,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Feriado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAuditoria" (
    "id" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT,
    "usuarioNome" TEXT,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    "ip" TEXT,

    CONSTRAINT "LogAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anexo" (
    "id" TEXT NOT NULL,
    "entidadeTipo" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "categoria" TEXT,
    "nome" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "descricao" TEXT,
    "momento" "MomentoFoto",
    "usarNoPortfolio" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Anexo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interacao" (
    "id" TEXT NOT NULL,
    "tipo" "TipoInteracao" NOT NULL,
    "texto" TEXT NOT NULL,
    "clienteId" TEXT,
    "projetoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Interacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tarefa" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" TEXT,
    "responsavelId" TEXT,
    "vencimento" DATE,
    "status" "StatusTarefa" NOT NULL DEFAULT 'ABERTA',
    "concluidaEm" TIMESTAMP(3),
    "clienteId" TEXT,
    "projetoId" TEXT,
    "chaveUnica" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Tarefa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT,
    "link" TEXT,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "chaveUnica" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModeloTexto" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "categoria" "CategoriaModeloTexto" NOT NULL DEFAULT 'OUTRO',
    "conteudo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "ModeloTexto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaAluminio" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "LinhaAluminio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcabamentoAluminio" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "AcabamentoAluminio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipoVidro" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "TipoVidro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspessuraVidro" (
    "id" TEXT NOT NULL,
    "mm" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "EspessuraVidro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaProduto" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "CategoriaProduto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MotivoPerda" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "MotivoPerda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MotivoBloqueio" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "justificado" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "MotivoBloqueio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaFinanceira" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoCategoriaFinanceira" NOT NULL,
    "grupoDre" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "CategoriaFinanceira_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_login_key" ON "Usuario"("login");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_ativo_idx" ON "Usuario"("ativo");

-- CreateIndex
CREATE INDEX "TentativaLogin_identificador_criadoEm_idx" ON "TentativaLogin"("identificador", "criadoEm");

-- CreateIndex
CREATE INDEX "TentativaLogin_ip_criadoEm_idx" ON "TentativaLogin"("ip", "criadoEm");

-- CreateIndex
CREATE INDEX "Feriado_data_idx" ON "Feriado"("data");

-- CreateIndex
CREATE UNIQUE INDEX "Feriado_data_nome_key" ON "Feriado"("data", "nome");

-- CreateIndex
CREATE INDEX "LogAuditoria_entidade_entidadeId_idx" ON "LogAuditoria"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "LogAuditoria_usuarioId_criadoEm_idx" ON "LogAuditoria"("usuarioId", "criadoEm");

-- CreateIndex
CREATE INDEX "LogAuditoria_criadoEm_idx" ON "LogAuditoria"("criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Anexo_caminho_key" ON "Anexo"("caminho");

-- CreateIndex
CREATE INDEX "Anexo_entidadeTipo_entidadeId_idx" ON "Anexo"("entidadeTipo", "entidadeId");

-- CreateIndex
CREATE INDEX "Interacao_clienteId_criadoEm_idx" ON "Interacao"("clienteId", "criadoEm");

-- CreateIndex
CREATE INDEX "Interacao_projetoId_criadoEm_idx" ON "Interacao"("projetoId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Tarefa_chaveUnica_key" ON "Tarefa"("chaveUnica");

-- CreateIndex
CREATE INDEX "Tarefa_responsavelId_status_vencimento_idx" ON "Tarefa"("responsavelId", "status", "vencimento");

-- CreateIndex
CREATE INDEX "Tarefa_status_vencimento_idx" ON "Tarefa"("status", "vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "Notificacao_chaveUnica_key" ON "Notificacao"("chaveUnica");

-- CreateIndex
CREATE INDEX "Notificacao_usuarioId_lida_criadoEm_idx" ON "Notificacao"("usuarioId", "lida", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "ModeloTexto_chave_key" ON "ModeloTexto"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "LinhaAluminio_nome_key" ON "LinhaAluminio"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "AcabamentoAluminio_nome_key" ON "AcabamentoAluminio"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "TipoVidro_nome_key" ON "TipoVidro"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "EspessuraVidro_mm_key" ON "EspessuraVidro"("mm");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaProduto_nome_key" ON "CategoriaProduto"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "MotivoPerda_nome_key" ON "MotivoPerda"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "MotivoBloqueio_nome_key" ON "MotivoBloqueio"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaFinanceira_tipo_nome_key" ON "CategoriaFinanceira"("tipo", "nome");

