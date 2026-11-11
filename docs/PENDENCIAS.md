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
