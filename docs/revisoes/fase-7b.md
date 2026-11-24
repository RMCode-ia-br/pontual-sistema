# Revisão sênior — Fase 7B (relatórios em SQL, busca, volume parcial e exportação)

Data: 2026-11-24. Escopo: `77091c0..HEAD`. Blocos 5, 6, 7, 8 e 10 entregues. **O Bloco 9 (volume) e a 7B-2 não foram feitos** (janela própria). A 7C e a Fase 8 não foram iniciadas.

## O que foi entregue
- **Bloco 5 (pendências da 7A/7A.1):** motivos de perda numa fonte só (decisão 130); visita registrada depois da proposta fora da média, com contagem (131); linha "Cancelado depois de aprovado" (132); margem por obra em lote e carga do painel medida (133); lembrete de WhatsApp no painel (134); dados para pagamento em várias linhas (135); ordem única de locks Projeto → conta a receber, com teste de 20 corridas que falhava antes (136); testes que dependiam de dados semeados passaram a criar os próprios; correção do fuso nos testes e em `pedido.tsx`.
- **Bloco 6:** funil em SQL agregado, relatórios de clientes (reativação, por cidade normalizada), produtos e preços (mix por tipologia, preço médio por m²) e tempos de decisão sobre TODAS as decisões (tabela limitada a 500 linhas, com aviso).
- **Bloco 7:** produção × capacidade, avaliações no Google, obras em andamento, estoque (posição com inativo com saldo, compras por fornecedor, curva ABC com corte editável, variação de custo).
- **Bloco 8:** lista de obras com aviso "Mostrando 300 de N"; galeria e extrato paginados no SQL; busca sem acento por índices trigram (139); cache da URL da logo; Server-Timing em `/api/health`.
- **Bloco 10:** CSV tipado em todos os relatórios (BOM, dinheiro "1234,56", aviso de corte na 1ª linha, colunas internas só com `can(ver, custo)`), link de CSV por tabela, teste-guarda de relatórios.
- **Defeito do zero (decisões 137 e 138):** zero informado é valor, vazio é "não informado"; contagem inicial aceita zero; custo unitário recusa zero.

## Migrações (aplicadas no banco de São Paulo com OK do dono)
| Migração | O que faz | SQL de volta |
|---|---|---|
| `20261120000000_contagem_zero` | a regra `MovimentoEstoque_quantidade_nao_zero` aceita 0 só em `INVENTARIO_INICIAL` | `ALTER TABLE "MovimentoEstoque" DROP CONSTRAINT "MovimentoEstoque_quantidade_nao_zero"; ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_quantidade_nao_zero" CHECK ("quantidade" <> 0);` (só se não houver contagem zero gravada) |
| `20261121000000_busca_sem_acento` | 3 índices GIN trigram de expressão (existem só no SQL, fora do `schema.prisma`) | `DROP INDEX IF EXISTS "ContaReceber_descricao_busca_idx"; DROP INDEX IF EXISTS "ContaPagar_descricao_favorecido_busca_idx"; DROP INDEX IF EXISTS "Chamado_descricao_busca_idx";` |

## Passo manual do Luan depois do deploy
Reescrever o texto padrão de "Dados para pagamento" (Configurações da empresa) em linhas ("Favorecido:", "Banco:", "Agência:", "Conta:", "Chave Pix:"). O texto atual continua numa linha e só vale para propostas novas.

## Verificação (rodada completa de 2026-11-24, sobre a build)
| Tipo | Passaram | Falharam | Ignorados | Não rodaram | Base 7A.1 |
|---|---|---|---|---|---|
| Unitários | 1.402 | 0 | 0 | 0 | — |
| Integração | 493 | 0 | 0 | 0 | 398 |
| E2E (desktop + celular) | 647 | 1 | 19 | 1 | 618 / 6 falhas |

A única falha foi `financeiro-pagar:125` no celular: login lento (botão ainda em "Entrando...") contra o tempo limite de 5 s do helper; o teste seguinte da mesma spec (serial) não rodou por consequência. O helper passou a esperar 20 s; a spec foi rodada de novo (desktop e celular): **12 de 12 passaram, incluindo o que não tinha rodado**. Depois da revisão final rodaram `funil`, `relatorios-comerciais` e `painel-bate-com-relatorio` (67 passaram) e as specs com ignorados (175 passaram, 19 ignorados).

