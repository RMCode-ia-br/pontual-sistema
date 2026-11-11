-- Kanban e ficha do projeto consultam tarefas por projeto e situação (achado da revisão sênior da Fase 2).
CREATE INDEX "Tarefa_projetoId_status_idx" ON "Tarefa"("projetoId", "status");
