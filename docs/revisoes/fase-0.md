# Revisão sênior: Fase 0 (Fundação)

Data: 2026-11-11. Método (spec 0.6): (1) revisão **independente** por um revisor com contexto limpo, que recebeu só a especificação da fase e o código (sem a conversa nem as minhas conclusões) e trabalhou somente lendo; (2) **verificação de cada achado** por mim, no código e, quando possível, no banco; (3) execução real: testes unitários, de integração com o banco, E2E no navegador (desktop e celular) e revisão visual de capturas de tela.

## Resultado em uma frase

Não havia crítico. Havia **3 altos**, dos quais **2 eram reais e foram corrigidos e comprovados** (tabelas expostas pela API do Supabase e bloqueio de login contornável); o terceiro (senha pública do `admin`) já estava resolvido no banco. A restauração do backup **continua não testada** de ponta a ponta e o teste de TLS do banco segue pendente.

## O que foi executado (estado final)

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | limpo |
| `npm run lint` | zero avisos |
| `npm run build` | passa |
| Testes unitários (Vitest) | **121** passando (11 arquivos) |
| Testes de integração com o banco real | **9** passando (login concorrente e RLS) |
| E2E (Playwright, desktop e celular) | **137** testes + 1 pulado de propósito (atalho Ctrl+K não existe no celular). Rodada completa: 127 passando; as 4 falhas e os 6 testes que não rodaram eram todos do spec de Configurações e foram reexecutados: **28/28**. O código-fonte não mudou entre as duas execuções (só os testes). |
| Revisão visual | capturas de todas as telas em desktop e celular, claro e escuro (login, usuários, feriados, catálogos, upload, etc.) |
| Mutação do guarda de sessão | criei de propósito uma Server Action sem `exigirSessao()`: o guarda falhou nomeando a função (e a mutação foi removida) |

## Achados do revisor independente (e o que foi feito)

### Críticos
Nenhum.

### Altos
| # | Achado | Verificação | Situação |
| --- | --- | --- | --- |
| A1 | Bloqueio de login (5 falhas/15 min) contornável com requisições simultâneas (lia as falhas, gastava o bcrypt e só então gravava) | Confirmado por leitura do fluxo; o teste de integração reproduz o cenário | **Corrigido.** A tentativa é reservada de forma atômica antes do bcrypt (travas de consultoria do PostgreSQL por conta e por IP). Contra o banco real: 20 simultâneas dão exatamente 5 avaliadas e 15 bloqueadas. O teste achou ainda um estouro do prazo de transação sob rajada (corrigido: uma consulta em vez de quatro, caminho rápido e prazos realistas). |
| A2 | Tabelas do schema `public` sem RLS e com privilégio para `anon`/`authenticated` (API de dados do Supabase) | **Confirmado no catálogo do banco:** 19 de 19 tabelas legíveis e graváveis pela chave pública, inclusive `Usuario.senhaHash` | **Corrigido.** Migração `20261111120000_seguranca_rls`; depois dela 0 de 19 expostas. Teste de integração falha se uma tabela nova ficar sem RLS. |
| A3 | Usuário `admin/admin` no banco hospedado | Verifiquei só com um booleano (sem ler a senha): **a senha já não é a pública**; a conta mostra troca concluída e sessão renovada (não foram os meus testes, que nunca tocam no `admin`) | **Resolvido no banco atual.** Para bancos novos: o seed recusa a senha padrão em produção e aceita `ADMIN_SENHA_INICIAL`. |

### Médios
| # | Achado | Situação |
| --- | --- | --- |
| M1 | Redirecionamento aberto residual (`/\t/evil.com`) | **Corrigido** (`destinoSeguro` puro, com testes do ataque) |
| M2 | Upload: tipo vem do cliente; limite só pós-fato; objetos órfãos | **Parcial.** Corrigido: conferência dos primeiros bytes no servidor, bucket com tamanho e tipos fixados, limite sobre o arquivo final. **Pendente:** varrer órfãos na rotina diária |
| M3 | Reordenar catálogo sem auditoria e fora da transação | **Corrigido** (transação, trava por catálogo e auditoria `REORDENAR`) |
| M4 | Feriado removido não podia ser recriado | **Corrigido** (restaura o registro, auditoria `RESTAURAR`) |
| M5 | Valores em reais estouravam o Int de 32 bits com erro genérico | **Corrigido** (teto com mensagem no campo; teste) |
| M6 | TLS do banco sem verificar o certificado | **Pendente** (documentado; instalar a CA do Supabase) |
| M7 | Backup nunca executado de ponta a ponta | **Parcial.** Corrigido: dump só do schema `public`, validado com `pg_restore --list`, permissões mínimas. **Não testado:** `pg_dump`/`pg_restore` reais (a máquina não tem as ferramentas). A criptografia/descriptografia foi testada com `openssl`. |
| M8 | Sem estado "carregando" | **Corrigido** (`loading.tsx` com esqueleto) |
| M9 | Testes não cobriam os caminhos críticos | **Corrigido na maior parte:** guarda estático de sessão (ações e rotas), destino seguro, Páscoa e feriados do seed, assinatura de arquivo, contagem de falhas de login, concorrência e RLS. **Pendente:** teste de `registrarInteracao` |

