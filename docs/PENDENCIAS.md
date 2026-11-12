# Pendências (dependem de uma pessoa)

## Do cliente (Pontual)
- [ ] **Endereço correto:** propostas trazem o nº 185, o site traz 195. Está editável em Configurações.
- [ ] **Alíquota efetiva do Simples** (campo vazio com aviso até definir; usada no custo real da Fase 6). A margem de lucro foi informada em 2026-11-13: é **markup sobre o custo** (80%; 100% para guarda-corpo e vidro temperado), ver `docs/DECISOES.md` (58 e 61).
- [ ] **Numeração das propostas:** começa em 2000-26 (informado pelo dono; o último real é próximo de 1200). Confirmar se o contador reinicia por ano (padrão: não).
- [ ] **Limite do Simples Nacional** (padrão R$ 4.800.000,00): validar o valor atual com o contador.
- [ ] **Preços e tabelas de fornecedores**, **composições técnicas das tipologias** e fórmulas de corte (nada é preenchido por conta própria).
- [ ] Confirmar o **mapa gatilho → etapa** (padrão: ENTREGA_MATERIAL → FABRICACAO concluída; ENTREGA_E_INSTALACAO → INSTALACAO_VIDROS concluída).
- [ ] Faixas de valor para sugerir o porte do projeto (opcional).
- [ ] Textos legais das propostas (Apêndice A) e logo em vetor.
- [ ] E-mails institucionais `marcelo@` e `luan@pontualmacae.com.br` e um e-mail institucional para as propostas (hoje é um Gmail).
- [ ] **Link direto de avaliação do Google** (o link `share.google` pode não ser o de avaliação) e prints/texto do Perfil do Google e do Instagram, se a leitura automática não for possível.

## Da RM Code
- [ ] **Hospedagem de produção:** a Vercel Hobby é restrita a uso pessoal não comercial. Enquanto não houver decisão (Vercel Pro, outro provedor ou confirmação da Vercel), **nenhum dado real** entra em ambiente hospedado; deploy só com dados de demonstração.
- [ ] **Supabase:** plano gratuito não tem backup automático e pausa após 1 semana sem uso. Migrar para plano pago (backup diário, sem pausa) **antes** de operar com dados reais.
- [x] **LGPD:** resolvida em 2026-11-11: o banco foi recriado em **São Paulo (`sa-east-1`)** e a região da Vercel ajustada para `gru1` (`docs/DECISOES.md`, item 25).
- [ ] Usuário dedicado `prisma` no banco (hoje pode estar usando `postgres`).
- [x] **Deploy na Vercel feito e variáveis cadastradas** (informado pela RM Code em 2026-11-11; eu não tenho acesso à Vercel para conferir). Conferir após o deploy: `/api/health` responde "ok", o login abre e as variáveis apontam para o **banco novo**. O `vercel link` da pasta local é opcional.
- [x] **GitHub Actions:** os segredos `BACKUP_DATABASE_URL` e `BACKUP_PASSPHRASE` já estão cadastrados (informado pela RM Code; não conferi). Eles precisam apontar para o **banco novo**. Falta rodar o workflow `backup.yml` manualmente uma vez e testar a restauração (item abaixo). Os segredos do CI não são necessários (o CI usa valores fictícios).
- [ ] **`DIRECT_URL` e `DATABASE_URL` com o formato indicado:** hoje o `DIRECT_URL` é a conexão direta (`db.<ref>.supabase.co`, só IPv6) e **não conecta de redes IPv4** (as migrações desta data rodaram sobrescrevendo-o por processo). Trocar o `DIRECT_URL` pelo **Session pooler** (5432) e usar no `DATABASE_URL` o **Transaction pooler** (6543, `?pgbouncer=true`), inclusive na Vercel. Hoje o `DATABASE_URL` é um Session pooler (5432), que limita as conexões simultâneas das funções serverless (`docs/DECISOES.md`, item 26).
- [ ] DNS de `sistema.pontualmacae.com.br` (registro.br).

## Dívida técnica / evoluções
- Quando existirem perfis de acesso: restringir salários de funcionários (hoje todos veem tudo).
- Esqueci a senha por e-mail (exige e-mail transacional).
- Plano de corte otimizado, OCR de tabelas de fornecedor, conciliação bancária (fora do escopo).

