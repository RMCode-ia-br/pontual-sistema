# Pendências (dependem de uma pessoa)

## Do cliente (Pontual)
- [ ] **Endereço correto:** propostas trazem o nº 185, o site traz 195. Está editável em Configurações.
- [x] **Alíquota efetiva do Simples:** fora do escopo por decisão do dono (2026-11-12): o imposto é lançado à mão como despesa real "Impostos (DAS)" e o sistema não calcula alíquota (decisão 102). A margem de lucro foi informada em 2026-11-13: é **markup sobre o custo** (80%; 100% para guarda-corpo e vidro temperado), ver `docs/DECISOES.md` (58 e 61).
- [ ] **Numeração das propostas:** começa em 2000-26 (informado pelo dono; o último real é próximo de 1200). Confirmar se o contador reinicia por ano (padrão: não).
- [x] **Limite do Simples Nacional / RBT12:** fora do escopo por decisão do dono (sem RBT12 nem alerta). Substituído na Fase 7 pelo indicador gerencial "Recebido com nota fiscal nos últimos 12 meses" (decisão 117), que a coluna antiga `limiteSimplesCentavos` passa a alimentar como "limite" (migração M1 a anula; aguarda o OK do Régis).
- [ ] **Limite do faturamento com nota (Marcelo):** informar o valor real em Configurações → Empresa → Financeiro **depois dos testes**. Vazio ou zero = "limite não informado": o painel mostra só o valor recebido com nota, sem percentual (decisão 117c). Nada é preenchido por conta própria.
- [x] **Confirmado pelo Marcelo (2026-11-12):** o indicador de faturamento com nota soma só os pagamentos marcados com nota (`Lancamento.comNotaFiscal`); entrada avulsa marcada com nota, sem conta a receber, fica de fora (decisão 117). "Pedido de avaliação no Google enviado" = tarefa "Pedir avaliação" concluída (decisão 118).
- [ ] **Preços e tabelas de fornecedores**, **composições técnicas das tipologias** e fórmulas de corte (nada é preenchido por conta própria).
- [x] **Mapa gatilho → etapa** confirmado pelo Marcelo em 2026-11-12 (sinal na aprovação; 2ª parcela na conclusão de FABRICACAO; última na conclusão de INSTALACAO_VIDROS). Segue editável em Configurações → Modelo de etapas.
- [ ] Faixas de valor para sugerir o porte do projeto (opcional).
- [ ] Textos legais das propostas (Apêndice A) e logo em vetor.
- [ ] E-mails institucionais `marcelo@` e `luan@pontualmacae.com.br` e um e-mail institucional para as propostas (hoje é um Gmail).
- [ ] **Link direto de avaliação do Google** (o link `share.google` pode não ser o de avaliação) e prints/texto do Perfil do Google e do Instagram, se a leitura automática não for possível.

