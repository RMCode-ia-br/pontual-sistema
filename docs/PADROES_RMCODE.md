# Padrões RM Code: blocos reutilizáveis

O sistema da Pontual é também um **laboratório**: tudo que não depende do negócio está isolado para ser reaproveitado em outros projetos. Regra de ouro: **isole e documente, não abstraia antes da hora**. Reuso nasce de código simples e bem separado, não de configuração excessiva.

Separação de pastas: `src/lib/*` (e alguns `src/components/*`) **não conhecem o negócio**; `src/modules/*` é o domínio da Pontual.

## Blocos (Fase 0)

| Bloco | Onde | O que entrega | Depende de |
| --- | --- | --- | --- |
| Autenticação por usuário e senha | `src/lib/auth/*`, `src/proxy.ts`, `src/types/next-auth.d.ts` | Auth.js v5 (Credentials), JWT 8 h, bcrypt custo 12, bloqueio 5 falhas/15 min por login e IP, **sessão validada no banco** (ativo + `versaoSessao`), `exigirSessao()` | Prisma (`Usuario`, `TentativaLogin`) |
| Telas de login e troca de senha | `src/modules/usuarios/{actions/sessao.ts,components}`, `src/app/(auth)` | login, troca obrigatória, política de senha | bloco acima |
| Gestão de usuários | `src/modules/usuarios/*` | criar, editar, ativar/desativar (derruba sessão), redefinir senha, "último ativo" protegido com `FOR UPDATE` | auth |
| Auditoria | `src/lib/auditoria`, `src/modules/auditoria` | `registrarAuditoria(tx, ...)`, diff só dos campos alterados, **hash nunca é gravado**, tela com filtros e CSV | Prisma (`LogAuditoria`) |
| Permissões | `src/lib/permissoes` | `can(usuario, acao, recurso)` num ponto único (hoje `true`) | nenhuma |
| Anexos privados | `src/lib/storage`, `src/modules/anexos` | upload direto ao Storage por URL assinada, compressão de imagem no navegador, validação do tamanho/tipo **reais**, download com link de 60 s, exclusão lógica | Supabase Storage, Prisma (`Anexo`) |
| CSV seguro | `src/lib/csv` | CSV para Excel pt-BR, com proteção contra injeção de fórmula | nenhuma |
| Formatadores e validadores | `src/lib/formatadores`, `src/lib/validadores` | moeda em centavos sem float, datas em SP, datas de calendário sem erro de fuso, telefone E.164, CPF/CNPJ | `date-fns-tz` |
| Resultado padrão de ações | `src/lib/acoes.ts` | `ResultadoAcao`, `executar()` (erro seguro, sem vazar detalhes), Zod → erros por campo | `zod` |
| Shell da aplicação | `src/components/layout/*` | menu lateral colapsável, barra inferior no celular, busca Ctrl+K, sino, tema, menu do usuário | shadcn/ui |
| Componentes de formulário | `src/components/formulario.tsx`, `campo-senha.tsx` | campo com erro inline e acessibilidade, select/checkbox nativos | Tailwind |
| Página de erro e 404 | `src/components/layout/pagina-de-erro.tsx`, `error.tsx`, `not-found.tsx` | erro amigável com código, sem detalhes técnicos | nenhuma |
| Rotina diária idempotente | `src/app/api/cron/diario` | protegida por `CRON_SECRET` (comparação em tempo constante) | Vercel Cron |
| Saúde | `src/app/api/health` | confere o banco sem expor dados | Prisma |
| PWA | `src/app/manifest.ts`, `src/app/icons/[arquivo]` | manifesto e ícones gerados com a cor e a inicial da empresa | `next/og` |
| Cabeçalhos de segurança | `next.config.ts` | CSP, HSTS, nosniff, frame DENY, referrer, permissions | nenhuma |
| Catálogos editáveis | `src/modules/catalogos` | CRUD genérico de listas simples com ordem e ativo, escritas dentro da transação | Prisma |
| CI e backup | `.github/workflows/{ci,backup}.yml` | lint, typecheck, testes e build; `pg_dump` criptografado agendado | GitHub Actions |
| Guarda de codificação | `tests/unit/encoding.test.ts` | falha se algum arquivo tiver texto UTF-8 corrompido ou BOM | Vitest |
| Harness de E2E | `playwright.config.ts`, `tests/e2e/{banco,ajudantes,dados}.ts` | usuário isolado, IP por teste, limpeza completa (inclusive Storage), restauração de configuração | Playwright, `pg` |

## Checklist para reaproveitar em um projeto novo

