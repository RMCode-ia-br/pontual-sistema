# Fase 7C — Permissões por perfil e por módulo

Plano aprovado pelo Régis em 2026-11-27 (arquivo de plano da sessão; decisões 176 a 184 em `docs/DECISOES.md`; inventário em `docs/revisoes/fase-7c-inventario.md`). Fase única, relatório único.

## Estado atual (retomar daqui)

| Bloco | Situação | Commit |
|---|---|---|
| 0 Inventário, decisões, CLAUDE.md | concluído | (este commit) |
| 1 Migração | próximo: mostrar SQL, rollback e BEGIN/ROLLBACK e esperar o OK do Régis | — |
| 2 Regra pura, sessão com permissões, seed | pendente | — |
| 3 Menu, `/sem-acesso`, `exigirModulo` nas páginas | pendente | — |
| 4 Server Actions | pendente (parada obrigatória ao fim, relatório parcial) | — |
| 5 Rotas, anexos, busca, CSV | pendente | — |
| 6 Valores para o Campo, custo, painel, relatórios | pendente | — |
| 7 Telas de usuários | pendente | — |
| 8 Cancelar obra aprovada | pendente | — |
| 9 E2E por perfil | pendente (parar antes da revisão sênior e da suíte) | — |

Paradas obrigatórias: OK da migração; fim do Bloco 4; fim do Bloco 9; suíte só depois do aviso do Régis. Esforço High nos Blocos 1, 4 e 6 e na revisão sênior.

## Ajustes do Régis sobre o plano
1. `ajustesPermissao` inválido falha fechado (papel ≠ ADMIN: sem acesso a nada, só `/sem-acesso` e a própria conta, com log; ADMIN: perfil puro).
2. Escritório com "excluir e desfazer" só em Comercial, Obras e Financeiro.
3. Cancelar obra aprovada com prévia e bloqueios em palavras simples.
4. Teste gerado: ação exportada × perfil, resultado derivado do mapeamento recurso → módulo → nível; falha se houver ação sem mapeamento. E2E: Escritório ponta a ponta (criar e aprovar proposta, receber, estornar, cancelar obra); Campo (agenda, visita, etapa, foto).
5. Migração: `ADD VALUE` não usado na mesma transação; `prisma migrate diff` só leitura antes; ADMIN com acesso total depois.
6. Pergunta ao Marcelo sobre o Campo concluir etapa que dispara vencimento de parcela.
