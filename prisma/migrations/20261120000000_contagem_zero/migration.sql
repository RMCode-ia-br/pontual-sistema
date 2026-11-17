-- Contagem inicial de estoque com quantidade ZERO (produto contado, sem estoque): é um fato do estoque e é diferente de
-- "não contado" (sem movimento). Hoje a regra do banco proíbe qualquer movimento de quantidade 0; passa a proibir, exceto
-- na contagem inicial (INVENTARIO_INICIAL). Entrada, saída, devolução, ajuste e perda continuam exigindo quantidade diferente de zero.
-- Só afrouxa a regra: nenhum dado existente muda e nenhuma linha existente pode violar a regra nova.
ALTER TABLE "MovimentoEstoque" DROP CONSTRAINT "MovimentoEstoque_quantidade_nao_zero";
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_quantidade_nao_zero" CHECK ("quantidade" <> 0 OR "tipo" = 'INVENTARIO_INICIAL');