## Surgidas na Fase 0 (autenticação e seed)
- [ ] **Feriados municipais de Macaé** não foram inventados: o gestor precisa cadastrá-los em Configurações → Feriados (o seed só traz os nacionais, 2026–2030, e o Carnaval como ponto facultativo).
- [ ] **Primeiro acesso do `admin` no banco novo (São Paulo):** o usuário foi criado pelo seed com a senha de `ADMIN_SENHA_INICIAL` (não a pública) e `precisaTrocarSenha = true`. Entre uma vez e troque a senha; depois cadastre Marcelo e Luan e desative o `admin`.
- [ ] **IP do cliente no bloqueio de login** vem de `x-forwarded-for`. Na Vercel o cabeçalho é definido pela plataforma; em outra hospedagem, só confiar nele atrás de um proxy que o sobrescreva (senão o bloqueio por IP pode ser contornado).
- [ ] **`npm audit`** reportou 7 vulnerabilidades moderadas após a instalação: avaliar na revisão sênior (podem ser só de ferramentas de desenvolvimento).
- [ ] **Testar a restauração do backup de ponta a ponta** (`pg_dump` real, criptografia, `pg_restore` em banco vazio, `migrate deploy` sem pendências). A criptografia/descriptografia já foi testada com `openssl`; falta o trecho do PostgreSQL, que exige `pg_dump`/`pg_restore` 17 (a máquina de desenvolvimento não os tem). Rodar o workflow `backup.yml` manualmente no GitHub e restaurar em um projeto Supabase vazio.
- [ ] **Medir a latência no banco novo:** o banco agora está em São Paulo (era `us-east-1`, ~150 ms por ida). Ações com várias idas ao banco (upload de arquivo: preparar, enviar, registrar) deveriam ficar bem mais rápidas; medir na Vercel (`gru1`) e na revisão de desempenho (Fase 7/8).

## Da revisão sênior da Fase 0 (o que NÃO foi corrigido, e por quê)

Corrigidos na própria fase: bloqueio de login contornável por requisições simultâneas, tabelas expostas pela API do Supabase (RLS), redirecionamento aberto, conferência do conteúdo de uploads, auditoria de reordenação, feriado removido que não podia ser recriado, teto de valores em reais, backup só do schema public, estado "carregando", painel com widgets, aviso na exportação truncada, senha com mais de 72 bytes e outros menores (ver `docs/revisoes/fase-0.md`).

**Antes de usar dados reais ou de expor o endereço (importante):**
- [x] **Senha do `admin`:** no banco anterior já havia sido trocada; no **banco novo** o seed usou `ADMIN_SENHA_INICIAL` (verificado em 2026-11-11: não é a senha pública `admin`). Falta apenas o primeiro acesso para a troca obrigatória (item acima). Em qualquer banco novo, use `ADMIN_SENHA_INICIAL` e confira antes de publicar o endereço.
- [ ] **TLS do banco sem verificar o certificado** (`rejectUnauthorized: false`): instalar a CA do Supabase (`ssl.ca`) e ligar a verificação.