## Da RM Code
- [ ] **Isolamento do banco de testes (fica para a migração aos planos Pro):** hoje os testes de integração e E2E rodam no banco compartilhado, que tem dados reais do Marcelo. Até lá a regra é: prefixo próprio ("Int ", "E2E "), comparação por diferença e **nenhuma dependência de dado que o dono possa editar ou excluir** (decisão 121). Com o Supabase Pro, usar um projeto/branch só de testes.
- [ ] **Endurecimento antes do uso definitivo:** repositório privado, backup, separação de ambientes, segurança e LGPD (ver Fase 8). Inclui migrar para Vercel Pro e Supabase Pro. Não é necessário no mês de teste (decisão 101).
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
- [x] **Feriados municipais de Macaé:** cadastrados em 2026-11-12 (São João Batista 24/06, emancipação 29/07 e Dia do Comerciário, 3ª segunda de outubro, como regra), mais São Jorge e Corpus Christi (decisão 100). Falta só aplicar o seed no banco de São Paulo (aguarda OK) e conferir com o Marcelo se há outros feriados locais.
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
- [ ] **Testes E2E usam o banco real** (restauram a configuração no fim, mas um processo interrompido pode deixá-la alterada). Ideal: um banco/projeto Supabase só de testes. Consequência já vista: o E2E "a lista de tarefas começa vazia" é **pulado** (com o motivo) quando o banco já tem tarefas de verdade, como as da aprovação de "Casa Regis" e "Varanda Ludmilla".
- [ ] **Rotas públicas** (`/api/health`, `/icons/*`) consultam o banco sem limite de requisições (superfície de DoS leve): limitar por IP ou usar cache.
- [ ] **CSP:** `connect-src` e `img-src` aceitam qualquer `*.supabase.co` (fixar o host do projeto); `script-src 'unsafe-inline'` é exigência do Next sem nonce.
- [ ] **Logo:** uma chamada ao Storage e uma URL nova por renderização do layout (e na tela de login, sem autenticação): guardar em cache.
- [ ] **Textos da empresa no código:** "Marcelo e Luan" em Primeiros passos e o login `admin` fixo em Primeiros passos e em Usuários.
- [ ] **CI:** rodar `prettier --check`, E2E (exige banco de teste) e fixar as actions por hash.
- [ ] **Backup:** `openssl enc` não autentica integridade (preferir `age` ou GPG autenticado); só há o e-mail padrão do GitHub como alerta de falha.
- [ ] **Tarefas:** sem paginação no servidor (limite fixo de 200); o status `CANCELADA` existe mas nenhuma ação o usa; os campos `tipo` e os vínculos (`clienteId`/`projetoId`) ainda não têm formulário.
- [x] **Anexo:** `descricao`, `momento` (antes/durante/depois) e `usarNoPortfolio` agora são gravados e editáveis (fotos da obra e galeria, Fase 4; decisão 97).
- [ ] **Busca:** sem índice trigram/GIN para `unaccent(...) ILIKE` (sem problema com poucos dados; criar função `unaccent` imutável e o índice quando o volume crescer).
- [ ] **Atalho de teclado para "Novo"** (a spec pede, além do Ctrl+K).
- [ ] **Feriados nacionais cobrem 2026 a 2030:** regerar a cada ano (e avisar quando o horizonte acabar, antes de a Fase 4 usar dias úteis). Férias coletivas que atravessam o ano agora aparecem nos dois anos (decisão 100e).
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
- [ ] **Férias coletivas** (dezembro/Carnaval) ainda não definidas: cadastrar em Configurações → Feriados quando o Marcelo definir, para a agenda avisar. (Feriados de Macaé: resolvido, decisão 100.)
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
- [x] **Mapa gatilho → etapa:** confirmado pelo Marcelo em 2026-11-12 (ver o primeiro bloco desta lista).

