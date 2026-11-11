# Pendências (dependem de uma pessoa)

## Do cliente (Pontual)
- [ ] **Endereço correto:** propostas trazem o nº 185, o site traz 195. Está editável em Configurações.
- [ ] **Alíquota efetiva do Simples** e **margem padrão / margem mínima de alerta** (campos vazios com aviso até definir).
- [ ] **Último número de proposta usado** (próximo número é configurável) e se o contador reinicia por ano (padrão: não).
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
- [ ] **LGPD:** banco em `us-east-1` (fora do Brasil). Avaliar com a Pontual a transferência internacional de dados, ou recriar em São Paulo (e então ajustar `regions` da Vercel).
- [ ] Usuário dedicado `prisma` no banco (hoje pode estar usando `postgres`).
- [ ] **Vercel CLI:** instalar, `vercel login` e `vercel link` (a pasta ainda não está vinculada). Cadastrar as variáveis no painel da Vercel (lista em `docs/OPERACAO.md`).
- [ ] **GitHub Actions:** cadastrar os *secrets* do backup criptografado e do CI.
- [ ] DNS de `sistema.pontualmacae.com.br` (registro.br).

## Dívida técnica / evoluções
- Quando existirem perfis de acesso: restringir salários de funcionários (hoje todos veem tudo).
- Esqueci a senha por e-mail (exige e-mail transacional).
- Plano de corte otimizado, OCR de tabelas de fornecedor, conciliação bancária (fora do escopo).

## Surgidas na Fase 0 (autenticação e seed)
- [ ] **Feriados municipais de Macaé** não foram inventados: o gestor precisa cadastrá-los em Configurações → Feriados (o seed só traz os nacionais, 2026–2030, e o Carnaval como ponto facultativo).
- [ ] **Senha inicial `admin` já existe no banco do Supabase** (usuário criado pelo seed, `precisaTrocarSenha = true`). Alguém da RM Code deve entrar e trocar a senha, ou o seed deve ser refeito com outra senha, antes de expor o endereço.
- [ ] **IP do cliente no bloqueio de login** vem de `x-forwarded-for`. Na Vercel o cabeçalho é definido pela plataforma; em outra hospedagem, só confiar nele atrás de um proxy que o sobrescreva (senão o bloqueio por IP pode ser contornado).
- [ ] **`npm audit`** reportou 7 vulnerabilidades moderadas após a instalação: avaliar na revisão sênior (podem ser só de ferramentas de desenvolvimento).
- [ ] **Testar a restauração do backup de ponta a ponta** (`pg_dump` real, criptografia, `pg_restore` em banco vazio, `migrate deploy` sem pendências). A criptografia/descriptografia já foi testada com `openssl`; falta o trecho do PostgreSQL, que exige `pg_dump`/`pg_restore` 17 (a máquina de desenvolvimento não os tem). Rodar o workflow `backup.yml` manualmente no GitHub e restaurar em um projeto Supabase vazio.
- [ ] **Teste de carga e latência:** o banco está em `us-east-1` e a equipe em Macaé; ações com várias idas ao banco (upload de arquivo: preparar, enviar, registrar) levam alguns segundos. Medir na revisão de desempenho (Fase 7/8) e avaliar recriar o banco em São Paulo (que também resolve a questão da LGPD).

## Da revisão sênior da Fase 0 (o que NÃO foi corrigido, e por quê)

Corrigidos na própria fase: bloqueio de login contornável por requisições simultâneas, tabelas expostas pela API do Supabase (RLS), redirecionamento aberto, conferência do conteúdo de uploads, auditoria de reordenação, feriado removido que não podia ser recriado, teto de valores em reais, backup só do schema public, estado "carregando", painel com widgets, aviso na exportação truncada, senha com mais de 72 bytes e outros menores (ver `docs/revisoes/fase-0.md`).

**Antes de usar dados reais ou de expor o endereço (importante):**
- [x] **Senha do `admin` no banco:** verificada em 2026-11-11, já NÃO é a senha pública `admin` (troca concluída por alguém da RM Code; os testes automáticos nunca tocam nessa conta). Para qualquer banco novo, use `ADMIN_SENHA_INICIAL` no seed e confira antes de publicar o endereço.
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