**Dívida técnica registrada (média e baixa):**
- [ ] **Varrer objetos órfãos do Storage** (enviados e nunca concluídos) na rotina diária; o bucket já limita tamanho e tipos.
- [ ] **Download de anexo de tarefa excluída** ainda funciona (a checagem olha só o anexo, não a entidade pai) e o uso de arquivos na tela de Backup subestima o bucket (objetos de anexos removidos continuam lá).
- [ ] **Testes E2E usam o banco real** (restauram a configuração no fim, mas um processo interrompido pode deixá-la alterada). Ideal: um banco/projeto Supabase só de testes.
- [ ] **Rotas públicas** (`/api/health`, `/icons/*`) consultam o banco sem limite de requisições (superfície de DoS leve): limitar por IP ou usar cache.
- [ ] **CSP:** `connect-src` e `img-src` aceitam qualquer `*.supabase.co` (fixar o host do projeto); `script-src 'unsafe-inline'` é exigência do Next sem nonce.
- [ ] **Logo:** uma chamada ao Storage e uma URL nova por renderização do layout (e na tela de login, sem autenticação): guardar em cache.
- [ ] **Textos da empresa no código:** "Marcelo e Luan" em Primeiros passos e o login `admin` fixo em Primeiros passos e em Usuários.
- [ ] **CI:** rodar `prettier --check`, E2E (exige banco de teste) e fixar as actions por hash.
- [ ] **Backup:** `openssl enc` não autentica integridade (preferir `age` ou GPG autenticado); só há o e-mail padrão do GitHub como alerta de falha.
- [ ] **Tarefas:** sem paginação no servidor (limite fixo de 200); o status `CANCELADA` existe mas nenhuma ação o usa; os campos `tipo` e os vínculos (`clienteId`/`projetoId`) ainda não têm formulário.
- [ ] **Anexo:** `descricao`, `momento` (antes/durante/depois) e `usarNoPortfolio` existem no schema mas nenhuma ação os grava (chegam com a galeria de obras, Fase 4).
- [ ] **Busca:** sem índice trigram/GIN para `unaccent(...) ILIKE` (sem problema com poucos dados; criar função `unaccent` imutável e o índice quando o volume crescer).
- [ ] **Atalho de teclado para "Novo"** (a spec pede, além do Ctrl+K).
- [ ] **Feriados nacionais cobrem 2026 a 2030:** regerar a cada ano (e avisar quando o horizonte acabar, antes de a Fase 4 usar dias úteis). Férias coletivas que atravessam o ano aparecem só no ano de início.
- [ ] **`registrarInteracao`** ainda não tem teste de integração (a linha do tempo chega com Clientes, Fase 1).
- [ ] **Troca de senha** (`/trocar-senha`) ainda usa `<form action>`: os três campos de senha se limpam após um erro (aceitável para senhas, mas incoerente com os outros formulários).
- [ ] **Erro "Já existe um item..." nos catálogos** permanece na tela até o próximo envio.

## Surgidas na Fase 1 (cadastros)
- [ ] **Fornecedores do seed:** vieram só com o nome (e categoria onde o nome já a diz: AL Ferragens, Sandro Acessórios, Blindex). O Marcelo precisa completar contato, categorias, prazo e condições.
- [ ] **Produtos e custos reais:** nenhum foi cadastrado por mim. Importar a planilha de fornecedores (ou cadastrar) quando houver; até lá o sistema mostra "sem custo".
- [ ] **Salário e custo por hora** de funcionários são visíveis a todos os usuários (já era dívida; agora há aviso na tela e a exportação os omite). Restringir quando existirem perfis.
- [ ] **Parceiros:** projetos indicados, fechamentos e valor entram na Fase 2 (dependem de `Projeto`). O relatório "sem contato há 12 meses" passa a usar projetos também.
- [x] **Importação da tabela de preços** (spec 7.12): feita na Fase 3 (aba "Tabela de preços" da tipologia, CSV/XLSX, tudo ou nada).
- [ ] **Limite de 2.000 linhas por planilha** e 5 MB por envio: confirmar com o Marcelo se bastam (a lista de produtos tem ~300 itens).
- [ ] **Teste com um `.xlsx` real** (exportado do Excel da Pontual): os testes automáticos usam CSV; a leitura de XLSX usa `read-excel-file` e precisa ser conferida com uma planilha de verdade.
- [ ] **`npm audit`:** 7 avisos moderados continuam, todos na cadeia do `shadcn` (ferramenta de desenvolvimento, `deepmerge`); `read-excel-file` não trouxe nenhum.
- [ ] Atalho de teclado para "Novo" (pendência da Fase 0) segue em aberto; a busca (Ctrl+K) já cobre clientes, fornecedores, produtos e funcionários.
- [ ] **`seed:demo` não foi executado** (o banco é compartilhado): rodar em um banco de desenvolvimento com `ALLOW_DEMO_SEED=true` para ver os painéis com volume.

