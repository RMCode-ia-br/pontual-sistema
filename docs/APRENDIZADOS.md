# Aprendizados e armadilhas

O que funcionou, o que deu errado e o que evitar. Atualizar ao fim de cada fase.

## 2026-11-11 — Fase 0

- **Vitest falha com "Cannot read properties of undefined (reading 'config')" quando o terminal está em `d:\...` (minúsculo).**
  No Windows, a diferença de caixa da letra do drive (`d:` × `D:`) faz o Vite tratar o mesmo módulo como dois, e o Vitest se carrega duas vezes. Acontece no Git Bash (que converte para `d:`); no PowerShell com `D:\...` funciona. Não adianta normalizar na config (o Vitest já foi resolvido antes). **Rode os testes pelo PowerShell/terminal do VS Code com o drive em maiúsculo.** Qualquer teste, até um `expect(1).toBe(1)`, falha por isso, então não é erro do código.
- **`prisma` no npm: o `latest` pode ser um release candidate.** Em 2026-11-11 era `8.0.0-rc.33`; adotamos a última estável (`7.10.1`). Conferir `npm view prisma dist-tags` antes de instalar.
- **Auth.js v5 só existe como `beta`** (`next-auth@5.0.0-beta.32`), compatível com Next 16.
- **Next 16 renomeou `middleware` para `proxy`** (`src/proxy.ts`, função `proxy`). A documentação do Next vem dentro de `node_modules/next/dist/docs`.
- **Senha do banco com `@` ou `#` precisa ir codificada na URL** (`encodeURIComponent`), senão a URL é inválida e o Prisma não conecta.
- **Supabase + Prisma:** `migrate dev` precisa de banco-sombra, que o pooler não permite. Gerar o SQL com `prisma migrate diff --from-empty --to-schema ... --script`, gravar em `prisma/migrations/<data>_<nome>/migration.sql` e aplicar com `migrate deploy`.
- **Seed:** `upsert` em loop contra um banco em outra região leva minutos (uma ida e volta por linha). `createMany({ skipDuplicates: true })` faz o mesmo sem sobrescrever e leva segundos.
- **npm 11 exige aprovar scripts de instalação** (`npm install-scripts approve`); sem isso o Prisma não instala os engines.
- **`@types/node@20` do scaffold conflita com o Vitest 5** (pede 22+). Subir para `@types/node@^22`.
- **`create-next-app` recusa pasta com arquivos conflitantes**: gerar numa pasta temporária e copiar com `cp -rn`.
- **Redirecionar saída para `/tmp` no Git Bash do Windows falhou em silêncio** e pulou o comando. Usar caminhos absolutos do scratchpad.
- **Arquivos `"use server"` expõem TODA função exportada como endpoint público** (chamável do navegador, sem passar pela página). Só exportar de lá ações que começam com `exigirSessao()`; helpers e consultas ficam em `queries.ts` com `import "server-only"`. (Pego na revisão da própria Fase 0: `contarNaoLidas`.)
- **Playwright roda com `NODE_ENV=test`, e o Next não carrega `.env.local` nesse modo.** Subir o servidor do teste com `NODE_ENV=production`. O carregador de TS do Playwright é CommonJS e não importa o cliente Prisma gerado (ESM): preparar dados dos testes com `pg` direto.
- **O Next também usa `role="alert"` (anunciador de rotas):** em testes, restringir o seletor ao formulário.
- **shadcn 4 (estilo `base-nova`) usa `@base-ui/react`**: gatilhos recebem a prop `render={<Button/>}` (não `asChild`), e o CLI passou a adicionar o pacote `cn` (trocamos por função local).
- **`prisma generate` não pode exigir variáveis de banco.** Ele roda no `postinstall` e no `build` (Vercel, CI) antes de qualquer variável existir. `env("DIRECT_URL")` no `prisma.config.ts` lança `PrismaConfigEnvError` se faltar (erro visto no primeiro deploy na Vercel). O `prisma.config.ts` agora só exige `DIRECT_URL` para `migrate`, `db` e `studio`, com mensagem clara. O `dotenv` carrega o `.env.local` localmente e **esconde esse erro**: para reproduzir, rode numa pasta sem `.env.local` (ex.: cópia do `prisma/` e do `prisma.config.ts` com `node_modules` ligado por junction).
- **Nunca alterar arquivos com `Get-Content`/`Set-Content` do PowerShell 5.1.** Eles leem UTF-8 como ANSI (Windows-1252) e regravam duplamente codificado: "Ações" passa a aparecer com o caractere "Ã" seguido de símbolos estranhos, sem erro de compilação ou lint (pego só ao olhar uma captura de tela). Também adicionam BOM. Usar as ferramentas Edit/Write ou `node`. O teste `tests/unit/encoding.test.ts` agora falha se isso voltar a acontecer. Recuperação: reverter byte a byte pelo mapa Windows-1252.
- **Rotas inexistentes sem sessão redirecionam ao login** (o proxy protege tudo que não é público): o aviso "Página não encontrada" só aparece para quem está logado.
- **React 19 apaga os campos do formulário depois de uma `<form action>`, mesmo quando a ação devolve erro.** Quem corrige um campo inválido perderia tudo o que digitou. Usar `onSubmit` dentro de `useTransition` (hook `useAcaoDeFormulario`). Só apareceu ao olhar as capturas de tela do E2E; nenhum teste de lógica pega isso.
- **Supabase expõe o schema `public` pela API de dados.** Tabelas criadas pelo Prisma nascem sem RLS e com privilégio total para `anon` e `authenticated`. Toda migração precisa de `ENABLE ROW LEVEL SECURITY` (o teste de integração `seguranca-banco` vigia isso). O app conecta como dono das tabelas, que ignora RLS.
- **Bloqueio por tentativas precisa ser atômico.** Ler as falhas, esperar o bcrypt e só então gravar a falha deixa N requisições simultâneas passarem. Reservar a tentativa **antes** do bcrypt, sob trava de consultoria do PostgreSQL (`pg_advisory_xact_lock`).
- **Transações interativas do Prisma têm `maxWait` de 2 s por padrão.** Com o banco em outra região (~150 ms por ida), a fila sob trava estoura esse prazo: reduzir as idas ao banco (uma consulta em vez de quatro) e definir `maxWait` e `timeout` realistas.
- **Avisos (toasts) embaixo cobrem botões de ação fixos.** No topo não atrapalham. O Playwright acusa "intercepts pointer events" nesses casos.
- **Sequências de escape (barra invertida + u) em texto passado a scripts do shell viram o caractere de verdade** (até byte nulo), e quebras de linha dentro de template literal partem strings. Montar caracteres por código (`String.fromCharCode`) e conferir o arquivo gerado. Texto longo vai melhor num arquivo escrito pela ferramenta de escrita do que num heredoc.
- **Revisão por leitura não acha tudo:** o teste de integração com o banco real achou o estouro do prazo de transação sob rajada, e a consulta ao catálogo confirmou o RLS que o revisor só suspeitava. Verificar cada achado antes de aceitar ou descartar.
- **Playwright:** o rótulo com asterisco de obrigatório ("Data *") não casa com `exact: true`; `getByText` com chaves duplas pode falhar; textos duplicados no menu escondido casam com `.first()` no celular (escopar ao conteúdo).