## Surgidas na Fase 4 (obras)
- [ ] **Confirmar o marco da garantia** do modelo de etapas (padrão: INSTALACAO_VIDROS concluída inicia os 90 dias de regulagem). O mapa gatilho → etapa já foi confirmado (2026-11-12). Editável em Configurações → Modelo de etapas.
- [ ] **Durações das etapas:** não existem no sistema de propósito. Os dias vêm de cada proposta (por grupo: material, execução, vidros e finalização; ou total). O Marcelo pode querer durações padrão por tipo de obra; só depois de ele informar.
- [ ] **Férias coletivas** (dezembro e Carnaval) precisam estar cadastradas em Configurações → Feriados para os avisos aparecerem (não afetam dia útil). Os feriados nacionais, de Macaé, São Jorge e Corpus Christi (2026 a 2030) e o Carnaval como ponto facultativo vêm da seed (decisão 100). A obra avisa quando a data final cai num ano sem nenhum feriado cadastrado.
- [ ] **Texto da legenda do portfólio** (`portfolio.legenda`) é um texto simples proposto por mim e marcado "revisar texto"; o Marcelo ajusta o tom em Configurações → Modelos de texto. A "região" da legenda usa a UF do endereço da obra (não há cadastro de regiões); nunca entram nome, telefone ou endereço do cliente.
- [ ] **Pausa depois de vencido o prazo** também estende o prazo prometido (a spec não limita). Se o Marcelo achar que distorce a pontualidade, limitar a pausas anteriores ao prazo original.
- [ ] **Bloquear uma etapa × pausar a obra:** hoje são independentes: bloquear com motivo justificado (alvenaria, cliente, condomínio) **não** estende o prazo; só a pausa estende. Confirmar com o Marcelo se bloquear por motivo justificado deveria abrir a pausa sozinho (evitaria registrar duas vezes, mas dá menos controle).
- [ ] **A entrega só conclui com as etapas anteriores resolvidas** (concluídas ou dispensadas). Confirmar com o Marcelo se isso atrapalha o dia a dia (etapas que ele nunca registra podem ser removidas do modelo ou dispensadas).
- [ ] **Obras da Fase 3 já aprovadas no banco de São Paulo** (se houver) não têm etapas: usar o botão "Gerar etapas" na obra. Não há dados reais lá (só demonstração).
- [ ] **Atribuição de equipe e responsável por etapa** é manual (diálogo "Editar"); a escala de equipes por data entra com o calendário de instalação (Bloco 4).
- [ ] **Lista de obras sem paginação no servidor** (limite de 300, com aviso) e **busca sem ignorar acentos** (`contains` sem `unaccent`, como na lista de propostas). Passar para SQL agregado quando o volume crescer (Fase 7).
- [ ] **Agenda e etapa não se sincronizam:** concluir a etapa de instalação não marca o compromisso como realizado (nem o contrário), e remarcar ou cancelar o compromisso não muda as datas previstas da etapa. Confirmar com o Marcelo se quer a sincronização.
- [ ] **Calendário de instalação sem visão por equipe lado a lado** (colunas por equipe): hoje é um filtro de equipe sobre o calendário comum. Avaliar se o dia a dia pede a visão em colunas.
- [ ] **Galeria: o cliente que só autorizou "por foto"**: a autorização é por obra (como a spec). Se o Marcelo quiser autorização por foto, é um campo a mais no anexo.
- [ ] **Região da legenda** é a UF do endereço da obra (não há cadastro de regiões). Se ele quiser "Região dos Lagos" ou "Norte Fluminense", é preciso um cadastro (cidade → região).
- [ ] **Kit de postagem sem marca d'água nem corte para o formato do Instagram** (quadrado/vertical): as fotos saem como foram enviadas (reduzidas a ~1600 px). Avaliar se ele quer isso.
- [ ] **Fotos já enviadas na aba "Arquivos e fotos" do projeto** (antes desta fase) não têm momento nem categoria e não entram na galeria; para entrarem, reenviar pela aba Fotos da obra.
- [ ] **Download do kit depende do Storage ao vivo** (baixa as fotos no momento): se o Supabase estiver pausado (plano gratuito) o ZIP falha com mensagem; as miniaturas ficam como "Imagem indisponível".
- [ ] **Valor da visita de assistência cobrada:** não existe valor padrão (de propósito); o gestor digita a cada chamado. O Marcelo pode querer uma tabela (por tipo de problema ou por distância); só depois de ele informar.
- [ ] **Garantia de "outro" problema** segue a janela da regulagem (90 dias); vidro só até a instalação, como na spec. Confirmar com o Marcelo se há outras garantias (ex.: silicone, vedação) com prazo próprio.
- [ ] **Agenda e chamado não se sincronizam:** realizar a visita não resolve o chamado, e remarcar ou cancelar o compromisso não muda a situação "Visita agendada". Confirmar se ele quer a sincronização.
- [ ] **Chamado cancelado ou resolvido com cobrança já gerada** mantém a conta a receber (nada é apagado); o estorno ou cancelamento da conta é do Financeiro (Fase 5).
- [ ] **Numeração dos chamados é global** (`#0001`...), sem zerar por ano. Se ele preferir `NNNN-AA` como as propostas, ajustar.
- [ ] **Relatório de obras: atraso por etapa só vale com data prevista definitiva.** Etapas com data provisória (antes de a medição exata ser concluída e de o gestor aplicar as datas) entram na conta como as demais; se isso distorcer, excluir as provisórias. O sistema também não guarda o histórico de bloqueios: o relatório mostra os bloqueios de agora e as pausas do período. Se o Marcelo quiser "quantas vezes e por quantos dias cada motivo bloqueou", é preciso registrar as datas de bloqueio.
- [ ] **Pontualidade do painel usa 90 dias fixos** (como o funil). Se ele quiser mês, trimestre ou ano, o relatório já aceita qualquer período; falta só um seletor no painel.
## Da revisão sênior da Fase 4 (o que NÃO foi corrigido, e por quê)
- [ ] **Segunda parte que traz esquadria não reativa etapas dispensadas pela primeira** (decisão 94c): se a primeira parte era só box e a segunda inclui esquadria, as etapas de esquadria seguem dispensadas até o gestor reativar na obra. Baixo risco; a obra mostra as etapas dispensadas.
- [ ] **Alterar prazo ou justificativa de pausa em obra já concluída** é permitido (com auditoria) e muda a pontualidade passada. Avaliar recusar ou pedir confirmação.
- [ ] **Modelo de etapas sem a etapa `ENTREGA`:** a regra "só entrega com as anteriores resolvidas" não vale e a obra conclui pela última etapa ativa. O modelo padrão tem a entrega; a validação do modelo poderia exigi-la.
- [ ] **Kit de postagem entrega os bytes originais da foto:** se a compressão no navegador não rodou, o EXIF (GPS) vai junto. Remover metadados no servidor ao montar o ZIP e limitar o tamanho total do download (hoje: 20 fotos, 10 MB cada, em memória).
- [ ] **Galeria e lista de obras limitam antes de filtrar** (600 fotos; 300 obras), então itens sem autorização ou fora do filtro de etapa/semáforo/equipe podem ocupar o limite. Mover os filtros para o SQL junto com a paginação (Fase 7).
- [ ] **Ordem da conta a receber do chamado** (`ordem` = maior + 1) não tem unicidade quando a conta não tem proposta: pode repetir numa corrida rara. Sem efeito funcional hoje.
- [ ] **Vidro avisado antes da instalação concluída** sai "fora da garantia" (sem marco não há como conferir); a spec diz "garantia até a instalação". Decisão 93i; o gestor ajusta. Confirmar com o Marcelo se deveria ser "em garantia".
- [ ] **Limpeza de `SessaoRevogada` (cron, Fase 8):** o proxy renova o JWT a cada resposta, então o `exp` pode passar um pouco do `expiraEm` gravado; apagar só depois de `expiraEm` + 1 h.
- [ ] **Testes de integração rodam contra o banco de desenvolvimento** e o de painel/relatório compara por diferença (frágil se alguém mexer em obras reais durante a execução). Um banco só de testes (ou schema separado) resolve; não há no plano gratuito.
- [ ] **Sem teste de integração do Route Handler do kit** (R18, 403, limite de fotos, ZIP): só o E2E o exercita.