## Surgidas na Fase 2 (comercial)
- [ ] **Prazo "sem retorno" (7 dias) e follow-up (3 dias)** são padrões de configuração, não dados da Pontual: o Marcelo confirma em Configurações → Empresa ("Funil e acompanhamento").
- [ ] **Faixas de porte** (médio/grande) ficam vazias; sem elas o porte é sempre manual (R10).
- [ ] **Horário comercial e duração da visita** usam os padrões da spec; conferir com o Marcelo (inclui sábado até 12h).
- [ ] **Férias coletivas e feriados de Macaé** precisam estar cadastrados em Configurações → Feriados para a agenda avisar (a de dezembro/Carnaval não vêm prontas).
- [x] **Importar medidas da visita para a proposta:** feito na Fase 3 (botão no editor).
- [ ] **Tipologia nas medidas-rascunho** é texto livre com sugestões; vira vínculo com `Tipologia` na Fase 3.
- [ ] **Follow-ups de avaliação (D+2) e de fim da garantia** dependem de obra concluída (Fase 4); notificações e lembrete de visita 24 h por cron (sino) são da Fase 8 (hoje: lista no painel + botão de WhatsApp).
- [ ] **Relatório do funil** calcula em memória (até 20.000 projetos); passar para SQL agregado e medir desempenho na Fase 7.
- [ ] **Feed .ics público sem limite de requisições** e com a URL (token) em logs de acesso; avaliar limite por IP e janela menor na Fase 8.
- [ ] **Compromissos REALIZADO/CANCELADO ainda são editáveis** (horário, responsável); considerar travar quando existirem perfis.
- [ ] **`ordem` das medidas-rascunho** pode repetir sob salvamentos simultâneos (só estético; desempate por criação).
- [ ] **Ações de consulta do formulário** (endereços do cliente, busca de projetos) exigem sessão mas não `can()` nem checam cliente na lixeira (baixo impacto: só leitura de endereços).
- [ ] **Compromissos que atravessam a meia-noite** aparecem só no dia do início nas grades.
- [ ] **E2E interrompido à força pode deixar sessão "idle in transaction"** no Postgres e travar a limpeza dos testes (ver APRENDIZADOS); ideal: banco de testes separado.
- [ ] Atalho de teclado para "Novo" segue em aberto; teste real do `.xlsx` e `seed:demo` em banco de desenvolvimento (o demo foi criado e limpo uma vez no banco compartilhado, sem restos).

## Surgidas na Fase 3 (propostas)
- [ ] **Markup de 100%:** confirmar se, além do guarda-corpo, usam 100% o box, o fechamento de sacada, o espelho e outras esquadrias de vidro temperado, e **se existem outras categorias de markup**. Hoje só o guarda-corpo vem como categoria `VIDRO_TEMPERADO`; as demais tipologias estão em `PADRAO` (80%). Cada tipologia pode ser ajustada em Tipologias.
- [ ] **Acréscimo da nota fiscal (5%)**, **markup padrão (80%)** e **markup de vidro temperado (100%)** foram informados pelo dono e estão em Configurações → Empresa; conferir na primeira proposta real.
- [ ] **Comissões** (arquiteto/indicação) ficam em zero e só informativas; avisar se alguma proposta futura passar a ter comissão e como ela entra no preço.
- [ ] **Composições técnicas e preços:** nada foi preenchido. Existe só a tipologia de EXEMPLO (desativada). O custo por hora de mão de obra e os custos dos insumos precisam ser informados para o modo composição calcular.
- [ ] **Textos das tipologias sem template no Apêndice B** (porta de giro, fechamento de sacada, portão, pergolado, espelho) estão marcados "revisar texto".
- [x] **Fixture 1127-26:** trocada pelos 22 itens reais (medidas, quantidades e preços); soma calculada R$ 89.725,00.
- [ ] **Mapa gatilho → etapa** (entrega do material = fabricação concluída; entrega e instalação = instalação de vidros concluída) segue para confirmação; as parcelas por gatilho ficam "aguardando" até a Fase 4.

