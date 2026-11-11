-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('PF', 'PJ');

-- CreateEnum
CREATE TYPE "OrigemContato" AS ENUM ('GOOGLE', 'INDICACAO_CLIENTE', 'ARQUITETO_PARCEIRO', 'INSTAGRAM', 'WHATSAPP', 'SITE', 'PLACA_NA_OBRA', 'CLIENTE_ANTIGO', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoEndereco" AS ENUM ('COBRANCA', 'OBRA');

-- CreateEnum
CREATE TYPE "FuncaoFuncionario" AS ENUM ('VENDAS', 'PROJETO', 'FABRICA', 'INSTALACAO', 'ADMINISTRATIVO', 'GESTAO');

-- CreateEnum
CREATE TYPE "UnidadeProduto" AS ENUM ('UN', 'M', 'M2', 'KG', 'BARRA', 'L', 'PAR', 'CJ');

-- CreateEnum
CREATE TYPE "OrigemPreco" AS ENUM ('MANUAL', 'REAJUSTE_LOTE', 'IMPORTACAO');

-- CreateEnum
CREATE TYPE "TipoImportacao" AS ENUM ('CLIENTES', 'FORNECEDORES', 'PRODUTOS');

-- CreateEnum
CREATE TYPE "StatusLoteImportacao" AS ENUM ('APLICADO', 'REVERTIDO');

-- CreateEnum
CREATE TYPE "AcaoLoteItem" AS ENUM ('CRIADO', 'ATUALIZADO');

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "tipoPessoa" "TipoPessoa" NOT NULL DEFAULT 'PF',
    "nome" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cpfCnpj" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "clienteFinal" BOOLEAN NOT NULL DEFAULT true,
    "arquiteto" BOOLEAN NOT NULL DEFAULT false,
    "construtora" BOOLEAN NOT NULL DEFAULT false,
    "empresa" BOOLEAN NOT NULL DEFAULT false,
    "origem" "OrigemContato",
    "origemDetalhe" TEXT,
    "indicadoPorId" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "loteImportacaoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnderecoCliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" "TipoEndereco" NOT NULL DEFAULT 'OBRA',
    "apelido" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "cep" TEXT,
    "condominio" BOOLEAN NOT NULL DEFAULT false,
    "condominioNome" TEXT,
    "exigeAprovacaoFachada" BOOLEAN NOT NULL DEFAULT false,
    "fachadaAprovada" BOOLEAN NOT NULL DEFAULT false,
    "horariosPermitidos" TEXT,
    "sindicoNome" TEXT,
    "sindicoTelefone" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "EnderecoCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContatoCliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "ContatoCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT,
    "vendedorNome" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "condicoesPagamento" TEXT,
    "prazoEntregaDias" INTEGER,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "loteImportacaoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Funcionario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "cargo" TEXT,
    "funcao" "FuncaoFuncionario" NOT NULL,
    "admissaoEm" DATE,
    "demissaoEm" DATE,
    "salarioBaseCentavos" INTEGER,
    "custoHoraCentavos" INTEGER,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Funcionario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipe" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Equipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipeMembro" (
    "id" TEXT NOT NULL,
    "equipeId" TEXT NOT NULL,
    "funcionarioId" TEXT NOT NULL,
    "lider" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "EquipeMembro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoriaId" TEXT,
    "unidade" "UnidadeProduto" NOT NULL DEFAULT 'UN',
    "linhaId" TEXT,
    "acabamentoId" TEXT,
    "fornecedorPrincipalId" TEXT,
    "custoUnitarioCentavos" INTEGER,
    "custoAtualizadoEm" TIMESTAMP(3),
    "comprimentoBarraMm" INTEGER,
    "pesoKgPorMetro" DECIMAL(8,3),
    "larguraMm" INTEGER,
    "alturaMm" INTEGER,
    "estoqueMinimo" DECIMAL(12,3),
    "localizacao" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "loteImportacaoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoPreco" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "custoAnteriorCentavos" INTEGER,
    "custoNovoCentavos" INTEGER NOT NULL,
    "origem" "OrigemPreco" NOT NULL,
    "fornecedorId" TEXT,
    "usuarioId" TEXT,
    "loteImportacaoId" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "HistoricoPreco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoteImportacao" (
    "id" TEXT NOT NULL,
    "tipo" "TipoImportacao" NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "totalLinhas" INTEGER NOT NULL,
    "criados" INTEGER NOT NULL DEFAULT 0,
    "atualizados" INTEGER NOT NULL DEFAULT 0,
    "ignorados" INTEGER NOT NULL DEFAULT 0,
    "status" "StatusLoteImportacao" NOT NULL DEFAULT 'APLICADO',
    "revertidoEm" TIMESTAMP(3),
    "revertidoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "LoteImportacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoteImportacaoItem" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "acao" "AcaoLoteItem" NOT NULL,
    "antes" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "LoteImportacaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiltroSalvo" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tela" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "consulta" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,
    "atualizadoPorId" TEXT,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "FiltroSalvo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CategoriaProdutoToFornecedor" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CategoriaProdutoToFornecedor_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Cliente_deletadoEm_ativo_nome_idx" ON "Cliente"("deletadoEm", "ativo", "nome");

-- CreateIndex
CREATE INDEX "Cliente_cpfCnpj_idx" ON "Cliente"("cpfCnpj");

-- CreateIndex
CREATE INDEX "Cliente_telefone_idx" ON "Cliente"("telefone");

-- CreateIndex
CREATE INDEX "Cliente_whatsapp_idx" ON "Cliente"("whatsapp");

-- CreateIndex
CREATE INDEX "Cliente_arquiteto_idx" ON "Cliente"("arquiteto");

-- CreateIndex
CREATE INDEX "Cliente_construtora_idx" ON "Cliente"("construtora");

-- CreateIndex
CREATE INDEX "Cliente_indicadoPorId_idx" ON "Cliente"("indicadoPorId");

-- CreateIndex
CREATE INDEX "Cliente_loteImportacaoId_idx" ON "Cliente"("loteImportacaoId");

-- CreateIndex
CREATE INDEX "EnderecoCliente_clienteId_deletadoEm_idx" ON "EnderecoCliente"("clienteId", "deletadoEm");

-- CreateIndex
CREATE INDEX "ContatoCliente_clienteId_deletadoEm_idx" ON "ContatoCliente"("clienteId", "deletadoEm");

-- CreateIndex
CREATE INDEX "Fornecedor_deletadoEm_ativo_razaoSocial_idx" ON "Fornecedor"("deletadoEm", "ativo", "razaoSocial");

-- CreateIndex
CREATE INDEX "Fornecedor_cnpj_idx" ON "Fornecedor"("cnpj");

-- CreateIndex
CREATE INDEX "Fornecedor_loteImportacaoId_idx" ON "Fornecedor"("loteImportacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Funcionario_usuarioId_key" ON "Funcionario"("usuarioId");

-- CreateIndex
CREATE INDEX "Funcionario_deletadoEm_ativo_nome_idx" ON "Funcionario"("deletadoEm", "ativo", "nome");

-- CreateIndex
CREATE INDEX "Funcionario_cpf_idx" ON "Funcionario"("cpf");

-- CreateIndex
CREATE INDEX "Equipe_deletadoEm_ativo_nome_idx" ON "Equipe"("deletadoEm", "ativo", "nome");

-- CreateIndex
CREATE INDEX "EquipeMembro_funcionarioId_idx" ON "EquipeMembro"("funcionarioId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipeMembro_equipeId_funcionarioId_key" ON "EquipeMembro"("equipeId", "funcionarioId");

-- CreateIndex
CREATE INDEX "Produto_deletadoEm_ativo_descricao_idx" ON "Produto"("deletadoEm", "ativo", "descricao");

-- CreateIndex
CREATE INDEX "Produto_categoriaId_idx" ON "Produto"("categoriaId");

-- CreateIndex
CREATE INDEX "Produto_linhaId_idx" ON "Produto"("linhaId");

-- CreateIndex
CREATE INDEX "Produto_fornecedorPrincipalId_idx" ON "Produto"("fornecedorPrincipalId");

-- CreateIndex
CREATE INDEX "Produto_loteImportacaoId_idx" ON "Produto"("loteImportacaoId");

-- CreateIndex
CREATE INDEX "HistoricoPreco_produtoId_criadoEm_idx" ON "HistoricoPreco"("produtoId", "criadoEm");

-- CreateIndex
CREATE INDEX "HistoricoPreco_loteImportacaoId_idx" ON "HistoricoPreco"("loteImportacaoId");

-- CreateIndex
CREATE INDEX "LoteImportacao_tipo_criadoEm_idx" ON "LoteImportacao"("tipo", "criadoEm");

-- CreateIndex
CREATE INDEX "LoteImportacaoItem_loteId_idx" ON "LoteImportacaoItem"("loteId");

-- CreateIndex
CREATE UNIQUE INDEX "FiltroSalvo_usuarioId_tela_nome_key" ON "FiltroSalvo"("usuarioId", "tela", "nome");

-- CreateIndex
CREATE INDEX "_CategoriaProdutoToFornecedor_B_index" ON "_CategoriaProdutoToFornecedor"("B");

-- AddForeignKey
ALTER TABLE "Interacao" ADD CONSTRAINT "Interacao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_indicadoPorId_fkey" FOREIGN KEY ("indicadoPorId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_loteImportacaoId_fkey" FOREIGN KEY ("loteImportacaoId") REFERENCES "LoteImportacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnderecoCliente" ADD CONSTRAINT "EnderecoCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContatoCliente" ADD CONSTRAINT "ContatoCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_loteImportacaoId_fkey" FOREIGN KEY ("loteImportacaoId") REFERENCES "LoteImportacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Funcionario" ADD CONSTRAINT "Funcionario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipeMembro" ADD CONSTRAINT "EquipeMembro_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipeMembro" ADD CONSTRAINT "EquipeMembro_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaProduto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_linhaId_fkey" FOREIGN KEY ("linhaId") REFERENCES "LinhaAluminio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_acabamentoId_fkey" FOREIGN KEY ("acabamentoId") REFERENCES "AcabamentoAluminio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_fornecedorPrincipalId_fkey" FOREIGN KEY ("fornecedorPrincipalId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_loteImportacaoId_fkey" FOREIGN KEY ("loteImportacaoId") REFERENCES "LoteImportacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoPreco" ADD CONSTRAINT "HistoricoPreco_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoPreco" ADD CONSTRAINT "HistoricoPreco_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoPreco" ADD CONSTRAINT "HistoricoPreco_loteImportacaoId_fkey" FOREIGN KEY ("loteImportacaoId") REFERENCES "LoteImportacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoteImportacaoItem" ADD CONSTRAINT "LoteImportacaoItem_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteImportacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoriaProdutoToFornecedor" ADD CONSTRAINT "_CategoriaProdutoToFornecedor_A_fkey" FOREIGN KEY ("A") REFERENCES "CategoriaProduto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoriaProdutoToFornecedor" ADD CONSTRAINT "_CategoriaProdutoToFornecedor_B_fkey" FOREIGN KEY ("B") REFERENCES "Fornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;


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

-- 2) Busca sem acento e tolerante a erros de digitação. `unaccent()` é STABLE e não pode entrar
--    em índice; este invólucro IMUTÁVEL (dicionário fixo) pode. As consultas precisam chamar
--    exatamente `f_unaccent(...)` para usar os índices abaixo.
CREATE OR REPLACE FUNCTION public.f_unaccent(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, texto) $$;

CREATE INDEX "Cliente_busca_trgm" ON "Cliente"
  USING gin (public.f_unaccent(lower("nome" || ' ' || coalesce("nomeFantasia", ''))) gin_trgm_ops);
CREATE INDEX "Fornecedor_busca_trgm" ON "Fornecedor"
  USING gin (public.f_unaccent(lower("razaoSocial" || ' ' || coalesce("nomeFantasia", ''))) gin_trgm_ops);
CREATE INDEX "Produto_busca_trgm" ON "Produto"
  USING gin (public.f_unaccent(lower("codigo" || ' ' || "descricao")) gin_trgm_ops);
CREATE INDEX "Funcionario_busca_trgm" ON "Funcionario"
  USING gin (public.f_unaccent(lower("nome")) gin_trgm_ops);
CREATE INDEX "Tarefa_busca_trgm" ON "Tarefa"
  USING gin (public.f_unaccent(lower("titulo")) gin_trgm_ops);

-- 3) O código do produto é único entre os NÃO excluídos, sem diferenciar maiúsculas.
--    (Excluído vai para a lixeira e libera o código; restaurar confere o conflito.)
CREATE UNIQUE INDEX "Produto_codigo_ativo_key" ON "Produto" (lower("codigo")) WHERE "deletadoEm" IS NULL;

-- 4) Equipe: nome único entre as não excluídas.
CREATE UNIQUE INDEX "Equipe_nome_ativa_key" ON "Equipe" (lower("nome")) WHERE "deletadoEm" IS NULL;
