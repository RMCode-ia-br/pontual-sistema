-- Revisão sênior da Fase 1: CNPJ de fornecedor e CPF de funcionário só eram únicos na aplicação (corrida entre
-- dois cadastros simultâneos passava). Agora o banco garante, entre os não excluídos (a lixeira libera o valor).
-- Se esta migração falhar, há CNPJ/CPF repetido entre ativos: corrija os cadastros e aplique de novo.
CREATE UNIQUE INDEX "Fornecedor_cnpj_ativo_key" ON "Fornecedor" ("cnpj") WHERE "deletadoEm" IS NULL AND "cnpj" IS NOT NULL;
CREATE UNIQUE INDEX "Funcionario_cpf_ativo_key" ON "Funcionario" ("cpf") WHERE "deletadoEm" IS NULL AND "cpf" IS NOT NULL;