**Login medido** (build local, banco de SP): isolado p50 1,1 s / p95 1,8 s (10 logins); com 6 em paralelo p50 5,8 s / p95 6,5 s (18 logins). Passou de 3 s: registrado na PENDENCIAS (provável custo do hash de senha sob carga).

**Os 19 ignorados, todos por condição declarada no teste:**
- 10 de `identidade.spec` (5 por projeto) e 2 de `visual-fase7.spec` (1 por projeto): só geram capturas com `CAPTURAS_IDENTIDADE=antes|depois` e `CAPTURAS_FASE7=1`.
- 2 de `tarefas.spec` ("a lista começa vazia"): o banco já tem tarefas reais (por desenho).
- 5 só do computador, ignorados no celular: `agenda:157` (link assinado), `area-logada:125` (Ctrl+K), `clientes:283` e `:297` (colunas e cabeçalho ordenável só existem na tabela), `funil:98` (arrasto com o mouse).
- `modelo-etapas.spec` NÃO foi ignorado (o modelo padrão da seed está intacto).

**Primeira rodada completa (inválida):** teve falhas de rede (`ENOTFOUND` e `ETIMEDOUT`) e foi descartada. O que mudou nos testes desde então: esperas de streaming (esperar conteúdo positivo antes de afirmar ausência ou contagem), E2E de layout antigo dos relatórios, DRE "6500,00", corrida em `aprovacao-desfazer` (esperar o resumo) e o tempo de login. A segunda rodada completa teve zero erro de rede (vigia de conexão a cada minuto, sem queda).

## Revisão sênior final (subagente de contexto limpo, somente leitura)
Sem achado ALTO (sem injeção de SQL, sem float em dinheiro, sem mutação sem sessão/Zod/auditoria, migrações seguras, fuso e ordem de locks corretos, tela e CSV pela mesma função).
- **MÉDIO, corrigido:** o funil contava aprovação desfeita como "Aprovado" (o histórico guarda o `APROVADO` antigo). Agora, a partir de "Aprovado", só conta quem continua aprovado ou foi cancelado depois de aprovado (decisão 140). Teste de integração que falhava antes e passa depois.
- **BAIXO corrigido:** lista de cancelamentos truncada sem ordem (agora `atualizadoEm desc, id`).
- **BAIXO registrados na PENDENCIAS:** galeria com filtro de ano, cortes de faixa ilegíveis sem aviso, busca sem acento corta em 20.000 sem avisar, índices de busca pouco usados com `OR` entre tabelas, `timeout` de transação (30 s) igual ao `maxDuration` somado à espera de 10 s, contadores "ficaram de fora" que faltam.
- Item 5h: **nenhuma tela alimenta "Cancelado depois de aprovado"** (não há caminho para cancelar obra aprovada; PENDENCIAS).

## Lista para a 7C
1. **Custo escondido nos relatórios e no CSV de estoque:** hoje `can(ver, custo)` é sempre verdadeiro; as colunas internas estão marcadas (`interna`) e o CSV de estoque usa `podeVerInterno: false`, mas a tela de estoque, o valor em estoque e a variação de custo precisam esconder o custo quando o `can` passar a negar.
2. **Galeria corta fotos por página e não por obra** (com o filtro de ano a página pode mostrar menos obras que a paginação conta).
3. Ações destrutivas (`ACOES_DESTRUTIVAS`), incluindo desfazer aprovação e, quando existir, cancelar obra aprovada.

## Para a 7B-2 (volume)
Lista de obras paginada em SQL (o semáforo depende do prazo com pausas), medição de aging, DRE e fluxo com volume, índices de busca. Ver PENDENCIAS.

## Consumo semanal
Não foi possível estimar com precisão: a sessão não expõe o consumo da cota. A 7B ocupou várias sessões longas (mais de uma compactação de contexto) e uma rodada completa de E2E leva cerca de 1,1 h.
