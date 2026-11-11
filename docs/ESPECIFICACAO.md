# PROMPT — "Pontual Gestão": sistema de gestão (CRM + obras + financeiro + estoque) da Pontual Esquadrias

## Papel e missão

Você é o engenheiro de software responsável por construir, do zero, o sistema de gestão da **Pontual Soluções em Esquadrias e Vidros** (Macaé-RJ). É um sistema web que une **CRM** (clientes, funil de vendas, propostas), **gestão de obras**, **financeiro** e **estoque**, com **dashboards e relatórios** para apoiar as decisões do gestor.

Quem vai usar: duas pessoas da gestão (Marcelo e Luan), todos os dias, em computador e, aos poucos, no celular. Precisa ser **profissional, rápido, fácil de operar por quem não é de TI, confiável com dinheiro e prazos, e útil para decidir**. Qualidade de produção: nada de protótipo, dados falsos na interface ou botões que não funcionam.

Este documento é a especificação completa. Leia tudo antes de começar.

---

## 0. Método de trabalho (siga à risca)

### 0.1 Primeiros passos, antes de qualquer código de produto

1. Salve **este documento inteiro, sem resumir**, em `docs/ESPECIFICACAO.md`. Ele é a fonte da verdade. Releia-o no início de cada fase e sempre que tiver dúvida (o contexto da conversa pode ser compactado; o arquivo não).
2. Crie `CLAUDE.md` na raiz (curto, até ~120 linhas): visão do projeto, stack, comandos (dev, build, lint, typecheck, test, db), convenções, regras de negócio críticas e o ponteiro para `docs/ESPECIFICACAO.md`.
3. Crie `docs/DECISOES.md` (decisões e suposições que você tomar, com data e motivo) e `docs/PENDENCIAS.md` (tudo que depende de uma pessoa: credenciais, arquivos, valores reais, validações).
4. Se a pasta atual tiver arquivos de referência (propostas em PDF `1127-26 ... ESQUADRIAS BUZIOS`, `1257-26 ... BOXS - GUARDA CORPO`, e `QUESTIONARIO PONTUAL.pdf`), copie-os para `docs/referencias/` e consulte-os quando precisar. **Esses PDFs contêm dados reais de cliente e do negócio: adicione `docs/referencias/` e o arquivo `env.local.modelo.txt` (se existir) ao `.gitignore`, para que não sejam commitados nem enviados ao GitHub.** O questionário é um PDF digitalizado (imagem). O que importa dele já está resumido na seção 1.
5. Inicialize o repositório Git (`git init`, `.gitignore` adequado, primeiro commit com os documentos-base). Verifique o ambiente (versões de Node, npm e git) e consulte a documentação atual das bibliotecas antes de usá-las. **Não confie na memória sobre APIs**: Next.js, Prisma, Auth.js e outras mudam rápido.

### 0.2 Entrega em fases, com pausa

- O trabalho está dividido em **fases** (seção 14). Construa **uma fase por vez**.
- Ao fim de cada fase: rode `typecheck`, `lint`, testes e `build`; corrija tudo; faça a **revisão sênior (seção 0.6)**, que é obrigatória e vem **antes** de apresentar qualquer coisa; corrija os achados e rode tudo de novo; faça **commit** (Conventional Commits, em português, ex.: `feat(clientes): cadastro com endereços de obra`); atualize `CLAUDE.md`/docs se algo mudou; e **pare** com um resumo curto: o que foi entregue, como testar, resultado da revisão sênior, decisões tomadas e pendências para humanos. **Espere o "continuar"** antes da próxima fase.
- Não adiante telas ou tabelas de fases futuras, exceto o estritamente necessário para não travar a arquitetura.

### 0.3 Como decidir

- **Não pergunte o que dá para decidir com bom senso.** Decida, registre em `docs/DECISOES.md` e siga. Pergunte apenas quando a decisão for cara de reverter ou depender de informação que só o cliente tem. Nesse caso, junte as perguntas em **uma única mensagem** e continue com o que não depende delas.
- **Nunca invente dados reais do negócio**: preços, fórmulas de corte, alíquotas, margens, prazos ou composições técnicas. Crie o campo, deixe vazio ou zerado, mostre um aviso claro na interface (ex.: "Defina a alíquota do Simples em Configurações") e registre em `docs/PENDENCIAS.md`.
- **Nunca invente credenciais** nem coloque segredos no repositório. Liste as variáveis em `.env.example`. Os segredos ficam em `.env.local` (fora do Git). **Nunca imprima, registre em log, comite ou repita os valores de arquivos `.env*`**, nem peça ao usuário para colá-los no chat; ao validar uma conexão, mostre só "sucesso" ou "falha" e o tipo do erro. Se faltar algo que bloqueia, peça.
- Em caso de conflito entre este documento e uma convenção sua, vale este documento. Se achar que ele está errado, diga e proponha a alternativa antes de divergir.

### 0.4 Ambiente

O desenvolvedor usa **Windows 11 (PowerShell)**. Todos os scripts npm devem ser multiplataforma (sem comandos exclusivos de bash). Use `npm`. Node LTS atual.

### 0.5 Definição de pronto (vale para toda fase)

- TypeScript `strict`, sem `any` desnecessário, sem erros de lint/typecheck, `build` passando.
- Toda entrada validada no servidor (Zod). Toda rota/ação exige sessão (exceto as públicas descritas).
- Regras de negócio com **testes unitários** (Vitest). Fluxos críticos com **teste E2E** (Playwright) no fim da fase indicada.
- Telas com estados de **carregando, vazio (com orientação do próximo passo), erro e sucesso**, e funcionando em **celular**.
- Nenhum texto em inglês na interface. Nenhum dado fictício fora dos scripts de demonstração.
- **Revisão sênior (seção 0.6) concluída** e relatório gravado em `docs/revisoes/`.

### 0.6 Revisão sênior antes de apresentar (obrigatória)

Antes de dizer que uma fase (ou o sistema inteiro) está pronta, revise o próprio trabalho como um **analista/engenheiro sênior que não escreveu o código** e vai responder por ele em produção. **Não apresente nenhuma entrega que não tenha passado por esta revisão.**