1. **Copie** `src/lib/{auth,db,auditoria,storage,csv,formatadores,validadores,permissoes}`, `src/lib/acoes.ts` e `src/proxy.ts`.
2. **Prisma:** reutilize os modelos `Usuario`, `TentativaLogin`, `LogAuditoria`, `Anexo` e as colunas padrão (`criadoEm`, `atualizadoEm`, `criadoPorId`, `atualizadoPorId`, `deletadoEm`). Use `prisma.config.ts` com `DIRECT_URL` **só para migrações** e o driver adapter `@prisma/adapter-pg`.
3. **Variáveis:** `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL`, `SUPABASE_*`, `CRON_SECRET`. Gere os segredos; **codifique a senha do banco** na URL.
4. **Rotas públicas** em `src/lib/auth/config.ts` (`ROTAS_PUBLICAS`) e `matcher` do proxy.
5. **Seed:** copie o padrão de `prisma/seed.ts` (admin só se não houver usuário; `createMany` + `skipDuplicates`; nunca sobrescrever edições).
6. **Toda Server Action:** `exigirSessao()` → `can()` → Zod → `executar()` → transação com `registrarAuditoria(tx, ...)`.
7. **Arquivos `"use server"`** exportam **somente** ações que começam com `exigirSessao()`; consultas e helpers ficam em `queries.ts` com `import "server-only"`.
8. **Testes:** copie a pasta `tests/e2e` (setup/teardown e helpers) e o guarda de codificação.
9. **Backup:** copie `backup.yml`, cadastre os segredos e **teste a restauração**.
10. **Trocar o que é da Pontual:** nome, logo e cores vêm de Configurações; nada da empresa fica fixo no código.

## O que NÃO é reutilizável (é da Pontual)

Tudo em `src/modules/{tarefas,configuracoes,feriados,modelos-texto,backup}` que tenha regra do negócio (prazos em dias úteis, textos de proposta, limites do plano gratuito, categorias do DRE) e os dados do seed.

## Blocos da Fase 1 (cadastros)

| Bloco | Onde | O que entrega | Depende de |
| --- | --- | --- | --- |
| Leitor de planilhas | `src/lib/csv/{ler,arquivo}.ts` | CSV (separador automático, BOM, aspas, Windows-1252) e XLSX lidos no navegador, com limites de tamanho, linhas, colunas e célula | `read-excel-file` |
| Domínio de cadastros | `src/lib/dominio/{numeros,duplicidade,mapeamento,reajuste,modelos-texto}.ts` | números pt-BR e centavos, duplicidade, mapeamento de colunas, reajuste (meio para cima), modelos com `{{variáveis}}` | nenhuma |
| Campos de formulário | `src/lib/validadores/campos.ts` | fábricas Zod (telefone E.164, CPF, CNPJ, CEP, moeda, datas, inteiros) | `zod` |
| Máscaras e proteção de saída | `src/lib/formatadores/mascaras.ts`, `src/lib/hooks/usar-protecao-de-saida.ts`, `src/components/campo-mascarado.tsx` | máscara enquanto digita; aviso ao sair com alterações | nenhuma |
| Infra de listas | `src/lib/listas/parametros.ts`, `src/components/lista/*`, `src/modules/filtros` | busca/ordem/página na URL, tabela + cartões no celular, colunas, ação em lote, filtros salvos | `f_unaccent` + Prisma |
| Ações de cadastro | `src/components/{acoes-do-cadastro,confirmar-acao}.tsx` | inativar, reativar, lixeira com confirmação | shadcn |
| Importação reversível | `src/modules/importacao` (`linhas`/`analisar`/`aplicar`) | assistente de 4 passos, lote com antes/depois, desfazer seguro | Prisma (`LoteImportacao*`) |
| Lixeira | `src/modules/lixeira` | listar e restaurar conferindo unicidade | Prisma |

**Reaproveitar:** copie `src/lib/{csv,dominio,listas,validadores,formatadores}`, `src/components/lista` e `src/components/{confirmar-acao,acoes-do-cadastro,campo-mascarado}.tsx`; recrie `campos.ts`/`linhas.ts` da importação com os campos do projeto novo. **Da Pontual (não reutilizável):** tipos de cadastro, regras de reajuste por fornecedor, categorias e unidades.

## Blocos da Fase 2 (comercial) — reutilizáveis
| Bloco | Onde | O que entrega | Depende de |
| --- | --- | --- | --- |
| iCalendar | `src/lib/ics/index.ts` | gerador RFC 5545 (UTC, escape, dobra em octetos, alarme, STATUS/SEQUENCE) | nenhuma |
| Tokens secretos | `src/lib/tokens/index.ts` | token de 256 bits, hash SHA-256, validação de formato (feed da agenda; chaves de API na Fase 8) | `node:crypto` |
| Calendário e agenda (puro) | `src/lib/dominio/{calendario,agenda}.ts` | grade de mês/semana, colunas de eventos sobrepostos, conflito, expediente, horários livres, feriados/férias em "dia local" | `date-fns-tz` |
| Contador sequencial | `ContadorSequencia` + `proximoCodigoDoProjeto` (`src/modules/projetos/servico.ts`) | número por ano sem repetição sob concorrência (UPSERT atômico na transação) | Prisma |
| Kanban | `src/modules/projetos/components/{kanban,cartao-projeto}.tsx` | dnd-kit com mouse/toque longo, menu "Mover para…" acessível, movimento otimista com reversão | `@dnd-kit/core` |
| Linha do tempo genérica | `src/modules/clientes/components/linha-do-tempo.tsx` | vínculo e ações por props (cliente ou projeto) | Prisma (`Interacao`) |
**Da Pontual (não reutilizável):** fases do funil, motivos de perda, tipos de compromisso, textos dos modelos de WhatsApp.

