# Pontual Gestão — CLAUDE.md

Sistema de gestão (CRM + obras + financeiro + estoque) da **Pontual Soluções em Esquadrias e Vidros** (Macaé-RJ). Construído pela RM Code, também como laboratório de blocos reutilizáveis.

**Fonte da verdade:** `docs/ESPECIFICACAO.md` (cópia integral da especificação). Releia-a no início de cada fase e diante de dúvida. Em conflito, ela vale mais que qualquer convenção.

## Método
- Uma fase por vez (seção 14 da spec). Ao fim: typecheck, lint, test, build → **revisão sênior (seção 0.6)** → relatório em `docs/revisoes/fase-N.md` → commit → **parar** e esperar "continuar".
- **Commit e push ao concluir cada bloco da fase** (não só no fim), depois de verificado. Conventional Commits em português; só os arquivos do bloco; conferir antes que nenhum `.env*`, PDF ou `docs/referencias/` entra.
- **Nunca editar arquivos com `Get-Content`/`Set-Content` do PowerShell 5.1** (corrompe acentos): usar Edit/Write/node. `tests/unit/encoding.test.ts` barra isso. Rodar o Vitest pelo PowerShell com `D:` maiúsculo.
- Decidir com bom senso e registrar em `docs/DECISOES.md`. Dependências de pessoas vão para `docs/PENDENCIAS.md`.
- Nunca inventar preços, fórmulas, alíquotas, margens ou prazos reais: campo vazio + aviso na interface + PENDENCIAS.
- Nunca imprimir, logar ou commitar valores de `.env*`. Validar conexões mostrando só sucesso/falha e tipo do erro.
- **Mês de teste com dados reais da Pontual** (poucos clientes, maioria pessoa física), inclusive no ambiente hospedado. Privacidade, segurança e vazamento **não** são preocupação agora (decisão 101): não criar bloqueios, avisos nem pendências por isso; tratar o repositório como privado (é público só por limitação do plano Hobby da Vercel). O que continua valendo é proteger os dados do Marcelo de serem **apagados ou poluídos**: nunca commitar `.env*`; testes automáticos só tocam registros com prefixo e nunca limpam nem resetam o banco; não rodar `seed:demo` em banco com dados reais; migração e seed no banco compartilhado só com OK do dono. Endurecimento (Vercel Pro, Supabase Pro, repositório privado, backup, LGPD) só no uso definitivo (Fase 8).

## Stack
Next.js (App Router) + TypeScript estrito + Tailwind + shadcn/ui + lucide-react; PostgreSQL no Supabase (só banco e Storage) via Prisma; Auth.js v5 (Credentials, JWT 8 h); Zod; react-hook-form; TanStack Table; Recharts; dnd-kit; date-fns (America/Sao_Paulo); `@react-pdf/renderer`; Vitest; Playwright. Windows 11/PowerShell: scripts npm multiplataforma, usar `npm`.

## Comandos
`npm run dev | build | start | lint | typecheck | test | test:integracao | test:e2e | format`
`npm run db:migrate | db:deploy | db:studio | seed | seed:demo` (ver `package.json`).

## Estrutura
- `src/lib/*`: blocos genéricos, **sem conhecimento do negócio** (db, auth, auditoria, storage, formatadores, validadores, permissoes).
- `src/lib/dominio/*`: regras puras e testáveis (preço, parcelas, prazos, estoque, fórmulas).
- `src/modules/<modulo>/{actions,queries,schemas,components}`: domínio da Pontual.
- `src/app/(auth)` público; `src/app/(app)` logado; `src/app/api/{public,v1,cron,health}`.
- `prisma/`, `tests/{unit,e2e}`, `docs/`.

## Convenções críticas
- Tabelas/campos/enums em português sem acento; código técnico genérico em inglês; interface em pt-BR (sem "vidraçaria", pouco "lead").
- Dinheiro: `Int` em centavos (`...Centavos`), nunca float; última parcela absorve a diferença. Medidas em mm (`Int`).
- Datas: UTC no banco; calendário em `@db.Date`; exibir `dd/mm/aaaa` em America/Sao_Paulo.
- Toda tabela: `id`, `criadoEm`, `atualizadoEm`, `criadoPorId`, `atualizadoPorId`, `deletadoEm` (exclusão lógica). Nunca apagar fisicamente registro com vínculos.
- Mutações via Server Actions: **sessão (`exigirSessao`) + Zod + auditoria (`LogAuditoria`)** sempre. Permissão por `can(usuario, acao, recurso)` (hoje `true`).
- Estados derivados (atrasado, em garantia, vencido) calculados na consulta; cron só gera notificações/recorrências e é idempotente.
- Fórmulas: interpretador seguro, nunca `eval`. Total da proposta = soma calculada, nunca digitada.
- Nada da empresa fixo no código: textos, cores, logo, endereço vêm de Configurações. A cor da marca (`corPrimaria`) vira tema por `src/lib/tema` (claro e escuro, contraste AA garantido); mexeu em `globals.css`, mantenha `SUPERFICIES` igual (o teste confere).

## Regras de negócio (resumo; detalhes na spec seção 5)
R1 preço (manual/tabela/composição, divisor por dentro) · R3 numeração `NNNN-AA` · R4 congelar proposta enviada · R5 aprovação transacional · R6 parcelas por gatilho · R7/R8 etapas e prazo em dias úteis (relógio inicia na medição exata) · R12 garantia de regulagem 90 dias · R14 estoque/retalhos · R15 custo real por obra.