## Fase 1 (2026-11-12)
- **Client Component que importa `@/lib/acoes` (valor, não só tipo) leva o Prisma para o navegador** e a build quebra com "does not support external modules (node:module)". Em formulários, usar objeto literal `{ ok: false, erro }` em vez do helper `falha`.
- **Zod 4: regras no objeto (`refine`/`transform`) não rodam se um campo já falhou** (o aviso das datas só aparecia depois de corrigir o CPF). Solução: `when: () => true` no `refine`, ou validar o campo dependente à parte e juntar os erros. Também: objeto com `refine` não aceita `.extend()`; criar o objeto-base e aplicar a regra nas duas versões (criar/editar).
- **`unaccent()` não entra em índice** (é STABLE). Criar `f_unaccent` IMUTÁVEL e chamar exatamente `f_unaccent(lower(...))` nas consultas para o índice trigram ser usado.
- **Índices parciais e de expressão** (código de produto único entre não excluídos) vão em SQL manual na migração; o `prisma migrate diff` seguinte não reclama deles.
- **Prisma interativo:** transação com centenas de linhas precisa de `timeout` maior que os 5 s; para reajuste em massa um `UPDATE ... FROM unnest(...)` com conferência do valor anterior é mais rápido e atômico que um `update` por linha.
- **`useSyncExternalStore`** (com `getServerSnapshot`) lê `localStorage` sem o aviso `set-state-in-effect` do React 19 e sem divergência de hidratação.
- **Playwright:** rótulo com asterisco ("Nome *") não casa com `exact: true`; `getByLabel` também casa `aria-label` de botões e de `<form>`; campo `type=email` barra o envio no navegador (use `a@b` para testar a validação do servidor); modo `serial` pula o resto do arquivo depois da primeira falha.
- **Ler `.xlsx` no navegador** exige a entrada `read-excel-file/universal`: a versão com Web Worker esbarra na CSP (`worker-src` cai em `script-src`).
- **Heredocs longos no Bash com muitos arquivos** podem falhar no parse (`unexpected EOF`) e não criar nada: preferir a ferramenta Write por arquivo; `sed -i` com barra invertida na substituição perde as barras (usar Edit).