1. **Mude de papel.** Releia os requisitos da fase em `docs/ESPECIFICACAO.md` e o `git diff` da fase, tratando o código como se fosse de um terceiro. Se houver suporte a subagentes, **use um subagente revisor com contexto limpo**: ele recebe só a especificação da fase e o diff, sem o histórico da sua conversa. Depois, verifique cada achado dele, em vez de aceitar às cegas.
2. **Execute, não presuma.** Rode typecheck, lint, testes e build. Suba o sistema e **percorra os fluxos da fase no navegador** (Playwright), em desktop e em viewport de celular (~390 px). Examine capturas de tela das telas principais e corrija o que estiver cortado, feio, confuso ou lento.
3. **Checklist.** Cada item precisa de evidência ou de correção:
   - *Aderência:* cada regra (R#), requisito e critério de aceite da fase está atendido? Liste o que não está.
   - *Regras de negócio e dinheiro:* cálculos conferidos com exemplos feitos à mão; centavos e arredondamentos; fuso e datas; estados derivados (atrasado, em garantia, etc.).
   - *Segurança:* sessão e validação em toda Server Action e rota; IDs vindos do cliente; upload; segredos fora do repositório; cabeçalhos; mensagens de erro sem vazar detalhes; auditoria registrando as mutações.
   - *Dados:* migrações aplicam do zero e sobre dados existentes; índices; consultas N+1; transações onde há mais de uma escrita; unicidades; exclusão lógica respeitada nas consultas.
   - *Experiência:* estados vazio, carregando e erro; textos em pt-BR sem erro de português; confirmações em ações destrutivas; acessibilidade (teclado, foco, contraste, rótulos); uso no celular.
   - *Código:* duplicação, nomes ruins, funções longas, código morto, `TODO`s, `console.log`, dependências desnecessárias, tipos frouxos, regra de negócio vazando para a interface.
   - *Testes:* cobrem casos de borda e erros, e não só o caminho feliz? Falham de fato quando a regra é quebrada?
   - *Documentação:* README, `CLAUDE.md`, `DECISOES.md`, `PENDENCIAS.md` e `.env.example` atualizados.
4. **Classifique os achados** em Crítico, Alto, Médio e Baixo. **Corrija todos os críticos e altos**, e os médios que forem baratos. Registre o restante como dívida técnica em `docs/PENDENCIAS.md`. Depois de corrigir, **rode tudo de novo**.
5. **Relatório.** Grave `docs/revisoes/fase-N.md` com o que foi revisado, os achados por severidade, o que foi corrigido, o que ficou pendente (e por quê) e como foi testado. Inclua na mensagem de fim de fase um resumo de 5 a 8 linhas. **Seja honesto:** se algo não foi testado ou não funciona, diga.
6. **Revisão final (Fase 8).** Além da fase, revise o **sistema inteiro**: consistência entre módulos, fluxo ponta a ponta com os dados de demonstração, segurança global, desempenho com volume, backup e restauração testados e checklist de produção. Só então apresente a versão final.

### 0.7 Este projeto também é um laboratório da RM Code

A RM Code constrói o sistema da Pontual como **laboratório para os próximos projetos da empresa**. Isso não muda o escopo nem a prioridade (a Pontual vem primeiro), mas muda como você organiza e documenta:

- Separe com clareza os **blocos reutilizáveis** (autenticação e usuários, auditoria, anexos, importação CSV, geração de PDF, chaves de API, backup, CI, convenções de código) do **domínio específico da Pontual** (esquadrias, propostas, etapas de obra). Em termos de pastas: `src/lib/*` e os módulos genéricos **sem conhecimento do negócio**; `src/modules/*` com o domínio.
- **Não crie abstrações genéricas antecipadas.** Apenas isole e documente. Reuso nasce de código simples e bem separado, e não de configuração excessiva.
- Nada da empresa fica fixo no código (já exigido): textos, cores, logo e nomes vêm de Configurações.
- Mantenha, atualizando ao fim de cada fase: `docs/APRENDIZADOS.md` (o que funcionou, o que deu errado e as armadilhas encontradas, com data; por exemplo, Supabase + Prisma, Auth.js e Edge, PDFs em serverless) e `docs/PADROES_RMCODE.md` (os blocos reutilizáveis, onde estão e um checklist para reaproveitá-los em um projeto novo).

---

## 1. Contexto do negócio (extraído do questionário e das propostas reais)

**Empresa.** Pontual Soluções em Esquadrias e Vidros (no mercado há ~30 anos; o atual sócio assumiu o negócio em 1995). Razão social: Marcelo Pinheiro Nogueira. CNPJ 37.323.333/0001-61. Sócio único: **Marcelo Pinheiro**, que também é o gerente comercial e quem elabora todas as propostas. **Luan** é o segundo usuário da gestão. Os e-mails institucionais **ainda serão criados** no domínio novo: `marcelo@pontualmacae.com.br` e `luan@pontualmacae.com.br`. Como o sistema não envia e-mail nesta etapa, as caixas não são necessárias para cadastrar os usuários. Endereço (fábrica e escritório, recebe clientes quando necessário): Rua Eleosina Pereira de Queiroz Matoso, Sol y Mar, Macaé-RJ, CEP 27.940-050. **Atenção:** as propostas trazem o número 185 e o site traz 195. Mantenha o endereço **editável em Configurações**, nunca fixo no código, e registre a dúvida em `docs/PENDENCIAS.md`. Telefone/WhatsApp (22) 99958-3288. E-mail nas propostas: vidracariapontual@gmail.com. Instagram @pontualmacae. Domínio definitivo do site: pontualmacae.com.br.

**Posicionamento.** A empresa **não quer ser vista como "vidraçaria"**. Não use esse termo na interface, nos PDFs nem nos textos padrão. Use "Pontual Soluções em Esquadrias e Vidros" ou "Pontual". O diferencial é **pontualidade, qualidade e entrega**: a empresa promete até **30 dias úteis** para a finalização do serviço, com o objetivo de entregar **antes** do prazo (em obras grandes, a proposta traz prazos por etapa, contados após a medição exata). Isso faz de **cumprimento de prazo** o indicador mais importante do sistema.

**Estrutura.** 10 colaboradores: 8 operacionais (fábrica e instalação) e 2 administrativos/gestão. Fabricação própria em oficina; os vidros temperados e espelhos vêm prontos da fábrica (fornecedor) sob medida. Capacidade: ~**300 m² de esquadrias por mês**. Faturamento médio: ~**R$ 300.000/mês**. Projetos variam de **R$ 5.000 a R$ 300.000**. Regime tributário: **Simples Nacional**. Mão de obra: **salário fixo**.

**Clientes e mercado.** Residências de médio e alto padrão, construtoras, arquitetos, empresas (inclusive offshore). Preferência por projetos médios e grandes. Atende Macaé, Rio das Ostras, Cabo Frio, Búzios, Carapebus, Quissamã, Conceição de Macabu e Serra Macaense (dependendo do volume, não cobra deslocamento). Canais de origem: **Google e indicação** (os melhores clientes são antigos que recomendam), Instagram, WhatsApp, site. Há arquitetos e construtoras parceiros que indicam e são indicados, **sem comissão ou RT**. Concorrentes: Vitória Prime, Italvense, Criare Vidros, Vidraçaria Avenida, Vidral. Perdem orçamentos **majoritariamente por preço**. Também recebem pedidos só para "formalizar preços" (especulação); o gestor quer distinguir quem realmente quer comprar. Qualificam o cliente pela organização da obra e pela reputação de pagamento.

**Produtos e técnica.** Esquadrias de alumínio nas linhas **Suprema, Gold, 23, 25, 28, 30 e Euroshow**; janelas, portas, básculas, portões, pergolados, guarda-corpo, boxes, fechamento de sacada e espelhos sem moldura. Acabamentos: alumínio anodizado ou revestido (pintura), amadeirado; cores preto, branco, bronze e brilhante/dourado. Vidros temperados: incolor, fumê, bronze, refletivo, laminado, ou com película (insulfilm); espessuras vistas nas propostas: 6, 8 e 10 mm. Fornecedores de alumínio e acessórios: Alubold, Pontimac, Dafel, Nova Opção, Klinke (ferragens), AL Ferragens. Fornecedores de vidro: Viminas, Simas, Sandro Acessórios, Blindex. As tabelas de preço dos fornecedores chegam em **PDF pelo WhatsApp**; os reajustes são avisados antes. Cerca de **300 itens** de insumo diferentes. Perfis são comprados em **barras de 6 m**, calculados por **metro linear e kg**; as sobras são guardadas para reaproveitamento ou descartadas e **vendidas como sucata** conforme o tamanho. Mantêm estoque de perfis de alumínio, policarbonato, e boxes e janelas de vidro temperado em medidas padrão. Seguem normas técnicas e emitem **ART** quando solicitada.

**Como orçam hoje.** Planilhas/pastas e **Word**. Marcelo faz a visita técnica (gratuita, ~1 h, agendada no Google Agenda, em Macaé de forma previamente combinada; fora de Macaé consultam disponibilidade) e envia a proposta em ~2 dias. Custo = perfis + acessórios + vidros + mão de obra; preço = custo + impostos + margem. **A cor/acabamento muda o preço por tabela própria** (não por percentual). Existe um programa simplificado só para a linha Suprema; o resto é manual. Alguns orçamentos trazem **mais de uma opção** de material (ex.: linha Suprema ou Gold).

**A proposta real** (veja os PDFs) tem: cabeçalho (cliente, contato, telefone, e-mail, endereço da obra; nº da proposta, data, consultor responsável, e-mail, telefone); título "ESCOPO DO SERVIÇO"; itens agrupados por seção (ex.: "PARTE SUPERIOR", "ESCADA", "SALA FRENTE"); cada item com nº, quantidade, **descrição técnica em maiúsculas**, medidas (L x A em mm), local, **desenho esquemático da esquadria** e valor; **Notas importantes**; **Termos comerciais** (forma de pagamento com valor total por linha, prazos, validade "até alteração dos fornecedores"); assinatura "MARCELO PINHEIRO — GERENTE COMERCIAL"; rodapé com endereço, CNPJ, telefone e e-mail. Uma obra grande pode gerar **mais de uma proposta** ("Parte 01", "Parte 02"). Um mesmo item pode cobrir **várias medidas** (ex.: "MED. 2000 X 3600 / 2000 X 2600") com um valor único. Numeração no formato `NNNN-AA` (ex.: 1127-26). **Forma de pagamento típica:** 50% de sinal na confirmação + 25% na entrega do material (esquadrias) + 25% na entrega dos vidros e instalação; à vista via PIX, transferência ou espécie; a prazo, cartão de crédito em até 12x. Não há contrato separado: a confirmação do pedido vale como aceite.

**Fluxo da obra** (procedimento descrito nas propostas): aprovação → medição exata com os vãos já arrematados → pedido de material e acessórios → fabricação/montagem das esquadrias → instalação das esquadrias → **medição e pedido dos vidros após as esquadrias instaladas** → instalação dos vidros, finalização e acabamento → entrega. Prazos típicos em obra grande: material 30 dias, execução 40 dias, vidros e finalização 20 dias; em obra pequena, 20 a 35 dias. **Nas propostas, o prazo conta a partir da medição exata para produção.** O prazo pode mudar por força maior, atraso de alvenaria ou de terceiros, falta de espaço ou mudança pedida pelo cliente.

**Pós-venda.** Garantia dos vidros **somente até a instalação**. Regulagem de acessórios **até 90 dias** após a instalação; depois disso, a visita é cobrada. Não garantem 100% de vedação em todos os projetos. Em prédios é importante saber se o **condomínio aprovou** a mudança de fachada (ex.: fechamento de sacada) e os horários permitidos.

**Financeiro e fiscal.** Querem **contas a pagar, contas a receber e fluxo de caixa**. Notas fiscais são emitidas **fora do sistema** (NF de venda pelo emissor do Sebrae; NFS-e pelo site da Prefeitura de Macaé). O sistema só **registra** as notas. Não há comissões.

**Uso.** Hoje só os donos usam. Querem experimentar o **celular** (medição na visita, fotos, consulta em obra). Os relatórios devem permitir **filtrar e otimizar as respostas das solicitações** e dar as informações para tomada de decisão. Querem acompanhar o funil: enviados, em negociação, aprovados, perdidos (com o motivo). Querem também uma versão do projeto das esquadrias **com medidas e modelos, sem valores**, para a produção e a instalação.

**Presença digital e marketing.**
- Canais: Instagram **@pontualmacae** (https://www.instagram.com/pontualmacae), Perfil da Empresa no Google (link de compartilhamento: https://share.google/TTMYvE7Tm6mf23uoM) e o site. O briefing registra **8 avaliações no Google** (o site exibe nota 4,5/5) e o desejo de **ter mais avaliações**. No Instagram já postam obras executadas e vídeos, e querem **produzir mais conteúdo** para alimentar as redes. Google e Instagram são canais de origem de clientes e devem direcionar para o WhatsApp. Os acessos ao Perfil do Google, ao Instagram e ao Meta Business são geridos pela **RM Code** (a empresa responsável por este projeto). Termos que os clientes usam na busca: "vidraçaria", "esquadrias de alumínio", "box para banheiro", "guarda corpo".
- **Sazonalidade:** costumam impulsionar o marketing nos meses de baixa demanda (**janeiro a agosto**); **setembro a novembro** têm alta demanda; em **dezembro e no Carnaval** as fábricas e os fornecedores entram em **férias coletivas**, o que afeta compras e prazos.
- **Como usar isso no sistema:** relatório de sazonalidade, períodos de férias coletivas visíveis na agenda e com aviso ao programar compras e prazos (seção 6, `Feriado`), pedido de avaliação no Google ao concluir a obra, e galeria de obras pronta para alimentar o Instagram (seção 7.8).
- **Sobre os dois links:** se você (Claude Code) conseguir abri-los, extraia deles tom de voz, tipos de obra, serviços listados e identidade visual e grave o resumo em `docs/referencias/presenca-digital.md`. **Se estiverem bloqueados para leitura automática (login, robots.txt), não tente contornar:** registre em `docs/PENDENCIAS.md` e peça ao usuário prints ou o texto copiado. O **link de compartilhamento do perfil não é, necessariamente, o link direto para avaliar**: peça o link de avaliação ("escrever avaliação") e deixe os dois campos separados em Configurações.

**Identidade.** Cor da marca: **azul**. Sensações: satisfação, acerto, pontualidade, qualidade e entrega. **Não** transmitir: atraso, retrabalho, burocracia, problemas, "mais barato". O logo será modernizado (deixe-o substituível por upload). O site atual (https://pontual-mu.vercel.app) pode servir de referência visual; se tiver acesso, extraia dele paleta e tipografia. Caso contrário, use azul como cor primária e uma interface limpa e moderna.

---

## 2. Escopo

### 2.1 Dentro do escopo (esta especificação)

Login e usuários; configurações da empresa; cadastros (clientes, parceiros, fornecedores, funcionários e equipes, produtos/insumos, catálogos); funil comercial; agenda de visitas, medições e instalações; propostas com desenho, PDF e opções; acompanhamento de obras por etapas; assistência/garantia; financeiro (a receber, a pagar, contas, fluxo de caixa, DRE gerencial, registro de notas); estoque e compras (inclui retalhos e pedidos de vidro); dashboards e relatórios; importação de dados; API segura para o site e para o futuro agente de IA; PWA; auditoria.

### 2.2 Fora do escopo (não construa, mas deixe a arquitetura preparada)

- **Agente de IA de atendimento no WhatsApp** (outro projeto). O sistema apenas expõe a API da seção 9.
- **Emissão de nota fiscal** (NF-e/NFS-e) e cálculo de impostos. Só registro da nota e uma alíquota efetiva configurável.
- **Permissões por perfil.** Por enquanto, todos os usuários veem e fazem tudo. Mantenha o campo `papel` e centralize toda checagem de permissão em uma função `can(usuario, acao, recurso)` que hoje retorna `true`, para mudar depois em um só lugar. **Não** crie telas de permissões.
- **Plano de corte otimizado** (aproveitamento de barras) e integração com o programa de cálculo atual. Registre como evolução futura.
- Multiempresa (single-tenant). Mesmo assim, **nada da empresa pode ficar fixo no código**: tudo vem de Configurações.
- Leitura automática (OCR/IA) das tabelas de preço em PDF dos fornecedores. Use importação CSV e reajuste em lote.
- Conciliação bancária automática e integração com banco/contador.

---

## 3. Stack e arquitetura

**Decidido pelo cliente:** repositório e app **separados do site**, em subdomínio próprio (sugerido: `sistema.pontualmacae.com.br`). O site só se comunica por API.

- **Next.js** (App Router, versão estável atual) + **TypeScript** estrito + **Tailwind CSS** + **shadcn/ui** (Radix) + ícones **lucide-react**.
- **PostgreSQL** gerenciado no **Supabase**, usado apenas como banco e **Storage** de arquivos (bucket privado, URLs assinadas). Acesso a dados com **Prisma**. Siga a **documentação atual** do Supabase e do Prisma para a conexão: usuário dedicado `prisma` no banco (recomendado; se a RM Code já tiver usado o usuário `postgres`, aceite no início e registre em `PENDENCIAS`); para migrações (inclusive a partir de uma rede só IPv4, como a de casa/escritório) use a string do **Session pooler** (porta 5432); no app em ambiente serverless use a do **Transaction pooler** (porta 6543, com `?pgbouncer=true`). Confirme se a versão do Prisma adotada exige `prisma.config.ts` e driver adapter, e configure `DATABASE_URL` e `DIRECT_URL` de acordo. Migrações versionadas (`prisma migrate`). Habilite as extensões `unaccent` e `pg_trgm` para busca sem acento e tolerante a erros de digitação.
- **Autenticação própria com Auth.js (next-auth v5)**, provedor Credentials (**usuário + senha**; o campo de login aceita o `login` do usuário ou o e-mail, quando houver), senhas com `bcryptjs` (custo ≥ 12), estratégia JWT com validade de 8 h. Separe a configuração compatível com Edge (middleware) da que usa Prisma. A cada requisição protegida, confirme no banco que o usuário está **ativo** e que a `versaoSessao` do token confere (assim, desativar usuário ou trocar a senha invalida as sessões antigas). Bloqueio por tentativas: 5 falhas por e-mail/IP em 15 min travam o login por 15 min (tabela no banco; não dependa de serviço externo). **Não há auto-cadastro.**
- Validação com **Zod**; formulários com **react-hook-form**; tabelas com **TanStack Table** (paginação, filtro e ordenação no servidor); gráficos com **Recharts**; arrastar e soltar do Kanban com **dnd-kit**; datas com **date-fns** (fuso `America/Sao_Paulo`); dinheiro com funções próprias sobre **inteiros em centavos**.
- Mutações via **Server Actions** (com checagem de sessão e validação Zod) e Route Handlers para a API externa e para arquivos. Camada de domínio isolada de UI e de ORM (regras de preço, parcelas, prazos, estoque e fórmulas em `src/lib/dominio/*`, funções puras e testáveis).
- **PDFs** com `@react-pdf/renderer` (funciona em serverless). O **desenho esquemático** das esquadrias é definido uma vez (lista de primitivas) e renderizado tanto em SVG na tela quanto no PDF.
- **Upload de fotos/arquivos:** direto para o Storage por URL assinada, com **compressão no navegador** das imagens (lado maior ~1600 px). Não passe arquivos grandes por Server Action.
- **Rotinas diárias** com Vercel Cron chamando `/api/cron/diario` protegido por `CRON_SECRET`. O sistema **não pode depender do cron para estar correto**: estados derivados (atrasado, em garantia, vencido) são calculados na consulta; o cron só gera notificações e recorrências e é **idempotente** (pode rodar atrasado ou mais de uma vez sem duplicar nada). Verifique as limitações de agendamento do plano da Vercel em uso.
- **PWA** instalável (manifest + ícones), sem modo offline nesta etapa.
- **Testes:** Vitest (unitários), Playwright (E2E). **CI** no GitHub Actions: lint, typecheck, test, build.
- **Repositório e hospedagem.** O código fica em um **repositório privado no GitHub da organização RM Code** (já criado pela RM Code; o usuário informará a URL). O **projeto da Vercel do sistema já existe, ainda vazio**: `pontual-sistema`, no time `rmcode1` (https://vercel.com/rmcode1/pontual-sistema), e deve ser conectado a esse repositório. **O projeto do site fica no mesmo time (https://vercel.com/rmcode1/rmcode-site) e não deve ser alterado.** O repositório é https://github.com/RMCode-ia-br/pontual-sistema. O banco é o **Supabase (plano gratuito), já criado pela RM Code**: referência do projeto `vjuqshbhdzolqjnxcett`, URL `https://vjuqshbhdzolqjnxcett.supabase.co`, poolers em `aws-1-us-east-1.pooler.supabase.com` (Session pooler na porta 5432; Transaction pooler na porta 6543), usuário `postgres.vjuqshbhdzolqjnxcett` e banco `postgres`. **A região real é `us-east-1` (EUA), e não São Paulo**; a RM Code pode decidir recriar o projeto em São Paulo (nesse caso estes valores mudam). Por isso, **defina a região das funções da Vercel (`regions` no `vercel.json`) igual à do banco** (`iad1` para `us-east-1`; `gru1` para São Paulo), evitando latência entre o app e o banco, e registre a decisão em `docs/DECISOES.md`. As credenciais (senha do banco e chave secreta) ficam **só** no `.env.local`; **não estão neste documento de propósito**. Fatos e cuidados que você deve respeitar e documentar:
  - O **plano gratuito do Supabase** tem 500 MB de banco, 1 GB de arquivos, até 2 projetos ativos, **pausa após 1 semana sem uso** e **não tem backups automáticos** (ver a seção 10).
  - O time `rmcode1` está em **plano pessoal (Hobby)** da Vercel, que é **restrito a uso pessoal não comercial**; a Vercel define uso comercial como qualquer deploy usado para ganho financeiro de alguém envolvido na produção do projeto. O sistema é um **laboratório da RM Code** para a empresa Pontual, o que é uma zona cinzenta que a RM Code assume e que só a Vercel pode esclarecer. Portanto: **o deploy na Vercel (Hobby) vale como ambiente de laboratório e de teste, usando apenas dados de demonstração**. **Nenhum dado real de clientes, fornecedores, funcionários ou financeiro da Pontual deve entrar em um ambiente hospedado enquanto não houver decisão** da RM Code sobre a hospedagem de produção (Vercel Pro, outro provedor, ou confirmação da Vercel de que o uso é permitido). Registre isso em `docs/PENDENCIAS.md` e em `docs/OPERACAO.md`, com o checklist da migração para produção. Isso reforça a portabilidade pedida abaixo.
  - Mantenha o projeto **portável**: nada acoplado à Vercel além do Cron e das variáveis de ambiente, para poder trocar de hospedagem sem reescrever.

**Variáveis de ambiente (nomes combinados com a RM Code, que já preparou o `.env.local` com eles; use exatamente estes e documente-os em `.env.example`):**

```
DATABASE_URL=              # Supabase, Transaction pooler (porta 6543, ?pgbouncer=true), usada pelo app
DIRECT_URL=                # Supabase, Session pooler (porta 5432), usada em migrações e no backup
SUPABASE_URL=              # URL do projeto Supabase
SUPABASE_SECRET_KEY=       # chave secreta (service role) do Supabase; só no servidor
SUPABASE_STORAGE_BUCKET=anexos
AUTH_SECRET=               # você gera (ex.: npx auth secret)
AUTH_URL=                  # URL pública do app (local: http://localhost:3000)
NEXT_PUBLIC_APP_URL=       # igual a AUTH_URL
CRON_SECRET=               # você gera
SITE_ALLOWED_ORIGINS=      # origens do site com CORS em /api/public (ex.: https://pontualmacae.com.br)
```

`AUTH_SECRET` e `CRON_SECRET` ficam em branco no `.env.local` do usuário: **gere você** e grave nele. Se a documentação atual de alguma ferramenta pedir outro nome ou variável extra, ajuste e registre em `docs/DECISOES.md`.

Estrutura sugerida:

```
src/app/(auth)/login ...         # público
src/app/(app)/...                # área logada (layout com sidebar)
src/app/api/{public,v1,cron}/... # APIs
src/modules/<modulo>/{actions,queries,schemas,components}
src/lib/{db,auth,dominio,pdf,storage,validadores,formatadores}
prisma/{schema.prisma,migrations,seed.ts,seed-demo.ts}
tests/{unit,e2e}  docs/
```

---

## 4. Convenções de dados e de código

- **Nomes de domínio em português sem acento** em tabelas, campos e enums (ex.: `Cliente`, `Projeto`, `ItemProposta`, `valorTotalCentavos`, enum `StatusProjeto { NOVO_LEAD, ... }`). Código técnico genérico em inglês. Interface em **pt-BR**.
- **Dinheiro:** sempre `Int` em **centavos** (sufixo `Centavos`). Nunca `float`. Parcelas: a **última absorve a diferença** do arredondamento.
- **Medidas:** milímetros em `Int` (`larguraMm`, `alturaMm`). m² e metros lineares são calculados.
- **Datas:** instantes em UTC (`DateTime`); vencimentos e datas de calendário como `@db.Date`. Exibir `dd/mm/aaaa` e `America/Sao_Paulo`. Moeda `R$ 1.234,56`.
- **Padrão de toda tabela:** `id` (cuid/uuid), `criadoEm`, `atualizadoEm`, `criadoPorId`, `atualizadoPorId` e **exclusão lógica** (`deletadoEm`) em cadastros e documentos. **Nunca apague fisicamente** registro com vínculos: inative ou arquive. Lixeira com restauração para os principais cadastros.
- **Auditoria:** tabela `LogAuditoria` (quem, quando, entidade, id, ação, antes/depois em JSON) alimentada por um wrapper central nas mutações. Tela de consulta com filtros.
- **Anexos:** tabela `Anexo` genérica (`entidadeTipo`, `entidadeId`, categoria, nome, caminho no Storage, mime, tamanho, descrição, `momento` ANTES/DURANTE/DEPOIS quando for foto de obra, `usarNoPortfolio` boolean com padrão `true`).
- **Linha do tempo:** tabela `Interacao` (tipo: LIGACAO, WHATSAPP, VISITA, EMAIL, NOTA, SISTEMA; texto; vínculo a cliente e/ou projeto) exibida nas telas de cliente e projeto. Eventos do sistema (mudança de fase, proposta enviada, pagamento recebido) entram automaticamente.
- **Busca:** índice `unaccent` + `pg_trgm`. **Busca global** (Ctrl+K) em clientes, projetos, propostas (por nº), fornecedores e produtos.
- **Telefones** normalizados (E.164 BR) e exibidos com máscara; **CPF/CNPJ** validados; **CEP** com preenchimento automático (ViaCEP) e **CNPJ** com consulta opcional (BrasilAPI), ambos com falha silenciosa (o cadastro manual nunca pode depender deles).
- **Detecção de duplicidade** ao criar cliente (mesmo telefone ou CPF/CNPJ): avise e ofereça abrir o existente.

---

## 5. Regras de negócio (o coração do sistema)

**R1. Preço do item.** Três modos por item: `MANUAL` (valor digitado), `TABELA` (tabela de preços) e `COMPOSICAO` (custo calculado + margem). Convivem na mesma proposta, para o Marcelo migrar aos poucos.
- **Tabela de preços:** chave = tipologia × linha de alumínio × acabamento × tipo e espessura de vidro; cobrança `POR_M2`, `POR_UNIDADE` ou `POR_METRO_LINEAR` (ex.: báscula é preço por unidade; janela e porta por m²; guarda-corpo por metro linear ou peça). A cor/acabamento é uma **linha própria da tabela**, não um percentual. Se faltar linha correspondente, o item cai em `MANUAL` com aviso.
- **Composição:** `preço = custoTotal ÷ (1 − imposto% − margem%)` (método do divisor, "por dentro"). `custoTotal` = materiais (perfis + acessórios + vidros, com perda de corte) + mão de obra de fábrica + mão de obra de instalação (+ deslocamento quando configurado). Alíquota e margem padrão vêm de Configurações e podem ser sobrescritas por proposta e por item. **Se `imposto% + margem% ≥ 100%`, bloqueie com mensagem clara.**
- O **total da proposta é sempre a soma calculada pelo sistema**, nunca digitada. (Nas propostas reais há erro de soma manual: na 1127-26 os itens somam R$ 89.725,00 e o total impresso é R$ 89.145,00.)
- Mostre ao gestor, **só na tela interna** (nunca no PDF): custo estimado, margem em R$ e %, e preço por m². Alerta visual se a margem ficar abaixo de um mínimo configurável.

**R2. Composição técnica.** Cada tipologia pode ter lista de insumos com **fórmula de quantidade** em função de `L` (largura), `A` (altura), `F` (nº de folhas) e `Q` (quantidade), por exemplo `(L/1000)*2 + (A/1000)*2` em metros. Avalie as fórmulas com um **interpretador seguro** (ex.: `mathjs` restrito ou parser próprio), **nunca `eval`**. Valide a fórmula ao salvar. Inclua mão de obra em horas por m² ou por unidade, e perda de corte por insumo (%). **Não preencha composições reais por conta própria**: entregue o motor, o editor e **uma única tipologia de exemplo, desativada e marcada como "EXEMPLO — validar com o Marcelo"**.

**R3. Numeração de propostas.** Formato `NNNN-AA`: contador sequencial global (não reinicia por ano) e `AA` = ano de emissão. O **próximo número é configurável** (o Marcelo já usa números na casa dos 1.100; peça o último usado). Revisões da mesma proposta usam `Rev. N`, sem mudar o número. "Parte 01/02" é um rótulo livre. A política de reinício do contador por ano é configurável (padrão: **não reinicia**; confirmar com o Marcelo). As propostas de amostra trazem data de 2025 com sufixo "-26" (provável data desatualizada no modelo Word): **não replique isso**, use sempre a data real de emissão.

**R4. Ciclo da proposta.** `RASCUNHO` → `ENVIADA` → `APROVADA` | `RECUSADA` | `EXPIRADA` | `SUBSTITUIDA` | `CANCELADA`. Ao marcar `ENVIADA`, **congele** o conteúdo (snapshot); qualquer edição depois cria uma **nova revisão** (a anterior vira `SUBSTITUIDA`), com histórico e comparação simples entre revisões.

**R5. Aprovação de proposta** (ação única e transacional):
1. Registra o **aceite** (data, forma: WhatsApp, e-mail, assinatura ou verbal; observação; anexo opcional) e a **opção aprovada** quando houver mais de uma.
2. Projeto vai para `APROVADO`, com `valorFechado` somado das propostas aprovadas. Outras propostas do mesmo projeto **não** são recusadas automaticamente (podem ser "partes" diferentes); o sistema só pergunta.
3. Gera as **parcelas a receber** conforme a condição de pagamento (R6).
4. Gera as **etapas da obra** (R7) a partir de um modelo. *(Implementado na Fase 4; na Fase 3 deixe o ponto de extensão.)*
5. Cria tarefas: "Agendar medição exata" e, se for prédio, "Confirmar aprovação do condomínio".
6. Interação automática na linha do tempo.

**R6. Condições de pagamento.** Modelos editáveis; cada parcela tem `percentual`, `gatilho` e `forma`. Gatilhos: `CONFIRMACAO`, `ENTREGA_MATERIAL`, `ENTREGA_E_INSTALACAO`, `DATA_FIXA`, `DIAS_APOS_APROVACAO`. Parcelas por gatilho de etapa ficam `AGUARDANDO_GATILHO` (sem vencimento) até a etapa correspondente ser concluída; aí viram `ABERTA` com vencimento = data da conclusão (ajustável) e criam tarefa de cobrança. O mapa **gatilho → tipo de etapa** é configurável; padrão: `ENTREGA_MATERIAL` → conclusão de `FABRICACAO` (esquadrias prontas/entregues) e `ENTREGA_E_INSTALACAO` → conclusão de `INSTALACAO_VIDROS` (registre em `PENDENCIAS` para o Marcelo confirmar). Formas: PIX, TRANSFERENCIA, ESPECIE, CARTAO_CREDITO (nº de parcelas até 12; **sem cálculo de juros**), BOLETO. Modelos iniciais na seção 13.

**R7. Etapas da obra** (modelo padrão, editável em Configurações): `MEDICAO_EXATA` → `PEDIDO_MATERIAL` → `FABRICACAO` → `INSTALACAO_ESQUADRIAS` → `MEDICAO_VIDROS` → `PEDIDO_VIDROS` → `INSTALACAO_VIDROS` → `ACABAMENTO` → `ENTREGA`. Cada etapa tem status (`PENDENTE`, `EM_ANDAMENTO`, `CONCLUIDA`, `BLOQUEADA`), responsável ou equipe, datas previstas e reais, e **motivo de bloqueio** de uma lista editável (aguardando fornecedor, alvenaria não pronta, aguardando cliente, aguardando condomínio, clima, falta de espaço/outra demanda no local, mudança pedida pelo cliente, outro). Os prazos vêm da proposta (**por etapa** ou **prazo total simples**, ex.: "20 a 35 dias"). Ao concluir uma etapa, o sistema **sugere** reprogramar as seguintes; nunca altera datas sozinho.
- **Modelo de etapas:** cada etapa do modelo tem `grupoPrazo` (`MATERIAL`, `EXECUCAO` ou `VIDROS_FINALIZACAO`, que correspondem aos três prazos impressos nas propostas) e `peso` dentro do grupo (padrão: igual). Mapeamento padrão: `MATERIAL` = `PEDIDO_MATERIAL` + `FABRICACAO`; `EXECUCAO` = `INSTALACAO_ESQUADRIAS`; `VIDROS_FINALIZACAO` = `MEDICAO_VIDROS` + `PEDIDO_VIDROS` + `INSTALACAO_VIDROS` + `ACABAMENTO` + `ENTREGA`. `MEDICAO_EXATA` não entra em nenhum grupo (é o marco que inicia o relógio). O sistema **propõe** as datas distribuindo os dias de cada grupo entre suas etapas; o gestor ajusta. No modo "prazo total simples" (ex.: "20 a 35 dias"), o **prazo prometido usa o valor máximo**.
- **Status do projeto na execução:** passa a `EM_EXECUCAO` quando qualquer etapa entra em andamento e a `CONCLUIDO` quando a etapa `ENTREGA` é concluída (grava `dataConclusao`).

**R8. Prazo e pontualidade** (indicador-chave).
- O relógio do prazo começa na **conclusão da `MEDICAO_EXATA`**. Antes disso, as datas das etapas seguintes são **provisórias** (calculadas a partir da data agendada da medição, ou da aprovação se não houver agendamento) e marcadas como tal na interface; ao concluir a medição, recalcule e **sugira** as datas definitivas. `prazoFinalPrometido` = essa data + prazo da proposta, em **dias úteis** (padrão, configurável para corridos), descontando **feriados** cadastrados (tabela `Feriado`; pré-carregue os nacionais e permita incluir os de Macaé).
- **Pausas justificadas** (motivos não imputáveis à Pontual: cliente, alvenaria, condomínio, força maior) estendem o prazo prometido, com registro de início, fim, motivo e quem registrou.
- Etapa atrasada = hoje > data prevista de fim e não concluída. **Semáforo:** verde (no prazo), amarelo (vence em até 3 dias; configurável), vermelho (atrasada).
- **Pontualidade %** = obras concluídas até o prazo prometido (já considerando pausas) ÷ obras concluídas no período. Mostre também a média de dias de desvio e a versão "sem considerar pausas".

**R9. Visitas, medições e agenda.** Visita técnica é **gratuita**, duração padrão **60 min** (configurável), com horário comercial configurável (padrão: seg a sex 8h–18h, sáb 8h–12h; o gestor pode agendar fora). Conflito de horário do mesmo responsável ou equipe gera **alerta, não bloqueio**. Na visita (inclusive pelo celular) registre: ambiente, tipologia, largura, altura, observação e foto de cada vão (**medidas-rascunho**) e dados da obra: fase (planta, em construção, pronta), arquiteto envolvido, prazo desejado, investimento previsto, condomínio (nome, exige aprovação da fachada, aprovado?, horários permitidos, contato do síndico). Botão **"Importar medidas da visita para a proposta"** cria os itens a partir das medidas-rascunho.

**R10. Qualificação do lead.** Campos no projeto: `porte` (PEQUENO, MEDIO, GRANDE; definido manualmente, com faixas de valor **opcionais** em Configurações para sugerir automaticamente; não invente as faixas), `interesse` (COMPRA_REAL, SO_ORCAMENTO_ESPECULACAO, INDEFINIDO), `temperatura` (FRIA, MORNA, QUENTE) e `origem`. Origens: GOOGLE, INDICACAO_CLIENTE, ARQUITETO_PARCEIRO, INSTAGRAM, WHATSAPP, SITE, PLACA_NA_OBRA, CLIENTE_ANTIGO, OUTRO (+ detalhe). **Motivos de perda** (lista editável, obrigatório ao marcar `PERDIDO`): preço, prazo, escolheu concorrente, só queria orçamento/especulação, adiou ou desistiu da obra, sem retorno, fora da região, serviço que não oferecemos, outro (+ detalhe). Se escolheu concorrente, campo opcional "qual".

**R11. Follow-up automático** (prazos configuráveis): proposta marcada `ENVIADA` → tarefa "Acompanhar proposta" em D+3; proposta sem resposta há mais de N dias entra na lista "Sem retorno"; obra concluída → tarefa "Pedir avaliação no Google" em D+2 (com link e mensagem do WhatsApp prontos); fim da garantia de regulagem → aviso 7 dias antes.

**R12. Garantia e assistência.** Garantia de **regulagem** = `garantiaRegulagemDias` (padrão 90) contados da **conclusão da instalação** (etapa de referência configurável; padrão `INSTALACAO_VIDROS`). **Vidros: garantia só até a instalação.** Ao abrir um chamado, o sistema classifica automaticamente (`EM_GARANTIA` / `FORA_DA_GARANTIA`) e sugere `cobrarVisita`; o gestor pode sobrescrever e registrar o valor cobrado (que gera conta a receber opcional).

**R13. Reajuste de fornecedor.** Alterar custo de um insumo grava `HistoricoPreco` (valor anterior, novo, data, origem: manual, reajuste em lote, importação; fornecedor; usuário). **Reajuste em lote por fornecedor ou categoria** (+x% ou valor fixo) com **pré-visualização** antes de aplicar. Propostas `RASCUNHO`/`ENVIADA` com itens em `COMPOSICAO` que dependem de insumo reajustado recebem o aviso **"custo desatualizado desde a emissão"**. A validade padrão da proposta é **"Até alteração dos fornecedores"**, com data limite opcional; permita marcar "validade encerrada por reajuste".

**R14. Estoque e retalhos.**
- Saldo por produto = soma dos movimentos (guarde também saldo em cache, atualizado na mesma transação). Tipos de movimento: `ENTRADA_COMPRA`, `SAIDA_OBRA`, `AJUSTE`, `DEVOLUCAO`, `PERDA`, `VENDA_SUCATA`. Saída sem saldo exige confirmação explícita e justificativa.
- Perfis têm `comprimentoBarraMm` (padrão 6000) e `pesoKgPorMetro`. Ao baixar uma obra, a saída pode ser por barra inteira ou por comprimento cortado; a sobra **≥ `retalhoMinimoMm`** (configurável) vira um `Retalho` `DISPONIVEL` (com medida e local); a sobra menor vira **sucata** (kg) acumulada para venda. Retalhos podem ser consumidos em obras futuras.
- **Alerta de estoque mínimo é opcional por produto** (campo vazio = sem alerta). O cliente disse que hoje não precisa.
- **Destino da compra:** `ESTOQUE` (gera entrada) ou `OBRA` (custo direto da obra, sem passar pelo estoque; é o caso típico dos vidros sob medida). Isso evita contar o mesmo custo duas vezes.

**R15. Custo real e margem por obra** = compras com destino `OBRA` + saídas de estoque da obra (valorizadas ao custo da época) + contas a pagar vinculadas ao projeto + **mão de obra rateada** (`custoMaoDeObraPorM2` × m² da obra; o parâmetro é calculado a partir dos salários da área operacional ÷ capacidade mensal em m², e pode ser sobrescrito) + imposto (alíquota × receita). Margem = receita − custo real. Mostre sempre **de onde vem cada parcela do custo**, para o gestor confiar no número.

**R16. Notas fiscais.** Só registro: tipo (VENDA ou SERVICO), número, série, data, valor, link/arquivo (PDF/XML), projeto e cliente. Alerta "obra com recebimento sem nota registrada".

**R17. Faturamento e Simples Nacional.** Exiba o **faturamento acumulado dos últimos 12 meses** com limite configurável (padrão R$ 4.800.000,00; **validar o valor atual com o contador**), com alerta ao se aproximar (ex.: 80% e 90%). A empresa fatura ~R$ 300 mil/mês, então esse indicador é relevante.

**R18. Cadastros relacionados.** Cliente pode ter vários **endereços de obra** e vários **contatos**; pode ser marcado como arquiteto/designer, construtora, empresa ou cliente final (marcações combináveis), e ter `indicadoPor` (outro cliente/parceiro). **Clientes inativos há mais de 12 meses** alimentam um relatório de reativação. A "autorização para usar fotos no portfólio" é padrão `true` por obra (os clientes nunca se opuseram), com opção de desmarcar.

---

## 6. Modelo de dados (entidades principais)

**`Projeto` é a entidade única do ciclo inteiro**: na interface comercial chama-se "Projeto"; depois de aprovado aparece como "Obra" (mesmo registro, sem duplicar dados). Modele no Prisma, com chaves estrangeiras, índices (incluindo os de busca e de filtros frequentes), `enum`s e restrições de unicidade. Campos além dos listados são bem-vindos se forem coerentes com as regras acima. **Todo campo monetário segue a convenção da seção 4 (`...Centavos`, inteiro)**, mesmo quando abaixo aparece só o nome do conceito (ex.: "valor fechado" = `valorFechadoCentavos`). Todas as tabelas seguem o padrão da seção 4.

**Sistema e configuração.** `Usuario` (nome, login único sem diferenciar maiúsculas, email opcional e único quando preenchido, senhaHash, ativo, papel [só ADMIN por ora], precisaTrocarSenha, versaoSessao, ultimoLoginEm); `TentativaLogin`; `ConfiguracaoEmpresa` (singleton: razão social, nome fantasia, CNPJ, endereço, telefone, WhatsApp, e-mails, horários, logo, aliquotaImpostoPercentual, margemPadraoPercentual, margemMinimaAlertaPercentual, metaFaturamentoMensalCentavos [padrão 30000000], capacidadeProducaoM2Mes [padrão 300], garantiaRegulagemDias [90], retalhoMinimoMm, custoMaoDeObraPorM2Centavos, tipoDias [UTEIS], diasFollowUpProposta [3], linkAvaliacaoGoogle (link direto para avaliar), googlePerfilUrl, instagramUrl, limiteSimplesCentavos, próximo número de proposta, consultor padrão e cargo na assinatura, dados de pagamento exibidos nos termos, flags de PDF [exibir valor por item, descrições em maiúsculas]); `ChaveApi`; `Feriado` (com `tipo`: `FERIADO`, `FERIAS_COLETIVA_FORNECEDORES` ou `OUTRO`; os dois últimos aparecem como faixas na Agenda e geram aviso ao programar compras e prazos; só `FERIADO` desconta dias úteis); `LogAuditoria`; `Anexo`; `Interacao`; `Tarefa` (título, tipo, responsável, vencimento, status, vínculos); `Notificacao` (sino do sistema); `ModeloTexto` (textos padrão das propostas e mensagens de WhatsApp, com variáveis).

**Catálogos editáveis** (tabelas simples com ativo/ordem): `LinhaAluminio`, `AcabamentoAluminio`, `TipoVidro`, `CategoriaProduto`, `MotivoPerda`, `MotivoBloqueio`, `CategoriaFinanceira` (receita/despesa, com grupo para o DRE). (`Tipologia` está em "Comercial".)

**Cadastros.** `Cliente` (tipoPessoa PF/PJ, nome/razão social, fantasia, cpfCnpj, telefone, whatsapp, email, marcações [clienteFinal, arquiteto, construtora, empresa], origem, indicadoPorId, observações, ativo); `EnderecoCliente` (cobrança e obras: apelido, logradouro, número, complemento, bairro, cidade, UF, CEP, dados de condomínio); `ContatoCliente`; `Fornecedor` (razão social, fantasia, CNPJ, categorias, contato/vendedor, telefone, e-mail, condições de pagamento, prazo de entrega, observações); `Funcionario` (nome, CPF, telefone, e-mail, cargo, função [VENDAS, PROJETO, FABRICA, INSTALACAO, ADMINISTRATIVO, GESTAO], admissão, demissão, salarioBaseCentavos, custoHoraCentavos opcional, ativo, vínculo opcional com `Usuario`); `Equipe` e `EquipeMembro`; `Produto` (código, descrição, categoria, unidade [UN, M, M2, KG, BARRA, L, PAR, CJ], linha e acabamento opcionais, fornecedor principal, custoUnitarioCentavos e data da atualização, comprimentoBarraMm, pesoKgPorMetro, larguraMm/alturaMm para produto acabado de pronta entrega, estoqueMinimo opcional, localização, ativo); `HistoricoPreco`.

**Comercial.** `Projeto` (código `P-AAAA-NNNN`, título, cliente, endereço da obra, arquiteto/construtora, responsável, **status** [NOVO_LEAD, VISITA_AGENDADA, ELABORANDO_PROPOSTA, PROPOSTA_ENVIADA, NEGOCIACAO, APROVADO, EM_EXECUCAO, CONCLUIDO, PERDIDO, CANCELADO], tipos de serviço, origem, porte, interesse, temperatura, faseDaObraCliente, investimentoPrevisto, prazoDesejado, valorEstimado, valorFechado, motivo de perda + detalhe, resumoAtendimento [preenchido pela IA no futuro], canal, datas de fechamento/conclusão, `dataInicioPrazo`, `prazoFinalPrometido`, `diasPausaJustificada`); `EventoAgenda` (tipo [VISITA_TECNICA, MEDICAO_EXATA, MEDICAO_VIDROS, INSTALACAO, ENTREGA, ASSISTENCIA, REUNIAO], início, duração, responsável/equipe, endereço, status [AGENDADO, CONFIRMADO, REALIZADO, REMARCADO, CANCELADO, NAO_COMPARECEU], lembrete); `MedidaRascunho`; `Tipologia` (nome, categoria, tipo de desenho, opções de folhas, template de descrição, tipo de cobrança padrão, exige esquadria); `ComposicaoInsumo` e `ComposicaoMaoDeObra`; `TabelaPreco` (tipologia, linha, acabamento, tipo/espessura de vidro, tipo de cobrança, valorCentavos, vigência); `CondicaoPagamento` e `CondicaoParcela`; `Proposta` (projeto, número, revisão, parte, status, data, consultor, **snapshot** do cabeçalho do cliente, título do escopo, validade, prazos, condição de pagamento, textos de notas e termos, desconto, observações internas, aceite, opção aprovada); `OpcaoProposta` (ex.: "LINHA SUPREMA", "LINHA GOLD"); `GrupoProposta` (ex.: "PARTE SUPERIOR"); `ItemProposta` (grupo, opção, ordem automática, tipologia, linha, acabamento, vidro, espessura, descrição técnica editável, local, observações, **configuração de desenho**, modo de preço, preço total, custo estimado) e `ItemPropostaMedida` (largura, altura, quantidade, local — vários por item).

**Execução.** `EtapaProjeto`; `PausaProjeto` (início, fim, motivo, justificada); `Chamado` (assistência/garantia); `ModeloEtapas` (modelo editável).

**Financeiro.** `ContaFinanceira` (banco/caixa/espécie, saldo inicial); `ContaReceber` (parcela: projeto, proposta, cliente, descrição, valor, vencimento opcional, gatilho, status [AGUARDANDO_GATILHO, ABERTA, PARCIAL, PAGA, CANCELADA; "atrasada" é derivada], forma, pagamentos); `ContaPagar` (fornecedor/funcionário/outro, categoria, projeto opcional, compra opcional, valor, vencimento, recorrência [mensal, etc.], parcelas, status, forma); `Lancamento` (data, entrada/saída, valor, conta financeira, categoria, vínculo com conta a pagar/receber, transferência entre contas, conciliado); `NotaFiscal`.

**Estoque e compras.** `MovimentoEstoque`; `Retalho`; `Compra` (fornecedor, tipo [MATERIAL, VIDRO], destino [ESTOQUE, OBRA], projeto opcional, status [RASCUNHO, PEDIDO, RECEBIDO_PARCIAL, RECEBIDO, CANCELADO], datas, condições) e `ItemCompra` (produto ou descrição; para vidro: largura, altura, espessura, tipo, quantidade, beneficiamentos, vínculo ao item da proposta); `ListaMateriais` gerada da composição das propostas aprovadas.

---

## 7. Módulos e telas

Menu lateral (colapsável; no celular, barra inferior com os itens principais e menu "Mais"): **Painel**; **Comercial** (Funil, Projetos, Propostas, Agenda, Tarefas); **Clientes** (Clientes, Parceiros); **Obras** (Em andamento, Calendário de instalação, Assistência e garantia, Galeria de obras); **Financeiro** (Visão geral e fluxo de caixa, A receber, A pagar, Contas e lançamentos, Notas fiscais); **Estoque e compras** (Produtos, Movimentações, Retalhos, Compras); **Cadastros** (Fornecedores, Funcionários e equipes, Tipologias e preços, Catálogos); **Relatórios**; **Configurações** (Empresa, Usuários, Modelos de texto, Condições de pagamento, Modelo de etapas, Integrações/API, Importação, Auditoria, Backup); **Perfil** (trocar senha); **Ajuda**. Botão global **"+ Novo"** (cliente, projeto, proposta, visita, tarefa, conta) e **busca global** no topo (Ctrl+K). **Sino** de notificações.

Todas as listas: busca, filtros relevantes (com filtros salvos), ordenação, paginação no servidor, escolha de colunas, **exportar CSV** e ações em lote quando fizer sentido. Todos os detalhes: abas (Resumo, dados, anexos, linha do tempo, histórico). Formulários com validação inline, máscaras, mensagens em português e proteção contra perda de dados ao sair.

**7.1 Login e usuários.** Tela de login com a identidade da Pontual (campos "Usuário" e "Senha"). **Troca obrigatória de senha no primeiro acesso**, e também sempre que um administrador redefinir a senha. Tela "Usuários": criar (nome, usuário/login, e-mail opcional, senha temporária exibida uma única vez), editar, ativar/desativar, redefinir senha. **Nunca permita desativar o último usuário ativo.** Quando existirem outros usuários, mostre um aviso sugerindo desativar o usuário `admin` padrão. É por esta tela que Marcelo e Luan serão cadastrados. Sem "esqueci a senha" por e-mail nesta etapa: o gestor redefine na tela de usuários (registre como possível evolução com serviço de e-mail transacional).

**7.2 Clientes e parceiros.** Lista e detalhe (abas: dados, endereços de obra, contatos, projetos, propostas, financeiro do cliente, anexos, linha do tempo). "Parceiros" é uma visão filtrada de clientes marcados como arquiteto/construtora, mostrando projetos indicados, fechamentos e valor. Botões de **WhatsApp** (`wa.me` com mensagem de um modelo), ligar e e-mail.

**7.3 Funil e projetos.** **Kanban** com as fases `NOVO_LEAD → VISITA_AGENDADA → ELABORANDO_PROPOSTA → PROPOSTA_ENVIADA → NEGOCIACAO → APROVADO` e coluna final "Perdidos", arrastando cartões entre colunas (mover para `PERDIDO` pede o motivo; `APROVADO` só via aprovação de proposta). Cartão mostra cliente, valor, porte, temperatura, dias parado e próxima tarefa. Filtros por responsável, origem, porte, período. **Visão em lista** equivalente. Detalhe do projeto: resumo, qualificação, endereço/condomínio, visitas e medidas, propostas, etapas e prazo (após aprovado), financeiro e custo real, anexos e fotos, tarefas e linha do tempo. O Kanban comercial vai até `APROVADO` (mais a coluna "Perdidos"); a partir daí o mesmo projeto aparece em **Obras → Em andamento** (`APROVADO`/`EM_EXECUCAO`) e, depois, em concluídas.

**7.4 Agenda.** Calendário (mês, semana, dia, lista) com visitas, medições, instalações, entregas e assistências; filtro por responsável/equipe/tipo; agendar clicando no horário; **horários livres** sugeridos; alertas de conflito; **exportar em .ics** e **feed .ics assinável** por URL com token secreto e revogável (compatível com Google Agenda, que o Marcelo usa hoje). Tela de **visita no celular** otimizada: medidas-rascunho, fotos pela câmera, dados da obra e condomínio.

**7.5 Tarefas.** Lista por responsável, vencimento e status; criação rápida; tarefas automáticas das regras R5 e R11; destaque das vencidas.

**7.6 Tipologias e preços.** Cadastro de tipologias (nome, folhas, tipo de desenho, template da descrição, cobrança padrão) com seeds da seção 13; **editor de composição** com teste da fórmula usando L/A de exemplo; **tabela de preços** em grade (tipologia × linha × acabamento × vidro) com edição em massa e importação CSV; aviso das combinações sem preço.

**7.7 Propostas.**
- Lista com status, valor, cliente, data, "dias desde o envio", filtro por revisão.
- **Editor** (tela cheia): cabeçalho (cliente e endereço puxados do projeto, editáveis), título do escopo, **opções** (abas "Linha Suprema", "Linha Gold"; botão **duplicar opção** que copia os itens e recalcula com outra linha/vidro), **grupos** (seções) reordenáveis, **itens** reordenáveis e numerados automaticamente. No item: tipologia, linha, acabamento, vidro e espessura, **uma ou várias medidas** (L × A × quantidade), local, observações, desenho em tempo real, **descrição técnica gerada** pelo template (com plural correto pela quantidade, editável livremente), modo de preço, valor. Painel lateral fixo com total por opção, m² total e (interno) custo e margem.
- **Duplicar item**, **duplicar proposta** (como base de nova) e **importar medidas da visita**.
- Condição de pagamento (escolher modelo, ver o cronograma gerado), prazos (por etapa ou total), validade, notas e termos (textos do modelo, editáveis nesta proposta, numeração automática das cláusulas), desconto opcional.
- **Pré-visualização e PDF** fiéis ao layout real descrito na seção 1 (A4 retrato, itens sem quebrar entre páginas, rodapé em todas as páginas, desenho em cada item, numeração e totais). Visual **modernizado** com a identidade azul e o logo, mas **com a mesma estrutura de conteúdo**. Opções por proposta: exibir ou não valor por item; descrições em maiúsculas.
- Ações: enviar por **WhatsApp** (link `wa.me` + PDF para baixar/anexar) e **e-mail** (`mailto:` com texto do modelo), marcar `ENVIADA`, **aprovar** (R5), **recusar** (pede motivo de perda), nova revisão, comparar revisões.
- **Folha de produção / Ordem de serviço** (PDF **sem valores**): itens aprovados com medidas, tipologia, linha, acabamento, vidro, desenho, local e observações, para fábrica e instaladores.

**7.8 Obras.** Kanban por etapa e lista; detalhe com linha do tempo de etapas, datas previstas × reais, semáforo, pausas justificadas, prazo prometido e pontualidade da obra, lista de materiais, compras vinculadas, financeiro, fotos **antes/durante/depois**, diário simples. **Calendário de instalação** por equipe. **Assistência e garantia:** chamados com classificação automática (R12), fotos, agendamento, resolução. **Galeria de obras:** fotos marcadas para portfólio, filtráveis por tipo de serviço, cidade e ano, para alimentar o site e o Instagram. Inclua o **"kit de postagem"**: baixar as fotos selecionadas (inclusive pares antes/depois) com uma **legenda sugerida** gerada de um modelo de texto (tipo de serviço, linha de alumínio, cidade e região), e marcar a obra como "já publicada no Instagram" (com a data) para não repetir. **Nunca inclua nome, telefone ou endereço do cliente na legenda sugerida.**

**7.9 Financeiro.**
- **A receber:** lista com status, vencimento, cliente/obra; "atrasadas", "hoje" e "próximos 7 dias"; registrar pagamento total ou parcial (data, forma, conta, comprovante); botão de **cobrança por WhatsApp** (modelo); reabrir/estornar com auditoria.
- **A pagar:** lançamento único, parcelado ou recorrente; vínculo opcional a fornecedor, projeto, compra e categoria; baixa com comprovante; **recorrentes** (aluguel, energia, DAS, salários) gerados automaticamente para os próximos meses. Possibilidade de gerar as contas de salário a partir do cadastro de funcionários (opcional e editável).
- **Contas e lançamentos:** contas financeiras, saldo, transferências, extrato, marcação de "conciliado" manual.
- **Fluxo de caixa:** realizado × projetado (30/60/90 dias, e por mês), por conta; gráfico e tabela.
- **DRE gerencial** simplificado por mês (regime de caixa por padrão, opção de competência): receitas, custos diretos, despesas por grupo, resultado.
- **Notas fiscais:** registro e consulta (R16).

**7.10 Estoque e compras.** Produtos (lista de ~300 itens, filtros por categoria/linha/fornecedor), detalhe com saldo, histórico de preço e movimentos; **entrada, saída e ajuste** rápidos; **Retalhos** (R14); **Compras** (rascunho → pedido → recebimento total/parcial; recebimento atualiza custo, gera entrada ou custo de obra e, opcionalmente, a conta a pagar); **pedido de vidro** a partir dos itens da obra, com as medidas conferidas após a instalação das esquadrias; **lista de materiais** da obra a partir das composições.

**7.11 Configurações.** Dados da empresa e identidade (logo, cores); parâmetros (alíquota, margens, metas, capacidade, garantia, prazos de follow-up, horários, feriados); modelos de texto (notas e termos da proposta, mensagens de WhatsApp: confirmação e lembrete de visita 24 h antes, envio de proposta, follow-up, cobrança, pedido de avaliação Google, confirmação de instalação), com variáveis como `{{cliente}}` e `{{numeroProposta}}`; condições de pagamento; modelo de etapas; catálogos; **Integrações/API** (criar e revogar chaves, ver último uso); **Importação**; **Auditoria**; **Backup e saúde do sistema** (exportação completa em CSV/JSON compactado; tamanho do banco e uso do armazenamento de arquivos frente aos limites do plano, com alerta a partir de 70% e 90%; data do último backup automático).

**7.12 Importação.** Assistente em 4 passos (enviar arquivo CSV/XLSX → mapear colunas → **pré-visualizar com erros e duplicidades** → confirmar) para clientes, fornecedores, produtos e tabela de preços, com **modelo de planilha para baixar**. Importação reversível (por lote) e auditada.

**7.13 Ajuda e onboarding.** Página "Primeiros passos" com checklist do que configurar (dados da empresa, alíquota/margem, catálogos, usuários, primeira tipologia e tabela de preços), dicas contextuais e textos de estado vazio que orientam o próximo passo. Gere `docs/GUIA_DE_USO.md` em português simples, para treinar o Marcelo e o Luan.

---

## 8. Dashboards e relatórios

Dados calculados no banco (agregações SQL/`groupBy`), com índices adequados e filtros de período. Todo número do painel é **clicável** e leva à lista filtrada correspondente. Tudo exportável em CSV e imprimível.

**Painel (home).** Seletor de período (mês atual por padrão). Blocos:
1. **Faturamento** do mês (recebido e vendido/fechado) × meta (padrão R$ 300 mil), com comparação ao mês anterior e ao mesmo mês do ano passado.
2. **Funil comercial:** quantidade e valor por fase; propostas em aberto; **taxa de fechamento** (últimos 90 dias); ticket médio; tempo médio visita → proposta enviada.
3. **Atenção hoje:** propostas sem retorno, tarefas vencidas, visitas de hoje e de amanhã (com botão de lembrete por WhatsApp), parcelas vencendo ou atrasadas, etapas atrasadas.
4. **Obras:** quantidade por etapa, semáforo de prazo, **pontualidade %** do período, próximas instalações.
5. **Caixa:** saldo atual, a receber (vencido/hoje/7 dias), a pagar (vencido/hoje/7 dias), **fluxo projetado 30/60/90 dias**.
6. **Produção:** m² em produção × capacidade mensal (padrão 300 m²), em % de ocupação.
7. **Origem dos leads** do período e **motivos de perda**.
8. **Faturamento 12 meses (RBT12) × limite do Simples** (R17).

**Definições dos indicadores** (implemente exatamente assim e mostre a definição em um tooltip "como é calculado"):
- **Vendido** = soma do valor fechado dos projetos aprovados no período (pela data da aprovação). **Recebido** = soma dos pagamentos de contas a receber no período (pela data do pagamento).
- **Taxa de fechamento** = projetos `APROVADO` ÷ (`APROVADO` + `PERDIDO` que tiveram proposta enviada), por data da decisão, na janela escolhida (padrão 90 dias).
- **Ticket médio** = vendido ÷ número de projetos aprovados no período.
- **Tempo visita → proposta** = data de envio da primeira proposta − data da visita realizada (em dias).
- **Ocupação da fábrica** = m² dos itens das obras cuja etapa `FABRICACAO` está em andamento ou prevista para começar nos próximos 30 dias ÷ capacidade mensal em m².
- **Pontualidade** e **margem por obra**: conforme R8 e R15.

**Relatórios** (cada um com filtros de período, cliente, origem, responsável, tipo de serviço etc. e gráfico + tabela):

- *Comercial:* vendas por período; funil e conversão por fase; motivos de perda; **origem dos clientes** (leads, propostas, fechamento, faturamento por origem); **desempenho por arquiteto/construtora parceiro**; tempos de resposta (visita → proposta, proposta → decisão); propostas sem retorno; ticket médio por tipo de serviço e por porte; mix por tipologia (m² e R$); **preço médio por m² por tipologia/linha/acabamento** ao longo do tempo; **propostas ganhas × perdidas por faixa de preço**; reativação (clientes sem compra há 12+ meses); clientes por cidade; **sazonalidade** (faturamento, propostas e novos contatos por mês, comparando anos).
- *Operacional:* obras em andamento; **atrasos por etapa e por motivo**; **pontualidade**; produção m²/mês × capacidade; assistências (quantidade, tempo de resolução, em garantia × cobradas); **pedidos de avaliação no Google** enviados × obras concluídas.
- *Financeiro:* fluxo de caixa; DRE gerencial; **margem por obra** (com a origem de cada custo); contas a receber por idade (aging) e inadimplência; contas a pagar por vencimento, fornecedor e categoria; faturamento mensal 12 meses e RBT12.
- *Estoque e compras:* posição valorizada; movimentações; retalhos disponíveis; **curva ABC** de insumos; **variação de custo** dos insumos (histórico de preço); abaixo do mínimo (somente itens com mínimo definido); compras por fornecedor; sucata acumulada.

---

## 9. Integrações e preparação para o site e para o agente de IA

**9.1 Formulário do site.** `POST /api/public/leads`: recebe nome completo, telefone, endereço (ou cidade), produto/serviço e mensagem opcional. Proteção: CORS restrito ao domínio do site, honeypot, limite de requisições por IP e validação Zod. Cria/atualiza o cliente (por telefone), cria o projeto `NOVO_LEAD` com origem `SITE`, registra interação e gera notificação.

**9.2 API v1 (para o agente de IA e integrações).** Autenticação por **chave de API** (`Authorization: Bearer ...`; guarde apenas o hash; chaves criadas e revogadas em Configurações; registrar último uso). Limite de requisições, validação Zod, auditoria e erros padronizados. Documente em `docs/API.md` (OpenAPI). Endpoints iniciais:
- `POST /api/v1/leads`: cria ou atualiza lead com `nome`, `telefone`, `endereco`, `produtoServico`, `origem`, `canal`, `resumoAtendimento`, `porte`, `interesse`, `preferenciaHorario`. **Idempotente** por telefone em janela de tempo.
- `GET /api/v1/clientes/busca?telefone=`: reconhece se quem escreve já é cliente e retorna dados básicos e projetos.
- `GET /api/v1/agenda/disponibilidade?data=&cidade=`: horários livres de visita (60 min, respeitando horário comercial e agenda).
- `POST /api/v1/visitas`, `PATCH /api/v1/visitas/:id`: agendar, remarcar e cancelar.
- `GET /api/v1/projetos/andamento?telefone=`: etapa atual, próxima etapa e previsão de entrega **sem nenhum valor financeiro**.

**9.3 Notificações internas.** Sino com novos leads, visitas de amanhã, parcelas vencendo, tarefas e etapas atrasadas, geradas pelo cron diário e por eventos. O cron gera as notificações e as recorrências (idempotente, ver seção 3) e **não** é necessário para a correção dos estados derivados.

**9.4 Evoluções futuras (só deixe pontos de extensão, sem construir):** webhooks de saída, envio de mensagens por API oficial do WhatsApp, link público para o cliente ver a proposta e aceitar online, exportação da proposta em Word (.docx), e-mail transacional.

---

## 10. Segurança, privacidade e operação

- Cookies `httpOnly`, `secure`, `sameSite`; proteção contra CSRF (Server Actions + Auth.js); cabeçalhos de segurança (CSP razoável, HSTS, `X-Content-Type-Options`, etc.); sem segredos no cliente.
- Autorização em **toda** Server Action e Route Handler (não só no middleware). Nunca confiar em IDs vindos do cliente sem checar existência e escopo.
- Uploads: validar tipo e tamanho no servidor; bucket **privado**; URLs assinadas de curta duração.
- Senhas: política mínima (8+ caracteres), bloqueio por tentativas, troca forçada no primeiro acesso, sessões invalidadas ao trocar/redefinir senha.
- **LGPD:** dados pessoais mínimos necessários; se o banco permanecer em `us-east-1` (fora do Brasil), registre em `docs/PENDENCIAS.md` que a RM Code deve avaliar com a Pontual a transferência internacional de dados; auditoria de alterações; exportação de dados por cliente; possibilidade de anonimizar um cliente a pedido (mantendo os valores financeiros agregados). Dados de funcionários (inclusive salário) ficam atrás do login; como não há perfis agora, registre em `docs/PENDENCIAS.md` que será preciso restringir salários quando houver perfis.
- **Backup e continuidade** (o plano gratuito do Supabase **não tem backup automático**): além do botão de exportação completa, entregue um **backup automático gratuito** em um workflow agendado do GitHub Actions: `pg_dump` (com cliente de versão compatível com o servidor, conectando pela string do Session pooler guardada nos *secrets*), compactado e **criptografado** (a senha de criptografia também em *secret*; o dump contém dados pessoais), guardado como artefato do workflow com retenção configurada e com falha visível se o backup não rodar. Em `docs/OPERACAO.md` descreva a **restauração** passo a passo e **teste a restauração** em um banco vazio. Inclua um endpoint `/api/health` (confere a conexão com o banco, sem expor dados) que um monitor externo gratuito possa consultar. Isso ajuda a detectar um projeto pausado, mas **não substitui** a decisão de migrar para um plano pago do Supabase (com backup diário e sem pausa) **antes de operar com dados reais de produção**. Registre essa recomendação em `docs/PENDENCIAS.md`.
- Logs de erro estruturados e páginas de erro amigáveis (`error.tsx`, `not-found.tsx`). Nunca vazar stack trace ao usuário.
- `docs/OPERACAO.md`: variáveis de ambiente, deploy na Vercel, domínio (`sistema.pontualmacae.com.br`; DNS é gerenciado pela RM Code no registro.br), cron, migrações, seeds, rotação de chaves.

---

## 11. Experiência de uso (UX)

- Tom e termos do dia a dia da empresa: **obra, esquadria, folha, vão, medição, sinal, proposta, instalação**. Evite jargão de CRM ("lead" aparece no máximo como "novo contato").
- Visual **azul**, limpo e profissional, com bom contraste (**WCAG AA**), modo claro e escuro, tipografia legível, espaçamento generoso, tabelas densas mas respiráveis.
- **Poucos cliques para o que importa:** criar proposta a partir do projeto, aprovar, registrar pagamento, agendar visita.
- Atalhos de teclado (busca global, "novo"), `autoFocus` coerente, `Enter` envia, `Esc` fecha.
- Feedback imediato (toasts, estados otimistas quando seguro), **confirmação em ações destrutivas** e **desfazer** quando possível.
- Responsivo de verdade: no celular, listas viram cartões; formulários de visita e medição têm campos grandes, teclado numérico e câmera.
- Skeletons no carregamento, estados vazios que ensinam, erros que explicam o que fazer.
- Desempenho: páginas principais abaixo de ~2 s em rede normal; paginação no servidor; sem N+1; imagens otimizadas.

---

## 12. Qualidade e testes

**Unitários (Vitest), obrigatórios para:** cálculo do preço (divisor, bloqueio ≥ 100%), áreas e metros lineares, soma de totais, geração de parcelas (arredondamento e gatilhos), dias úteis e feriados, prazo prometido com pausas, pontualidade, classificação de garantia, saldo de estoque e retalhos, interpretador de fórmulas (inclusive entradas maliciosas), numeração de proposta, geração de descrição com plural, derivação de status atrasado.

**Caso de teste real (fixture):** proposta `1157-26` (Parte 02: boxes e guarda-corpo; o arquivo se chama "1257-26", mas o PDF traz internamente 1157-26): itens 4.130,00 + 9.050,00 + 6.650,00 (guarda-corpo = 2.700,00 + 3.950,00) = **R$ 19.830,00**, pagamento 50% sinal + restante na entrega e instalação. E a proposta `1127-26` (Parte 01): 22 itens cuja soma correta é **R$ 89.725,00** (o PDF original imprime 89.145,00 por erro manual), pagamento 50% + 25% + 25%.

**E2E (Playwright):** o fluxo abaixo é construído de forma **progressiva** (cada fase estende o teste com o que já existe) e roda inteiro na Fase 8. Fluxo: login e troca de senha → cadastrar cliente → criar projeto → agendar visita → criar proposta com opção e itens → gerar PDF → aprovar → conferir parcelas e etapas → concluir etapa e ver a parcela abrir → registrar pagamento → ver o painel atualizado.

**Qualidade geral:** ESLint + Prettier, `strict`, sem warnings no build, sem dependências desnecessárias ou abandonadas, lockfile versionado, seed idempotente.

---

## 13. Dados iniciais (seed)

`npm run seed` (idempotente, seguro para produção, **sem dados fictícios de clientes**):
- **Usuário inicial único:** login `admin`, senha inicial **`admin`**, com `precisaTrocarSenha = true`. A troca é obrigatória no primeiro acesso, e a nova senha segue a política da seção 10 e **não pode ser `admin`** (a senha inicial do seed é a única exceção à política). **Não crie Marcelo nem Luan no seed**: serão cadastrados pela tela de Usuários, com os e-mails `marcelo@pontualmacae.com.br` e `luan@pontualmacae.com.br`. O seed só cria o `admin` se ainda não existir nenhum usuário e **nunca redefine a senha de um usuário existente**.
- **Configuração da empresa** com os dados da seção 1 (alíquota e margem **vazias** com aviso).
- **Catálogos:** linhas (Suprema, Gold, 23, 25, 28, 30, Euroshow); acabamentos (anodizado natural/brilhante, anodizado preto, revestido branco, revestido preto, revestido bronze, amadeirado, dourado); tipos de vidro (incolor, fumê, bronze, refletivo, laminado, com película insulfilm) e espessuras 6, 8, 10 mm; categorias de produto (perfis, vidros, ferragens e acessórios, borrachas e escovas, silicones e vedantes, parafusos e fixações, policarbonato, espelhos, produtos acabados); motivos de perda e de bloqueio (seção 5); categorias financeiras com grupos de DRE (receitas: venda de esquadrias, venda de vidros e boxes, assistência e visitas, venda de sucata, outras; despesas: perfis de alumínio, vidros, ferragens e acessórios, mão de obra e salários, impostos (DAS), aluguel, energia/água/internet, combustível e transporte, manutenção, marketing, contador, ferramentas e equipamentos, pró-labore, outras).
- **Fornecedores** (só nome e categoria, a completar): Alubold, Pontimac, Dafel, Nova Opção, Klinke, AL Ferragens, Viminas, Simas, Sandro Acessórios, Blindex.
- **Tipologias** (com templates de descrição do Apêndice B e desenho; para as que não têm template no Apêndice, crie um genérico no mesmo estilo e marque "revisar texto"; **sem preços e sem composições**): janela de correr (2, 3 e 4 folhas), porta de correr (2 e 4 folhas), báscula, painel fixo, porta de giro, box frontal de correr (2, 3 e 4 folhas), guarda-corpo, fechamento de sacada, portão, pergolado, espelho sem moldura.
- **Condições de pagamento:** (1) 50% sinal na confirmação + 25% na entrega do material + 25% na entrega dos vidros e instalação; (2) 50% sinal + 50% na entrega e instalação; (3) À vista (PIX, transferência ou espécie); (4) Cartão de crédito em até 12x; (5) A combinar (texto livre).
- **Modelo de etapas** (R7), **modelos de texto** (Apêndice A e mensagens de WhatsApp), **feriados nacionais**, **contas financeiras** de exemplo ("Banco", "Caixa (espécie)") a ajustar.

`npm run seed:demo` (**só ambiente de desenvolvimento**, recusa rodar com `NODE_ENV=production` ou sem `ALLOW_DEMO_SEED=true`): clientes, projetos, propostas, obras e lançamentos **claramente fictícios** (nomes inventados; **não use nomes de clientes reais** das propostas), em volume suficiente para testar painéis e relatórios, com script para limpar.

---

## 14. Plano de fases e critérios de aceite

Pare ao fim de cada fase (seção 0.2), **depois da revisão sênior da seção 0.6**. Cada fase entrega também os **widgets do painel e relatórios básicos** do que construiu.

**Fase 0 — Fundação.** Repositório, stack, `CLAUDE.md`, docs, CI, variáveis de ambiente, Prisma + primeira migração, extensões do banco, seed base, Auth.js com login/bloqueio/troca de senha, tela de usuários, layout (sidebar, topo, busca global, sino, tema, responsivo), configurações da empresa, catálogos, `LogAuditoria`, `Anexo` com upload ao Storage, `Interacao`, `Tarefa`, página de Primeiros passos, PWA básico. *Aceite:* login funciona e protege todas as rotas; auditoria registra alterações; upload e download de arquivo privado funcionam; build, lint e testes passam; `docs/OPERACAO.md` com a conexão do repositório ao projeto `pontual-sistema` da Vercel (`vercel link`, variáveis de ambiente por ambiente, domínio), conferida contra a documentação atual; `/api/health` e o workflow de backup criptografado prontos (a ativação depende dos *secrets* no GitHub); deploy no **projeto novo da Vercel** documentado, respeitada a decisão sobre o plano (seção 3).

**Fase 1 — Cadastros.** Clientes (endereços, contatos, duplicidade, indicadoPor, linha do tempo), Parceiros, Fornecedores, Funcionários e Equipes, Produtos/insumos (categorias, histórico de preço, **reajuste em lote com pré-visualização**), Importação CSV/XLSX, busca global completa, lixeira. *Aceite:* importar 300 produtos de exemplo com validação; reajuste em lote registra histórico; busca ignora acentos.

**Fase 2 — Comercial (funil e agenda).** Projetos e Kanban, qualificação (R10), motivos de perda, Agenda com visitas e medições, tela de visita para celular com medidas-rascunho e fotos, exportação `.ics`, Tarefas e follow-ups (R11), modelos de mensagem de WhatsApp. *Aceite:* arrastar cartões respeita as regras; visita com conflito alerta; medidas e fotos funcionam no celular; relatório de funil e origem funcionando.

**Fase 3 — Propostas.** Tipologias, **motor de composição e fórmulas** (R2), tabela de preços, modelos de texto, condições de pagamento (R6), editor de propostas (opções, grupos, itens com várias medidas, desenho SVG, descrição gerada, três modos de preço — R1), revisões e congelamento (R4), PDF fiel ao real, folha de produção sem valores, envio por WhatsApp/e-mail (links), aprovação transacional (R5, passos 1 a 3, 5 e 6) com geração de parcelas: crie já a tabela `ContaReceber` e a **geração** das parcelas (sem as telas financeiras, que vêm na Fase 5); o passo 4 (etapas) fica como ponto de extensão para a Fase 4. *Aceite:* reproduzir os casos `1157-26` e `1127-26` (seção 12) com os totais corretos e PDF com a estrutura das propostas reais; fórmulas inválidas ou maliciosas são rejeitadas; testes unitários de preço e parcelas passando; E2E do fluxo proposta → aprovação.

**Fase 4 — Obras.** Etapas e modelo (R7), prazo e pontualidade (R8) com feriados e pausas, semáforo, Kanban de obras, calendário de instalação por equipe, fotos antes/durante/depois e galeria de portfólio, assistência e garantia (R12), condomínio. *Aceite:* concluir a etapa gatilho muda a parcela para `ABERTA` (preparado, o financeiro entra na Fase 5); pontualidade calculada corretamente nos testes, com e sem pausas.

**Fase 5 — Financeiro.** A receber (pagamentos parciais, cobrança por WhatsApp), A pagar (parcelado e recorrente), contas e lançamentos, categorias, fluxo de caixa realizado × projetado, DRE, notas fiscais (R16), RBT12 (R17), integração com gatilhos de etapa. *Aceite:* o ciclo aprovar → cobrar sinal → concluir etapa → cobrar 25% → receber fecha corretamente; fluxo e DRE batem com os lançamentos; atrasos derivados corretos.

**Fase 6 — Estoque e compras.** Movimentos, retalhos e sucata (R14), compras (material e vidro, destino estoque/obra), recebimento, pedido de vidro a partir dos itens, lista de materiais pela composição, **custo real e margem por obra** (R15). *Aceite:* nenhum custo é contado duas vezes; baixa de obra gera retalho conforme a regra; margem por obra mostra a origem de cada custo.

**Fase 7 — Painel e relatórios.** Painel completo (seção 8), todos os relatórios listados, exportações, impressão, desempenho com volume de dados de demonstração (milhares de registros). *Aceite:* cada número do painel leva à lista filtrada e bate com o relatório correspondente; consultas principais com índices adequados.

**Fase 8 — Integrações, endurecimento e entrega.** Formulário do site (9.1), API v1 e documentação (9.2), notificações e cron (9.3), revisão de segurança (seção 10), acessibilidade e responsividade, PWA polido, E2E completo, backup/exportação, `docs/OPERACAO.md`, `docs/GUIA_DE_USO.md`, `docs/API.md`, checklist de produção, treinamento (roteiro). *Aceite:* suíte de testes completa verde, lighthouse sem falhas graves, chaves de API funcionando com limite de requisições, checklist de deploy cumprido, **revisão final do sistema inteiro (0.6, item 6) concluída e relatada**.

---

## 15. Entrega final

Ao concluir, entregue: repositório organizado e com histórico de commits limpo; `README.md` (como rodar, testar e fazer deploy); `docs/` (especificação, decisões, pendências, operação, guia de uso, API, aprendizados e padrões RM Code); `.env.example` completo; `docs/revisoes/` com o relatório de revisão sênior de cada fase e o da revisão final; lista consolidada em `docs/PENDENCIAS.md` do que o cliente precisa fornecer ou validar (preços e tabelas de fornecedores, composições técnicas das tipologias, alíquota e margens, último número de proposta usado, logo em vetor, endereço correto, validação do limite do Simples com o contador, textos legais das propostas, criação das caixas `marcelo@` e `luan@` e de um e-mail institucional para as propostas (hoje é um Gmail), decisão da RM Code sobre os planos pagos da Vercel (Pro) e do Supabase (com backup diário), link direto de avaliação do Google, prints ou texto do Perfil do Google e do Instagram caso não seja possível lê-los automaticamente).

---

## Apêndice A — Textos padrão da proposta (semear em `ModeloTexto`; variáveis entre `{{ }}`)

Substitua "Vidraçaria Pontual" por `{{nomeFantasia}}`. A numeração é automática.

**Notas importantes**
1. Este serviço está sob os termos e condições da {{nomeFantasia}}.
2. No caso de qualquer alteração proposta pelo cliente nas condições dos serviços e/ou equipamentos propostos, bem como em qualquer item dos Termos e Condições anexos, a {{nomeFantasia}} reserva-se o direito de reavaliar a presente proposta, reajustando os valores acordados.
3. A {{nomeFantasia}} se reserva o direito de declinar da execução, sem qualquer prejuízo, caso não exista acordo nos termos e condições de contrato.
4. Procedimento de trabalho: pedido de material; montagem das esquadrias; instalação das esquadrias; medição e pedido dos vidros após esquadria instalada; instalação dos vidros, finalização e acabamento.
5. Não nos responsabilizamos por serviços de alvenaria ou de terceiros (pedreiro, gesseiro, marceneiro etc.), devendo os vãos estar devidamente adequados, respeitando prumo e nível.
6. Em caso de material de acabamento fora do escopo acima para correção de defeito de alvenaria, será cobrado à parte.
7. Não existe possibilidade de cancelamento ou mudança de projeto sem custo adicional.
8. Em caso de impedimento de fabricação das esquadrias ou atraso de alvenaria arrematada, o contratante efetuará o pagamento como combinado na proposta.
9. Em caso de força maior, ação do tempo, ou impedimento de trabalho por falta de espaço ou atraso de outra demanda no mesmo local, o prazo poderá ser alterado.
10. Em caso de alteração de valores no decorrer do andamento, os valores serão reajustados.
11. Nos valores estão incluídos transporte, alimentação, acomodação, insumos para instalação e mão de obra.
12. Confirmando o pedido, a contratante tem ciência de que concorda com os termos e modelos desta proposta.

**Termos comerciais** (estrutura): "1.0 FORMA DE PAGAMENTO" com "VALOR TOTAL {{nomeOpcao}} {{total}}" e as parcelas da condição escolhida; linha de dados para pagamento (`{{dadosPagamento}}`); "PRAZO DE ENTREGA (APÓS MEDIÇÃO EXATA PARA PRODUÇÃO)" com os prazos; "Validade da proposta" (padrão: "Até alteração dos fornecedores"); assinatura "Att, {{consultorNome}} — {{consultorCargo}}".

**Rodapé de toda página:** `{{endereco}} — CNPJ {{cnpj}} — Tel: {{telefone}} — E-mail: {{email}}`.

## Apêndice B — Templates de descrição (das propostas reais; `{ }` = variável)

- **Janela de correr:** `JANELA(S) DE CORRER COM {NN} FOLHAS EM ALUMÍNIO LINHA {LINHA}, COM VIDRO TEMPERADO {COR} DE {NN}MM, COMPLETA(S) E INSTALADA(S) COM TODOS OS ACESSÓRIOS PADRÃO PARA SEU FUNCIONAMENTO, MED. {L} X {A}`
- **Porta de correr:** `PORTA(S) DE CORRER COM {NN} FOLHAS EM ALUMÍNIO LINHA {LINHA}, COM VIDRO TEMPERADO {COR} DE {NN}MM, COMPLETA(S) E INSTALADA(S) COM TODOS OS ACESSÓRIOS PADRÃO PARA SEU FUNCIONAMENTO, MED. {L} X {A}` (variação: "COM MÃO DE AMIGO REFORÇADA", "PUXADOR DE ALÇA NO VIDRO", "TRILHOS INFERIORES TIPO MACARRÃO COM ROLDANAS DUPLAS EM MATERIAL INOXIDÁVEL" como observações do item)
- **Báscula:** `BÁSCULA(S) EM ALUMÍNIO {ACABAMENTO}, LINHA {LINHA}, COM {NN} FACE(S), COM VIDRO TEMPERADO {COR} DE {NN}MM, COMPLETA(S) E INSTALADA(S) COM TODOS OS ACESSÓRIOS NECESSÁRIOS PARA SEU FUNCIONAMENTO, MED. {L} X {A}`
- **Painel fixo:** `PAINEL(IS) FIXO(S) EM VIDRO TEMPERADO {COR} DE {NN}MM, COM PERFIS EM ALUMÍNIO (LINHA {LINHA}), MED. {L} X {A}`
- **Box frontal:** `BOX FRONTAL EM VIDROS TEMPERADOS {COR} DE {NN}MM, DE CORRER COM {NN} FOLHAS, COMPLETO E INSTALADO COM PERFIS EM ALUMÍNIO {ACABAMENTO}, PUXADOR DE ALÇA COM 30CM E TODOS OS ACESSÓRIOS NECESSÁRIOS PARA SEU FUNCIONAMENTO, MED. {L} X {A}`
- **Guarda-corpo:** `GUARDA CORPO EM VIDROS TEMPERADOS {COR} DE {NN}MM COM TORRES DE {NN}CM EM INOX COM CONECTORES DE FIXAÇÃO.` (observação típica: "GUARDA CORPO DA ESCADA VIA MOLDE")
- Itens com várias medidas listam todas separadas por ` / ` (ex.: `MED. 2000 X 3600 / 2000 X 2600`), e a quantidade do item é a soma das quantidades das medidas.

## Apêndice C — Primeiras ações esperadas de você

1. Confirme em uma frase que leu a especificação inteira.
2. Execute a seção 0.1 (documentos-base).
3. **A infraestrutura já foi criada pela RM Code:** projeto do Supabase (plano gratuito, região `us-east-1`; ver seção 3), o repositório https://github.com/RMCode-ia-br/pontual-sistema e o projeto **vazio** da Vercel `pontual-sistema` (https://vercel.com/rmcode1/pontual-sistema). Portanto **não escreva guias de criação de contas ou projetos**. Em vez disso:
   - Confira a pasta atual: se já for o clone de https://github.com/RMCode-ia-br/pontual-sistema (`git remote -v`), use-o; se não, clone-o ou conecte-o (`git remote add origin ...`). Se o repositório estiver vazio, o primeiro commit são os documentos-base.
   - Verifique se existe `.env.local` com todas as variáveis da seção 3 (**só a presença, nunca os valores**) e teste a conexão com o banco (apenas "sucesso" ou "falha" e o tipo do erro).
   - Vincule a pasta ao projeto da Vercel (`vercel link`, se o CLI estiver instalado e logado; **nunca peça tokens no chat**) e documente em `docs/OPERACAO.md` quais variáveis devem ser cadastradas no projeto da Vercel (o usuário cadastra os valores no painel).
   - Pergunte, **em uma única mensagem**, só o que ainda faltar entre: confirmação de que o `.env.local` está preenchido, se o CLI da Vercel está logado.
   - Enquanto aguarda, avance com o que não depende disso (estrutura do projeto, schema Prisma da Fase 0, layout e componentes).
4. Siga a Fase 0 e pare ao final, conforme a seção 0.2, **depois de fazer a revisão sênior da seção 0.6** e gravar `docs/revisoes/fase-0.md`.