## Ambiente e infraestrutura
Repo `RMCode-ia-br/pontual-sistema`; Vercel `rmcode1/pontual-sistema` (região `gru1`, igual ao banco; **deploy já feito e variáveis cadastradas**, informado pela RM Code); Supabase **projeto novo em São Paulo (`sa-east-1`)**, plano gratuito (sem backup automático, pausa por inatividade). Segredos `BACKUP_DATABASE_URL` e `BACKUP_PASSPHRASE` **já estão no GitHub**. Variáveis: ver `.env.example`.
- **Migrações e seed saindo de rede IPv4:** `DIRECT_URL` precisa ser o **Session pooler** (porta 5432), não a conexão direta `db.<ref>.supabase.co` (só IPv6; não conecta daqui). `DATABASE_URL` ideal: Transaction pooler (6543, `?pgbouncer=true`). Ver `docs/DECISOES.md` (26).

## Estado
Fases 0 (Fundação), 1 (Cadastros), 2 (Comercial), 3 (Propostas) e 4 (Obras) concluídas e revisadas (`docs/revisoes/fase-0.md` … `fase-4.md`); aguardando o "continuar" para a Fase 5 (Financeiro). **Fase 4 — Obras** (decisões 92–99): modelo de etapas editável (Configurações) e etapas geradas na aprovação (`gerarEtapasDaObra`; parcelas de gatilho já cumprido abrem na hora), obra em `/obras/[id]` (etapas, relógio da medição exata, prazo por proposta, pausas justificadas, parcelas liberadas ao concluir a etapa-gatilho, tarefas de avaliação e fim da garantia, condomínio), lista/quadro por etapa e calendário de instalação, fotos antes/durante/depois, galeria e kit de postagem (autorização R18, legenda sem dado do cliente), assistência e garantia (`/obras/assistencia`, classificação sugerida pelo servidor, cobrança da visita uma vez só), painel e relatório "Obras e assistência". Regras puras em `src/lib/dominio/{dias-uteis,prazo-obra,semaforo,pontualidade,etapas,garantia,chamados,portfolio,relatorio-obras}.ts`; serviços em `src/modules/obras/servico*.ts`. **Logout** revoga a sessão do aparelho (`sid` + `SessaoRevogada`). Nunca inventar duração de etapa, prazo, feriado de Macaé ou férias coletivas (PENDENCIAS). Migrações no banco de São Paulo: `20261115000000_sessao_revogada` e `20261115120000_obras`. Atenção ao editar: remarcar compromisso mantém a linha como `REMARCADO` (conta como vivo); o veredito de pontualidade segue a data (atrasada tem desvio ≥ 1); testes de integração rodam no banco de desenvolvimento com prefixo "Int " e comparam agregados por diferença; specs E2E não podem supor banco vazio (há projetos reais). **Fase 3.5 — Identidade visual** (extra entre fases, fora da spec; decisões 85–91, `docs/IDENTIDADE_VISUAL.md`, `docs/revisoes/fase-3-5.md`) também concluída: tokens do site (Geist, raio .5rem, neutros) no `globals.css`, cor da marca de Configurações derivada para claro e escuro (`src/lib/tema`, injetada no layout raiz, que por isso é `force-dynamic`), logo padrão carregada pela seed só se vazia, ícones/favicon/PWA gerados por `npm run icones` a partir de `public/logo-pontual.png`, PDFs em Geist com a logo também na folha de produção. Sem mudança de schema. A Fase 3 entregou tipologias (composição por fórmulas seguras e tabela de preços, com importação), condições de pagamento, propostas (opções, seções, itens com várias medidas, descrição gerada com plural, desenho esquemático, três modos de preço, revisões, congelamento, comparação, PDF e folha de produção sem valores, links de WhatsApp/e-mail), aprovação transacional (parcelas `ContaReceber`, projeto Aprovado, tarefas), painel e busca global. Migrações no banco de São Paulo: `20261114000000_propostas` e `20261114120000_markup`.
**Regras do dono (Marcelo, 2026-11-13) que prevalecem sobre a spec** (`docs/DECISOES.md` 57–84): venda COM ou SEM nota (a maioria é sem); preço de composição = **custo × (1 + markup)** sobre o custo (80%; 100% guarda-corpo e vidro temperado; em Configurações), manual/tabela sem markup; nota fiscal soma **depois** o acréscimo (5%, configurável) em **linha separada**, nunca em divisor; comissões em zero e só informativas; numeração começa em 2000-26. Regras do código: `src/lib/dominio/{formulas,preco,parcelas,numeracao-proposta,descricao-item,composicao,desenho,estrutura-proposta,ciclo-proposta,texto-proposta}.ts`; serviço e ciclo em `src/modules/propostas/{servico,servico-ciclo}.ts`; PDF em `src/modules/propostas/pdf`.
Referências reais (PDFs das propostas e questionário) ficam em `docs/referencias/` (ignorada pelo Git, nunca commitar); os casos 1127-26 e 1157-26 estão nas fixtures `tests/unit/fixtures-casos-reais.ts`, sem dados do cliente. Atenção ao editar: edição de proposta só em rascunho (`exigirRascunho` trava a linha); enviar congela o conteúdo (snapshot sem custo/markup) e o PDF/aprovação leem dele; uma revisão aprovada por número; o E2E consome números da fila (a limpeza devolve o contador); `AUTH_SECRET`/`CRON_SECRET` vazios no `.env.local` exigem passar segredos só no processo para o E2E. Client Components nunca importam valores de `@/lib/acoes`; toda tabela nova precisa de RLS; "use server" só exporta funções async. Atualize esta seção ao fim de cada fase.

## Documentos
`docs/ESPECIFICACAO.md` · `docs/DECISOES.md` · `docs/PENDENCIAS.md` · `docs/OPERACAO.md` · `docs/APRENDIZADOS.md` · `docs/PADROES_RMCODE.md` · `docs/revisoes/`
