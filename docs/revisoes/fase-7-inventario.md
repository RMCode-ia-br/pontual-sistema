# Fase 7 — Inventário da seção 8 (Dashboards e relatórios)

Data: 2026-11-12. Levantado no código das fases 1 a 6 antes de construir (commit de partida `31a5b02`). **Só se constrói o que está PARCIAL ou FALTA.** Legenda: PRONTO = existe e atende; PARCIAL = existe, falta algo (dito na coluna); FALTA = não existe. A coluna "Subfase" diz onde a Fase 7 trata o item (7A ou 7B).

## Painel (página inicial, `src/app/(app)/page.tsx`)

A página não lê período: tudo é "mês atual" ou "90 dias". Todo cartão já é um link para a lista filtrada e tem "como é calculado" (atributo `title` + linha visível).

| Item da spec | Status | Onde está / o que falta | Subfase |
|---|---|---|---|
| Seletor de período (mês atual por padrão) e comparação (mês anterior, mesmo mês do ano passado) | FALTA | Nada lê `searchParams`. Só "recebido no mês" compara com o mês anterior (`modules/financeiro/resumo.ts`) | 7A |
| 1. Faturamento × meta (recebido e vendido) | PARCIAL | Recebido e % da meta existem. Falta o **Vendido**, o mesmo mês do ano passado e a separação com nota / sem nota | 7A |
| 2. Funil (qtd e valor por fase, em aberto, taxa de fechamento, ticket médio, visita → proposta) | PARCIAL | Fases e valor: `modules/comercial/resumo.ts`; propostas: `modules/propostas/resumo.ts`. Taxa, ticket e tempo só existem no relatório do funil, com definições diferentes da spec | 7A |
| 3. Atenção hoje | PARCIAL | Parcelas, contas a pagar, visitas e etapas atrasadas existem. Falta tarefas vencidas dentro do bloco e o lembrete de WhatsApp direto da visita | 7A |
| 4. Obras (por etapa, semáforo, pontualidade, próximas instalações) | PRONTO | `modules/obras/resumo.ts`. Pontualidade tem janela fixa de 90 dias (pendência da Fase 4) | 7A (período) |
| 5. Caixa (saldo, a receber, a pagar, fluxo 30/60/90) | PRONTO | `modules/financeiro/resumo.ts` | — |
| 6. Produção: m² × capacidade (ocupação da fábrica) | FALTA | Existem a capacidade (`capacidadeProducaoM2Mes`) e os dados (`EtapaProjeto`, medidas dos itens); nada calcula | 7A |
| 7. Origem dos leads e motivos de perda | PARCIAL | Só o mês, sem valor e sem link por linha (`resumoComercial`) | 7A |
| 8. Faturamento 12 meses (RBT12) × limite do Simples | SUBSTITUÍDO | Por decisão do dono vira "Recebido com nota fiscal nos últimos 12 meses" (decisão 117); não existe hoje | 7A |

## Definições dos indicadores (spec seção 8)

| Indicador | Status | Hoje | Subfase |
|---|---|---|---|
| Recebido | PRONTO | `Lancamento` de entrada ligado a conta a receber, não estornado, pela data do pagamento | — |
| Vendido | FALTA | Só o cartão "Aprovadas no mês" (soma de `valorAprovadoCentavos` por `aceitaEm`). Decisão 116: por proposta aprovada | 7A |
| Taxa de fechamento | PARCIAL | Existe no relatório do funil, mas sobre os projetos criados no período, não pela data da decisão | 7A |
| Ticket médio | PARCIAL | Usa o valor estimado do projeto; a spec pede vendido ÷ aprovados | 7A |
| Tempo visita → proposta | PARCIAL | Usa o histórico de fases e a coorte de criação; a spec pede a 1ª proposta enviada | 7A |
| Ocupação da fábrica | FALTA | — | 7A |
| Pontualidade | PRONTO | `lib/dominio/pontualidade.ts` (falta o período escolhido no painel) | 7A |
| Margem por obra | PRONTO | Fase 6 (`lib/dominio/custo-obra.ts`) | — |

## Relatórios

### Comercial

| Relatório | Status | Onde / o que falta | Subfase |
|---|---|---|---|
| Vendas por período | FALTA | — | 7B |
| Funil e conversão por fase | PRONTO | `/relatorios/funil` (`modules/relatorios/funil.ts`), calculado em memória (até 20.000) | 7B (SQL) |
| Motivos de perda | PRONTO | Mesmo relatório; as linhas não são links | 7B |
| Origem dos clientes (leads, propostas, fechamento, faturamento) | PARCIAL | Falta o faturamento (R$) por origem | 7B |
| Desempenho por arquiteto/construtora | FALTA | `/parceiros` é só lista de clientes | 7B |
| Tempos de resposta (visita → proposta, proposta → decisão) | PARCIAL | Falta proposta → decisão | 7B |
| Propostas sem retorno | PRONTO | `/projetos?semRetorno=1`, `/propostas?status=ENVIADA` | — |
| Ticket médio por tipo de serviço e por porte | PARCIAL | Só filtro de porte e ticket estimado | 7B |
| Mix por tipologia (m² e R$) | FALTA | — | 7B |
| Preço médio por m² por tipologia/linha/acabamento | FALTA | — | 7B |
| Ganhas × perdidas por faixa de preço | FALTA | — | 7B |
| Reativação (sem compra há 12+ meses) | PARCIAL | `/clientes?parado=1` é "sem contato", não "sem compra" | 7B |
| Clientes por cidade | FALTA | — | 7B |
| Sazonalidade | FALTA | — | 7B |