- [ ] **Dias de pausa e prazo "sem pausas":** o "sem considerar pausas" é o prazo contado do relógio sem nenhuma pausa; conferir com o Marcelo se é essa a versão que ele quer ver.

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
- [x] **Teste intermitente "sair encerra a sessão" (E2E `autenticacao`):** era falha real (logout não revogava o token e uma resposta do proxy devolvia o cookie renovado). Corrigido no Bloco 0 da Fase 4 com revogação por `sid` (`docs/DECISOES.md`, 92).
- [ ] **Varrer `SessaoRevogada` expirada** (linhas com `expiraEm` no passado) na rotina diária do cron (Fase 8). O volume é de uma linha por logout, sem impacto até lá. Tokens emitidos antes da correção (sem `sid`) não são revogáveis e valem até expirar (no máximo 8 h).
- [ ] **Sessão deslizante sem teto:** o proxy renova o token a cada requisição, então uma sessão usada continuamente nunca expira (só os 8 h de inatividade). Se for preciso um teto absoluto (ex.: 12 h desde o login), guardar `iat` do login no JWT e rejeitar acima do limite.

## Surgidas na Fase 5 (financeiro)
- [ ] **Contas financeiras e saldos iniciais:** o sistema não traz nenhuma conta nem saldo (nada foi inventado). O Marcelo cadastra as contas (nome, tipo, saldo inicial e data do saldo) quando começar a usar; até lá o fluxo de caixa e o DRE avisam "saldo não informado". Sem número de conta nem dado bancário.
- [ ] **"Com nota" no recebimento (segue aberta):** a marca pode mudar no pagamento, mas o valor **não** é recalculado sozinho (o valor da parcela já traz o acréscimo de 5% quando a proposta era com nota). Confirmar com o Marcelo o que deve acontecer com o valor quando se troca a marca "com nota" de um recebimento já registrado: basta como está ou o sistema deve ajustar o valor? (A parte da marca que alimenta o indicador de faturamento com nota já foi confirmada: vale a do pagamento, decisão 117.)
- [ ] **Categorias sugeridas** (decisão 102): "Tarifas bancárias e maquininha", "Frete" e "Instalação terceirizada" foram acrescentadas ao seed; o Marcelo ajusta nomes e grupos em Configurações → Catálogos.
- [ ] **Prazos de cobrança e horizonte das recorrências** são padrões editáveis (vence em breve: 7 dias; lembrete de cobrança: no dia; recorrências: 3 meses à frente). Revisar depois do mês de teste.
- [ ] **Formas de pagamento como catálogo editável** (hoje a lista é fixa: PIX, transferência, espécie, cartão de crédito e boleto): melhoria futura, se o Marcelo pedir outra forma no mês de teste.
- [ ] **Gerar contas de salário a partir do cadastro de funcionários** (spec 7.9, opcional): fora por ora; salários e aluguel entram como recorrência mensal de conta a pagar.
- [ ] **Fase 6 (R15, custo real e margem por obra):** o imposto da obra deixa de ser alíquota × receita. O imposto real é a despesa "Impostos (DAS)" lançada à mão; a Fase 6 decide como (e se) ratear por obra.