## Fase 2 (2026-11-13) — funil, agenda e .ics
- **`DIRECT_URL` em Session pooler** passou a funcionar (a RM Code corrigiu o `.env.local`): `prisma migrate deploy` direto. O SQL continua vindo de `prisma migrate diff --from-schema <schema anterior salvo do Git> --to-schema prisma/schema.prisma --script`; `prisma format` reescreve o alinhamento do schema inteiro (diff grande e inofensivo).
- **Servidor de teste morto no meio de uma transação** (Playwright interrompido) deixa sessão `idle in transaction` no Postgres com travas em `TentativaLogin`: o `DELETE` da limpeza dos E2E estoura "statement timeout". Se acontecer, a sessão some sozinha ou precisa ser encerrada por quem administra o banco. Nunca interromper o Playwright à força.
- **dnd-kit + Playwright:** o mouse do Playwright solta o cartão rápido demais; dar ~300 ms antes de `mouse.up()` e uns instantes depois. Origem e destino precisam estar visíveis (coordenadas fora da janela não funcionam).
- **Nome acessível de região** com `aria-labelledby` inclui o contador que está no título ("Novo contato 1 projetos"): localizar com regex `^Novo contato`.
- **Screenshot `fullPage`** de página com barra inferior `fixed` repete a barra no meio da imagem (artefato; não é defeito de layout). `waitForLoadState("networkidle")` evita capturar o esqueleto de carregamento.
- **Valores de `Prisma.groupBy` com `where` aninhado** não aceitam dois filtros diferentes na mesma relação em `_count`; contar à parte.
- **Rota pública com token:** buscar pelo **hash** (índice único) em vez de comparar o texto secreto elimina a comparação sensível a tempo; responder o mesmo 404 para malformado, inexistente, revogado e usuário inativo.
- **`.ics`:** dobrar linha em 75 **octetos** (não caracteres), escapar `\ ; ,` e quebras de linha (inclusive `\r`: impede injetar propriedades), `SEQUENCE` crescente (segundos desde 1970) para o calendário atualizar em vez de duplicar; cancelado sai como `STATUS:CANCELLED`.

## Fase 3 (2026-11-14) — propostas, fórmulas, PDF
- **Ver o PDF de verdade:** sem `pdftoppm`, abrir o arquivo num Chromium **com janela** (`playwright-core`, `headless: false`, `#toolbar=0&view=FitH`) e tirar um screenshot; o modo headless não mostra o visualizador. Foi assim que apareceu o defeito de layout (descrição invadindo desenho e valor).
- **Layout no `@react-pdf`:** texto longo só quebra linha dentro de um container com largura definida: usar `flex: 1` na coluna da descrição e `width` fixa + `flexShrink: 0` nas colunas do desenho e do valor; `alignItems: "flex-start"` na linha.
- **`toLocaleString("pt-BR", { style: "currency" })` põe espaço inseparável (U+00A0) depois de "R$"**: testes de texto precisam normalizar.
- **`Prisma.$queryRaw ... FOR UPDATE`** dentro de `$transaction` é o jeito de travar uma linha (contador de numeração, proposta, projeto). Sem trava, duas aprovações simultâneas liam o mesmo estado; com ela, uma vence e a outra recebe erro de negócio (teste de integração com 3 aprovações simultâneas).
- **Índice único cheio + exclusão lógica:** o número de revisão e o número da proposta precisam considerar as linhas excluídas, senão a próxima criação bate no índice e não há saída para o usuário.
- **Mudança de nome de coluna sem perder dados:** `ALTER TABLE ... RENAME COLUMN` escrito à mão na migração (o `migrate diff` proporia apagar e criar). Migração já aplicada nunca é editada: o ajuste vai numa migração nova.
- **`react-hooks/set-state-in-effect`** (React 19): valor derivado de outros estados deve ser calculado no render (descrição gerada, prévia visível), não copiado para estado num `useEffect`.
- **E2E consome números reais da fila de propostas:** a limpeza dos testes devolve `proximoNumeroProposta` ao que sobrou; sem isso o número de produção avançava a cada rodada.
- **`AUTH_SECRET` vazio no `.env.local`** derruba o login no E2E (`MissingSecret`): passar um segredo aleatório só no processo (`$env:AUTH_SECRET`), sem tocar no arquivo.
- **Regex em scripts gerados por heredoc/`node -e`:** as barras invertidas (`\d`, `\?`) somem; para testes, preferir classes (`[0-9]`) e a ferramenta Edit para a linha. Os arquivos do repositório estão em CRLF: scripts de edição precisam normalizar e devolver CRLF.
- **Subagente revisor** achou 4 problemas altos que os testes não pegavam (concorrência entre revisões, contador editável, índice com excluídas, descrição copiada): vale rodar sempre, com o diff e a spec, antes de fechar a fase.