### Operacional

| Relatório | Status | Onde / o que falta | Subfase |
|---|---|---|---|
| Obras em andamento | PRONTO | `/obras` + CSV `/api/exportar/obras` | — |
| Atrasos por etapa e por motivo | PRONTO | `/relatorios/obras` (bloqueio é só "agora": não há histórico) | — |
| Pontualidade | PRONTO | `/relatorios/obras` | — |
| Produção m²/mês × capacidade | FALTA | — | 7B |
| Assistências | PRONTO | `/relatorios/obras` | — |
| Pedidos de avaliação no Google × obras concluídas | FALTA | Só existe a tarefa "Pedir avaliação"; decisão 118 | 7B |

### Financeiro

| Relatório | Status | Onde / o que falta | Subfase |
|---|---|---|---|
| Fluxo de caixa | PARCIAL | `/financeiro`. Falta CSV e impressão | 7A |
| DRE gerencial | PRONTO | `/financeiro/dre` (CSV). Falta impressão | 7A |
| Margem por obra | PARCIAL | `/relatorios/margem-obras`. Sem filtro de período, sem gráfico, uma consulta por obra, limite de 150 | 7A |
| Contas a receber por idade e inadimplência | PRONTO | `/relatorios/financeiro/receber` (sem filtros nem gráfico) | 7A (filtros/gráfico) |
| Contas a pagar por vencimento, fornecedor e categoria | PRONTO | `/relatorios/financeiro/pagar` (sem filtros nem gráfico) | 7A (filtros/gráfico) |
| Faturamento mensal 12 meses (com e sem nota, sem RBT12) | FALTA | Só pelo DRE com 12 meses | 7A |

### Estoque e compras

| Relatório | Status | Onde / o que falta | Subfase |
|---|---|---|---|
| Posição valorizada | PRONTO | `/relatorios/estoque`. Produto inativo com saldo fica fora do valor | 7B |
| Movimentações | PRONTO | `/estoque/movimentacoes` + CSV | — |
| Retalhos | PRONTO | `/estoque/retalhos` | — |
| Curva ABC | FALTA | — | 7B |
| Variação de custo dos insumos | PARCIAL | Só o histórico por produto | 7B |
| Abaixo do mínimo (só com mínimo definido) | PRONTO | `/produtos?estoque=abaixo` | — |
| Compras por fornecedor | PRONTO, com falha | Leitura limitada a 5.000 itens sem avisar o corte | 7B |
| Sucata acumulada | PRONTO | Saldo em kg | — |

## Base comum

| Item | Status | Onde / o que falta | Subfase |
|---|---|---|---|
| CSV | PARCIAL | `lib/csv` (BOM, `;`, CRLF, proteção contra fórmula). Sem colunas tipadas nem aviso de corte central; o funil grava a data como `aaaa-mm-dd` | 7A |
| Impressão | PARCIAL | Só `print:hidden`; sem regras `@media print` | 7A |
| Período (seletor + leitura da URL) | FALTA | Cada relatório repete o seu | 7A |
| "Como é calculado" | FALTA | Cópia local nas páginas do funil e de obras; painel usa `title` | 7A |
| Gráficos | PARCIAL | Barras horizontais e fluxo; o rótulo do tooltip das barras está fixo em "Projetos" | 7A |
| Permissão para ver custo e margem na leitura | FALTA | Hoje só `can()` nas escritas; `can()` sempre devolve `true` (só existe o perfil ADMIN) | 7A |

## Pendências já registradas para a Fase 7

| Pendência | Onde | Subfase |
|---|---|---|
| Funil calculado em memória (até 20.000 projetos) | `modules/relatorios/funil.ts` | 7B |
| Lista de obras sem paginação no servidor; galeria que limita antes de filtrar | `modules/obras/queries-lista.ts`, `queries-fotos.ts` | 7B |
| Extrato da conta e visão geral financeira sem limite | `modules/financeiro/queries.ts`, `queries-fluxo.ts` | 7B |
| Relatório de estoque: 5.000 itens sem aviso; inativo com saldo fora do valor | `modules/relatorios/estoque.ts` | 7B |
| Pontualidade do painel fixa em 90 dias | `modules/obras/resumo.ts` | 7A |
| Busca sem ignorar acentos (propostas, obras, chamados, compras, a receber, a pagar, margem, seletor de fornecedor) | `contains` do Prisma | 7B |
| Latência com o banco em São Paulo | — | 7B |
| Cache da URL da logo | `modules/configuracoes/queries.ts` | 7B |