## Da revisão sênior da Fase 5 (o que NÃO foi corrigido, e por quê)
Corrigidos na fase: tarefa de cobrança que não voltava depois de concluir, reabrir e concluir a etapa; conta a pagar impossível de pagar depois de a categoria ser inativada; recorrência com início antigo gerando dezenas de contas atrasadas; totais das listas somando contas canceladas; fim antecipado da recorrência sem cancelar as já geradas; parcelamento que podia gerar parcela zero ou negativa; ordem de trava no estorno de transferência; reversão de parcela e cancelamento de chamado sem travar a conta; realizado do fluxo com contas inativas; saldo projetado ignorando contas a pagar vencidas (ver `docs/revisoes/fase-5.md`).
- [x] **Saldo projetado e o "a receber" vencido — resolvido em 2026-11-12 (decisão 107).** O dono conta com os recebimentos vencidos (a inadimplência é quase zero; o cliente só pede mais alguns dias): o a receber vencido entra no primeiro período como esperado para hoje, ou na data que o cliente prometeu ("Cliente pediu mais prazo"); o a pagar vencido continua saindo no primeiro período. O vencimento original segue mandando no atraso e na inadimplência.
- [ ] **Recorrência com início antigo só gera do mês anterior em diante** (e o ano digitado errado não cria centenas de contas). Contas mais antigas, se existirem, entram à mão. Avisar na tela se o Marcelo estranhar.
- [ ] **Editar uma recorrência sobrescreve ajustes manuais** (valor ou vencimento alterados à mão) das ocorrências futuras em aberto, sem aviso na tela, e não trava a recorrência (um pagamento simultâneo é barrado pelos CHECKs, com erro genérico).
- [ ] **Pagamento ou recebimento com data anterior à data do saldo inicial da conta** não mexe no saldo (o extrato marca "já incluído no saldo inicial"); o diálogo ainda não avisa na hora.
- [ ] **Tarefa "Cobrar parcela" concluída à mão e depois estorno:** o estorno reabre toda tarefa concluída da parcela, inclusive a que o usuário concluiu antes de qualquer pagamento. Efeito cosmético.
- [ ] **Extrato da conta e visão geral leem sem limite no banco** (todos os lançamentos da conta; todos os títulos em aberto). Sem problema no volume de um mês de teste; restringir por período no SQL e paginar quando crescer (Fase 7).
- [ ] **Sem filtros salvos nas listas do Financeiro** (a spec pede filtros salvos nas listas) e sem "escolha de colunas" no extrato; as listas têm busca, abas, filtros por URL, ordenação, paginação e CSV.
- [ ] **Comprovante só no lançamento** (pagar e receber não anexam no diálogo): abra o lançamento depois do pagamento.
- [ ] **A cobrança é uma tarefa, não uma notificação** (lembrete antes do vencimento, parâmetro de Configurações): o aviso no sino e o lembrete automático por cron são da Fase 8.
- [ ] **`seed:demo` com financeiro fictício não foi executado** (o banco tem dados reais; regra do dono). Rodar só em banco de desenvolvimento sem dados reais.
- [ ] **Teste de integração do Route Handler dos CSVs financeiros:** só o E2E exercita (status, tipo e bloqueio sem sessão).