## Da revisão sênior da Fase 3 (o que NÃO foi corrigido, e por quê)
Corrigidos na fase: aprovação de duas revisões do mesmo número, revisão após excluir rascunho, contador de propostas regredindo, descrição não regerada ao duplicar opção, validade encerrada fora do PDF, importação de visita sem confirmação, `se()` não preguiçoso, aviso no PDF de rascunho (ver `docs/revisoes/fase-3.md`).
- [ ] **Lista/filtro de propostas "vencidas"** (validade) e notificação por cron (Fase 8); hoje só o selo na ficha.
- [ ] **Aviso de preço velho** quando muda fórmula/mão de obra/categoria de markup da tipologia, a tabela de preços ou o markup de Configurações depois de o item ser calculado (hoje só custo de produto, R13).
- [ ] **Desconto maior que o subtotal** é cortado sem aviso na tela; **parcela em data fixa anterior à aprovação** nasce já vencida.
- [ ] **Busca da lista de propostas** usa `contains` (não ignora acentos); a busca global (Ctrl+K) já ignora.
- [ ] **Teste do PDF só confere estrutura** (cabeçalho do arquivo, páginas); a conferência de layout foi visual (capturas). Considerar teste de texto extraído.
- [ ] **`seed:demo` ainda não cria propostas** de demonstração (as telas ficam vazias até alguém criar).
- [ ] **Geração de PDF na Vercel** (`@react-pdf/renderer` em função serverless de `gru1`): tempo de partida a frio e limite de tamanho não foram medidos; testar no deploy de demonstração.
- [ ] **`npm audit`**: 12 avisos, todos em ferramentas de desenvolvimento (`shadcn`, `typescript-eslint`/`minimatch`); o pacote de PDF não trouxe nenhum.
- [ ] **Configuração de desenho por item** (`desenhoConfig`, ex.: sentido de abertura) existe no banco, sem tela.
- [ ] **Anexo do aceite** sem vínculo ao campo `aceiteAnexoId` (hoje é a lista geral de arquivos da proposta).
- [x] **Fixture 1127-26** com os valores reais (ver acima); o segundo caso real (1157-26) também virou fixture.

## Complemento da Fase 3: comparação com os PDFs reais (1127-26 e 1157-26)
Diferenças pequenas já corrigidas (quadro por item com colunas nº | quantidade | conteúdo | valor, cabeçalho em duas colunas, títulos em caixa cinza, seções "• NOME;", desenho maior com moldura grossa, medidas por linha com local, nome da opção no "VALOR TOTAL", espessura "06MM", "= 02" nas medidas, sem hifenização). **Diferenças maiores, deixadas para decisão:**
- [ ] **Desenhos menos detalhados que os originais:** os reais mostram puxadores, alças, setas e trilhos por tipo; os nossos são formas esquemáticas (retângulos, linhas e setas). Refinar por tipologia (e usar `desenhoConfig`) quando o Marcelo definir o padrão visual.
- [ ] **Notas importantes e Termos comerciais em páginas próprias** nos originais; no sistema o fluxo é contínuo (os termos não se partem entre páginas). Forçar quebra de página se o Marcelo preferir.
- [ ] **Medida de guarda-corpo:** o original imprime "altura X comprimento" (1050 X 2200) e, na escada, três números (1050 X 1100 X 3300). O sistema tem só largura × altura (a cobrança por metro linear usa a largura como comprimento: 9,5 m a R$ 700,00/m reproduz o item real de R$ 6.650,00). Confirmar a convenção e se a medida da escada com três números precisa de campo próprio.
- [ ] **"dias" × "dias úteis":** os originais imprimem "Material: 30 dias". O sistema imprime "dias úteis" (padrão da R8, configurável). Confirmar com o Marcelo qual texto ele quer na proposta.
- [ ] **Parcelas com valor:** os originais não mostram o valor de cada parcela nem "OU A COMBINAR"; o sistema mostra o valor (mais claro, vale com ou sem nota). Confirmar.
- [ ] **Rodapé:** o original é centralizado em 3 linhas; o sistema usa 1 linha + "Página X de Y". Ajustar se quiser idêntico.
- [ ] **Quantidade impressa:** nos originais é digitada à mão (o item 1 do 1157-26 mostra 01 para duas medidas); o sistema soma as quantidades das medidas. A numeração repetida do 1127-26 (19 e 20 duas vezes) é corrigida: o sistema numera de 1 a 22.
- [ ] **Descrições dos originais têm variações manuais e erros de português** ("COMPLETA E INSTALADO", "BOX EM FRONTAL", "PAINEIS FIXO"); o sistema gera o texto padrão do modelo (editável por item).
- [ ] **Identidade visual:** os originais são preto e branco, sem logo; o PDF do sistema usa o azul da marca e o logo (modernização prevista na spec, mesma estrutura de conteúdo).