## Blocos da Fase 3 (propostas) — reutilizáveis
| Bloco | Onde | O que entrega | Depende de |
| --- | --- | --- | --- |
| Interpretador de fórmulas seguro | `src/lib/dominio/formulas.ts` | parser de descida recursiva (sem `eval`): variáveis, operadores, funções fechadas, `se` preguiçoso, limites de tamanho/profundidade/nós | nenhuma |
| Dinheiro e totais | `src/lib/dominio/{preco,parcelas}.ts` | centavos com BigInt, pontos-base, markup, acréscimo, totais por opção, parcelas com a última absorvendo a diferença | nenhuma |
| Numeração com trava | `src/modules/propostas/servico.ts` (`reservarNumeroDeProposta`) + `numeracao-proposta.ts` | número sequencial sem repetição sob concorrência (`FOR UPDATE`) e sem colidir com o já emitido | Prisma |
| Ciclo de documento congelável | `src/modules/propostas/servico-ciclo.ts`, `src/lib/dominio/ciclo-proposta.ts` | rascunho → enviado (snapshot) → aprovado/recusado, revisões, aprovação transacional idempotente | Prisma |
| PDF de documento | `src/modules/propostas/pdf/*`, `src/app/api/propostas/[id]/*` | `@react-pdf/renderer` (A4, rodapé fixo, itens sem quebrar, aviso de rascunho), rota autenticada e auditada | `@react-pdf/renderer` |
| Desenho esquemático | `src/lib/dominio/desenho.ts` + `src/components/desenho-esquadria.tsx` | formas puras renderizadas em SVG e no PDF | nenhuma |
| Editor com cálculo no servidor | `src/modules/propostas/components/*` | formulário grande em estado local, prévia de preço por ação do servidor, painel de totais | Server Actions |
**Da Pontual (não reutilizável):** tipologias e templates de descrição, tabela de preços por linha/acabamento/vidro, modelos de condição de pagamento, regra do acréscimo da nota fiscal.

## Blocos da Fase 3.5 (identidade visual) — reutilizáveis
| Bloco | Onde | O que faz |
| --- | --- | --- |
| Tema derivado da cor da marca | `src/lib/tema/{cores,derivar}.ts` | Hex → tokens (`primary`, `ring`, `accent`, charts) em claro e escuro, com contraste WCAG AA garantido; OKLCH, contraste e mistura. Sem conhecimento do negócio. |
| Injeção da cor no tema | `src/components/layout/estilo-da-marca.tsx` + layout raiz | `<style>` com `:root:root{…}` e `:root:root.dark{…}` vindos de Configurações; só hex validado. |
| Campo de cor com prévia | `src/modules/configuracoes/components/campo-cor.tsx` | Seletor nativo + hex + prévia nos dois modos e aviso de ajuste. |
| Fontes dos PDFs | `src/lib/pdf/fontes.ts` (+ TTF e licença) | Registra a família do sistema no react-pdf; exige `outputFileTracingIncludes` no deploy serverless. |
| Gerador de ícones | `scripts/gerar-icones.ts` (`npm run icones`) | Logo circular, favicon (só símbolo), apple-icon opaco, PWA e maskable; ICO montado à mão. |
| Extração de identidade | `scripts/identidade/extrair-site.ts` | Lê tokens CSS e estilos de um site com Playwright e grava um documento. |
| Logo padrão pela seed | `prisma/seed-identidade.ts` | Envia a logo ao Storage e preenche `logoCaminho` só se vazio, em transação. |
| Formato de imagem pelos bytes | `src/modules/propostas/pdf/logo.ts` | `formatoDaImagem`: PNG/JPEG pela assinatura. |

**Para reaproveitar em outro projeto:** copie `src/lib/tema`, ajuste `SUPERFICIES` e o `:root`/`.dark` do `globals.css` (o teste `tests/unit/tema.test.ts` confere que os dois concordam e que a paleta passa em AA), meça no site do cliente as relações de `accent` e `chart-2` (ver `docs/IDENTIDADE_VISUAL.md`) e edite `CONFIG` em `scripts/gerar-icones.ts` para o disco e o símbolo da nova logo.