## Surgidas na Fase 6 (estoque e compras)

- [ ] **Preço do kg do alumínio por acabamento** (e por linha, se o Marcelo quiser). Nada foi preenchido: o perfil por kg mostra "sem preço do kg" e o custo derivado fica "não informado" até o Marcelo informar na tela "Preço do kg do alumínio".
- [ ] **Peso por metro e comprimento da barra de cada perfil.** Nunca inventados: sem peso por metro não há custo por metro/barra nem conversão kg ↔ barras (a interface avisa em cada perfil). A tabela de pesos costuma vir no catálogo da linha ou no programa de corte.
- [ ] **Retalho mínimo aproveitável (mm)** em Configurações. Vazio: ao baixar um perfil, o sistema pergunta "retalho ou sucata?" em vez de decidir.
- [ ] **Custo de mão de obra por m²** em Configurações (a tela traz o botão "Sugerir a partir dos salários", que só preenche com a sua confirmação). Vazio: a margem de toda obra fica "incompleta".
- [ ] **Estoque inicial (contagem inicial):** opcional e nunca com valor inventado; o Marcelo conta e lança quando quiser (custo vazio = "sem custo").
- [ ] **Custos dos produtos:** produto sem custo mostra "sem custo" e deixa a margem das obras que o usam "incompleta" até a primeira compra recebida com preço (ou o cadastro do custo).
- [ ] **Arquivos de exemplo do programa da linha Suprema (pedido ao dono):** (1) exemplos das saídas do programa para uma ou duas janelas reais (lista de corte, lista de pedido de perfis, medida do vidro, sobras), no formato que ele gerar (PDF, CSV, XLS, TXT ou print); (2) nome e versão do programa e se ele exporta arquivo; (3) tabela de pesos por metro dos perfis e a tabela de preço do kg por acabamento do fornecedor. Guardar em `docs/referencias/` (fora do Git).
- [ ] **EVOLUÇÃO FUTURA — importar do programa da linha Suprema a lista de corte e a lista de pedido** (plano de corte, medida do vidro, perfis, quantidades e sobras), alimentando a compra de perfis, o pedido de vidro e o retalho/sucata. Fora do escopo da Fase 6 (decisão 108-j); depende dos arquivos de exemplo acima.