## Surgidas na Fase 3.5 (Identidade visual)
- [ ] **Logo em vetor e modernizada (RM Code/Pontual):** a logo recebida é um JPEG de 713 px com texto pequeno, e no menu (36 px) o "PONTUAL" fica ilegível; só o disco e o símbolo se leem. Quando chegar a versão em vetor ou só com o símbolo, troque `public/logo-pontual.png` e rode `npm run icones`, e envie a nova logo em Configurações > Empresa. Observação: o bucket aceita PNG, JPG e WebP; **SVG não**, então exporte um PNG para o sistema.
- [ ] **Validar o modo escuro com o dono:** o site da empresa só tem tema claro; o escuro é uma proposta derivada (docs/IDENTIDADE_VISUAL.md). Se não agradar, os neutros ficam em `src/app/globals.css` e em `SUPERFICIES` (`src/lib/tema/derivar.ts`).
- [ ] **Confirmar no primeiro deploy que os PDFs acham as fontes Geist:** os TTF entram no pacote por `outputFileTracingIncludes` (`next.config.ts`), testado só em build local. Gerar uma proposta e uma folha de produção na Vercel de demonstração e conferir a fonte.
- [ ] **Capturas das telas de detalhe (cliente, editor de proposta):** não entraram na comparação antes/depois porque o banco de desenvolvimento está sem dados. Repetir `CAPTURAS_IDENTIDADE=depois` depois de `npm run seed:demo` (só em ambiente de desenvolvimento).
- [ ] **Cor da marca fora do azul:** testada por unidade (20 cores difíceis, AA nos dois modos), mas só o azul do site foi visto em tela. Ao trocar a cor em Configurações, conferir o menu, os botões e um PDF.
- [ ] **Cache da URL da logo (dívida anterior, agora mais visível):** a URL assinada da logo é gerada a cada renderização da área logada e do login (uma ida ao Storage). O layout raiz e o manifesto já não a pedem. Cachear por ~50 min quando o volume de uso crescer.

### Da revisão sênior da Fase 3.5 (dívida técnica, baixa prioridade)
- [ ] **Manifesto dinâmico sem cache:** `/manifest.webmanifest` é público e consulta o banco a cada pedido (o pool tem 5 conexões). Impacto pequeno (navegadores pedem raramente), mas dá para cachear por alguns minutos com tag invalidada em `salvarEmpresa`.
- [ ] **PDF de proposta já enviada muda de paginação:** o conteúdo, a cor e a logo vêm do snapshot congelado (R4), mas as métricas do Geist são mais largas que as da Helvetica, então baixar de novo uma proposta enviada antes da Fase 3.5 pode quebrar páginas em outro ponto. Preços e textos não mudam. Se for preciso fidelidade total, guardar o PDF no momento do envio.
- [ ] **Nome da empresa fixo no manifesto e no título** ("Pontual Gestão", `short_name` "Pontual"): já era assim antes da fase; vir de `nomeFantasia` quando o sistema for reaproveitado para outra empresa. A cor padrão `#0064b5` também é um padrão do sistema (decisão 87), não um dado da empresa.
- [ ] **Originais da logo dentro de `public/`:** `public/logo-pontual.png` (JPEG) e `public/marca/logo-pontual.png` só são lidos pelos scripts `icones` e pela seed; ficam atrás do login, mas poderiam morar em `assets/`. Mantidos em `public/` porque foi onde o dono os colocou.
- [ ] **Seed repõe a logo padrão se algum dia houver "remover logo":** hoje só existe trocar, então não acontece.
- [ ] **Timeout de conexão do banco:** a leitura da cor no layout raiz já tem teto de 3 s, mas o `PrismaPg` não define `connectionTimeoutMillis`; telas que consultam o banco continuam esperando uma conexão travada (risco que já existia no login).
- [ ] **Teste intermitente "sair encerra a sessão" (E2E `autenticacao`):** falha de vez em quando (o logout chega ao `/login`, mas um `goto("/")` logo depois ainda mostra o painel). Reproduzido também no commit anterior à Fase 3.5 (`252a4df`), então não é da identidade visual. Hipótese não confirmada: uma requisição em andamento (atualização do sino) devolve o cookie de sessão renovado depois do logout. Investigar antes de a Fase 8 virar checklist de produção, pois pode significar logout que não encerra a sessão em situações reais.