### Baixos
Corrigidos: B2 (`.csv` no Windows), B3 (foto grande recusada antes de comprimir), B4 (login e e-mail com contadores separados), B5 (falha de infraestrutura mascarada como "senha inválida"), B6 (senha acima de 72 bytes), B7 (exportação truncada sem aviso), B9 (campos internos nas notificações), B14 (dependências `react-hook-form` e `@hookform/resolvers` removidas; `seed:demo` passa a ser um stub honesto), B15 e B16 (permissões mínimas dos workflows, variável sem uso), B17 (documentação desatualizada).
Pendentes (registrados em `docs/PENDENCIAS.md`): B1, B8, B10, B11, B12, B13, B18 (troca de senha com `<form action>`), B19, B20 e parte de B15/B16.

### Requisitos da Fase 0 apontados como não atendidos
| Requisito | Situação |
| --- | --- |
| Relatório de revisão | este arquivo |
| Widgets do painel (spec seção 14) | **Entregue:** tarefas abertas, vencidas, minhas e concluídas (números clicáveis com a definição) e próximas tarefas |
| Estados de carregando | entregue |
| RLS / API de dados | entregue |
| Backup e restauração testados | **Parcial** (ver M7) |
| Atalho de teclado para "Novo"; índice trigram na busca; campos `tipo`/vínculos de Tarefa e `descricao`/`momento`/`usarNoPortfolio` de Anexo; react-hook-form | Pendentes ou decisão registrada (`DECISOES.md` 17); nada disso bloqueia a fase |
| Deploy na Vercel | Documentado; a pasta não está vinculada e o deploy depende de ação da RM Code (`vercel link` e variáveis) |

## Defeitos que a minha verificação achou (e o revisor, lendo, não tinha como ver)

1. **Formulários apagavam o que a pessoa digitou depois de um erro de validação** (comportamento do React 19 com `<form action>`). Achado em captura de tela. Corrigido com o hook `useAcaoDeFormulario` e coberto por teste de regressão.
2. **Texto corrompido na tela** ("Ações" aparecia com caracteres estranhos), causado por eu editar um arquivo com o `Set-Content` do PowerShell. Corrigido; teste permanente barra texto corrompido e BOM.
3. **Função pública sem sessão** (`contarNaoLidas`, num arquivo `"use server"`): corrigida e agora coberta pelo guarda estático.
4. **IDs duplicados** nos formulários de Catálogos (cadastro e diálogo de edição na mesma página).
5. **Escritas dos catálogos fora da transação** (só a auditoria era transacional).
6. **A mensagem "Informe o nome." se perdia** (erro ligado a um campo que a tela não lê).
7. **Avisos (toasts) cobriam o botão Salvar** e a navegação do celular: movidos para o topo.
8. **Mensagem com concordância errada** ("Linha adicionado").

## O que NÃO foi verificado (para ninguém supor cobertura que não houve)

- **Restauração do backup** com `pg_dump`/`pg_restore` reais e o workflow no GitHub Actions (nunca executado).
- **Deploy na Vercel** (não vinculado) e o comportamento em produção; o limite de 10 s das funções no plano Hobby não foi medido.
- **Latência real em produção:** o banco fica em `us-east-1` e as ações levam alguns segundos (upload de arquivo, por exemplo); só medido localmente.
- **`npm audit`:** as vulnerabilidades moderadas reportadas não foram triadas.
- **Acessibilidade com leitor de tela e contraste medido:** revisado por código e captura, sem ferramenta automática.
- **Dispositivos reais:** o "celular" dos testes é a emulação do Chromium (390 px), não um aparelho.
- **Prettier:** o formato dos arquivos não é verificado no CI.

## Pendências que dependem de pessoas

Ver `docs/PENDENCIAS.md`: acesso para o `vercel link` e variáveis na Vercel, segredos do backup no GitHub, teste de restauração, decisão de hospedagem de produção (Vercel Hobby é só laboratório), plano do Supabase com backup, e os dados do negócio (alíquota, margens, último número de proposta, endereço).

## Adendo (2026-11-11, depois da revisão): banco novo em São Paulo

A RM Code trocou o banco por um projeto Supabase em **São Paulo (`sa-east-1`)**, fez o deploy na Vercel (região `gru1`, com as variáveis cadastradas) e cadastrou `BACKUP_DATABASE_URL` e `BACKUP_PASSPHRASE` no GitHub (informado; não conferi). No banco novo foram executados e verificados:

- as 2 migrações do zero, inclusive a de RLS: **0 de 19 tabelas expostas ao papel `anon`** (consulta ao catálogo); extensões `unaccent` e `pg_trgm` ativas;
- o seed (idempotente na segunda execução): `admin` criado com a senha de `ADMIN_SENHA_INICIAL` (verificado por comparação de hash: **não** é a senha pública), troca de senha pendente, alíquota e margens vazias;
- o bucket privado `anexos` (10 MB e 9 tipos), criado por `npm run storage:setup` (o app não o cria sozinho);
- conexão do `DATABASE_URL` e do Storage: sucesso. O `DIRECT_URL` configurado é a conexão direta do Supabase (só IPv6) e **não conecta de redes IPv4**: as migrações rodaram sobrescrevendo-o por processo (ver `DECISOES.md`, itens 25 e 26, e `PENDENCIAS.md`).

Isso resolve a pendência de LGPD (transferência internacional) e a observação de latência deste relatório (as medições de tempo citadas acima eram contra `us-east-1`). O restante do relatório não muda.