## Da revisão sênior da Fase 6 (o que NÃO foi corrigido, e por quê)

Corrigidos na própria revisão: leitura de quantidade com ponto ("2.5" virava 25), promessa de pagamento velha depois de corrigir o vencimento, estorno de material de obra cancelada, "falta" da lista de materiais que ignorava o que já foi entregue à obra, comparação "estimado × real" (agora só material), data do estorno em UTC, arredondamento assimétrico da devolução, data inválida na URL das movimentações e peso por metro zero na sucata. O que ficou (nenhum tem cenário explorável hoje, com um gestor e mês de teste):

- [ ] **Devolução entra pelo custo atual do produto**, não pelo da saída original (a tela avisa "custo atual"). Se o custo subiu entre a saída e a devolução, a margem da obra fica um pouco acima do real. Correção conhecida: devolução "referente à saída X" herdando o custo.
- [ ] **Devolução de obra cancelada ou perdida** continua recusada (só o estorno foi liberado); o material volta por ajuste sem obra.
- [ ] **Mão de obra rateada × conta a pagar com obra e sem compra** (ex.: instalador terceirizado): as duas entram no custo da obra e a tela não avisa; o Marcelo decide se terceirizado entra no rateio ou à parte.
- [ ] **Custo de mão de obra por m² é sempre o valor atual de Configurações:** mudar o valor reescreve a margem de obras concluídas. Congelar na conclusão da obra é a correção.
- [ ] **Compra de vidro:** nada no servidor impede duas compras ativas para a mesma medida (só a interface esconde o botão); receber as duas dobraria o custo.
- [ ] **Recebimento só com valor total** (sem preço unitário) grava o custo no movimento mas não atualiza o custo do produto (o "último custo" só se atualiza com preço unitário).
- [ ] **Estorno de recebimento com saldo já consumido** deixa o saldo negativo em silêncio (sem aviso na tela).
- [ ] **Peso por metro igual a zero** ainda é aceito pelo cadastro do produto (a sucata já o trata como "sem peso"); recusar `<= 0` no esquema.
- [ ] **Teto de valores nas compras** (preço, valor total e quantidade): sem limite, números absurdos viram erro genérico do banco.
- [ ] **Relatório de estoque:** os recebimentos por fornecedor leem até 5.000 itens sem avisar truncamento, e o valor do estoque considera só produtos ativos (produto inativo com saldo fica de fora).
- [ ] **Cadastro rápido de perfil em barra sem comprimento** assume 6.000 mm (padrão da spec), o que torna inalcançável o aviso "barra sem comprimento" para produtos novos.
- [ ] **Lista de materiais converte metros em barras pela soma total**, sem plano de corte (três peças de 4 m dão 2 barras; na prática precisam de 3). É a evolução futura com o programa da linha Suprema.
- [ ] **Testes de integração que alteram o singleton de Configurações** (mão de obra por m², retalho mínimo) restauram no fim; se o processo morrer no meio, o valor real fica trocado. Passar a gravar e restaurar em transação ou a usar um valor fixo de teste lido de volta.
- [x] **Teste de integração da importação (`importacao.test.ts`) dependia de fornecedores semeados** ("Pontimac" e "Dafel" pelo nome; o Marcelo excluiu um e renomeou outro). Resolvido na Fase 7 (Bloco 0a, decisão 121): o teste e o E2E criam os próprios fornecedores e categorias, com prefixo. Ainda dependem de nomes editáveis, a corrigir no Bloco 0a: linha "Suprema", motivos de bloqueio, categorias financeiras, tipologia e condição de pagamento (ver `docs/revisoes/fase-7a.md`).
- [ ] **`seed:demo` de estoque e compras foi escrito, mas não executado** (banco com dados reais); validar num banco de desenvolvimento vazio antes de usar.
