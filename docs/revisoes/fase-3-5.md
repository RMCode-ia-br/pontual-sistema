# Revisão sênior — Fase 3.5 (Identidade visual)

Tarefa extra entre as Fases 3 e 4, fora da especificação (decisão 85). Não iniciou a Fase 4. Sem mudança de schema nem de migração.

## O que foi entregue

| Bloco | Commit | Conteúdo |
| --- | --- | --- |
| B0 | `0976b68` | Decisão 85; spec de capturas antes/depois (`tests/e2e/identidade.spec.ts`) |
| B1 | `5ec0693` | `npm run identidade:extrair` (Playwright lê tokens e estilos do site) |
| B2 | `a81f653` | Tokens do site no `globals.css`; `src/lib/tema` (cor da marca → tema claro e escuro com contraste AA) |
| B3 | `7222323` | `EstiloDaMarca` no layout raiz, campo de cor com prévia, seed com a cor padrão sem sobrescrever o gestor |
| B4 | `62c81e0` | Logo circular, favicon (só símbolo), apple-icon, PWA e maskable (`npm run icones`); logo padrão pela seed |
| B5 | `d62ee80` | Shell, login e cartões com a identidade do site |
| B6 | `ab564a7` | PDFs em Geist, neutros do site, logo na folha de produção, formato da logo pelos bytes |
| B7 | `8d6c00a` | Correções da revisão sênior e documentação |

Valores medidos no site: `docs/IDENTIDADE_VISUAL.extraido.md`. Regras de derivação, contrastes e o que é derivado: `docs/IDENTIDADE_VISUAL.md`. Decisões 85 a 91.

## Como foi revisado

1. **Subagente revisor com contexto limpo:** recebeu só o escopo pedido e o diff (`git diff 252a4df`), sem o histórico. Rodou typecheck, lint, Vitest e varreu numericamente `derivarTemaDaMarca` (5.832 cores em grade e 150.000 aleatórias). Cada achado foi conferido por mim antes de corrigir.
2. **Execução, não suposição:** typecheck, lint, testes unitários, build, E2E completo, capturas antes/depois em desktop e celular (390 px), claro e escuro, e PDFs rasterizados e vistos (pdf.js dentro do Playwright).

## Achados da revisão

Nenhum Crítico nem Alto.

| Sev. | Achado | Resolução |
| --- | --- | --- |
| Médio | M1: no escuro, a cor da marca sobre `bg-accent` ficava um pouco abaixo de 4,5:1 em ~45% das cores | **Corrigido.** O accent do escuro entrou na garantia (azul escuro do site passou de `#3c8ee2` para `#3f90e5`) |
| Médio | M2: texto sobre o hover `primary/80` do botão abaixo de 4,5:1 em várias cores | **Corrigido de outro jeito que o sugerido.** Exigir 4,5 no `primary/80` rebaixava o próprio azul do site (`#0064b5` → `#0058a0`). Criei o token `--primary-hover` (mais escuro no claro, mais claro no escuro: o contraste só aumenta) e botão e selo o usam |
| Médio | M3: layout raiz depende do banco sem teto de espera | **Corrigido.** `obterCorDaMarca` tem teto de 3 s e cai no padrão; ela não chama o Storage. O timeout de conexão do `PrismaPg` continua em PENDENCIAS (já existia no login) |
| Baixo | B1: prévia aceitava `#rgb` que o servidor recusa | Corrigido (mesma regex do servidor) |
| Baixo | B2: cor neutra gerava accent com matiz aleatório | Corrigido (croma 0) e testado |
| Baixo | B3: `aria-label` em `div` sem papel | Corrigido (`role="group"`) |
| Baixo | B4/B5: literal da cor padrão duplicado; `COR_PDF` sem teste | Corrigidos; teste compara `COR_PDF` com o `globals.css` |
| Baixo | B6–B9: manifesto sem cache; paginação do PDF antigo; originais em `public/`; seed e "remover logo" | **Não corrigidos**, em PENDENCIAS com o motivo |
| Baixo | B10: itens sem commit | Corrigido (commit `8d6c00a`) |

## Verificação final

- `npx tsc --noEmit`, `npm run lint`: limpos.
- Testes unitários: **39 arquivos, 667 testes passando.** Novos: `tema` (derivação, 20 cores difíceis, neutras, varredura de 729 cores, contrato com o `globals.css`), `icones`, `pdf-identidade`. Conferi por mutação que os testes de contraste falham quando o ajuste é desligado (27 falhas).
- `npm run build`: compila.
- **E2E completo** (desktop e celular, antes das correções da revisão): **369 passaram, 0 falharam, 15 ignorados.** Depois das correções, rodei de novo `area-logada`, `configuracoes`, `propostas`, `autenticacao` e `identidade`: 120 passaram e 1 falhou (veja abaixo).
- Manifesto, `/icon.png`, `/apple-icon.png` e `/favicon.ico` servidos sem login (E2E `area-logada`).

### Falha intermitente: "sair encerra a sessão"

O teste `autenticacao > sair encerra a sessão` falhou em uma de duas rodadas do arquivo no código final (o logout chega ao `/login`, mas o `goto("/")` seguinte ainda mostra o painel). **Não é da Fase 3.5:** rodei o mesmo arquivo três vezes no commit anterior à fase (`252a4df`, em um worktree separado) e ele também falhou uma vez (no celular). Suspeita, não confirmada: uma requisição em andamento (por exemplo a atualização do sino de notificações) devolve o cookie de sessão renovado depois do logout. Registrado em PENDENCIAS para investigar fora desta fase.

## Capturas antes/depois

Em `.capturas/identidade/{antes,depois}/` (fora do Git: têm dados do banco e imagens do site), 32 imagens cada: login, painel, funil, clientes, propostas, Configurações > Empresa, tipologias e menu "Mais" no celular; claro e escuro; desktop e celular; mais o site de referência.

- O "antes" foi refeito a partir do commit `252a4df` num worktree (as capturas originais se perderam: o Playwright apaga `test-results/` a cada rodada, e agora elas ficam em `.capturas/`). Como a logo já está no banco, o "antes" mostra a logo nova dentro do shell antigo; o resto (tokens, azul, bordas, raio, títulos) é o visual anterior.
- Diferenças vistas: azul real do site (`#0064b5`) no lugar do azul saturado anterior, logo redonda e maior no login e no menu, fundo de acento no login (azulado também no escuro), cartões com borda, títulos mais firmes e escuro coerente com o claro.
- **Limitação:** o banco de desenvolvimento está sem dados, então as telas de detalhe (cliente e editor de proposta) não entraram na comparação.
- **PDFs:** proposta e folha de produção conferidas rasterizadas: Geist, acentos (Ç, Í, Ê, ×, —), logo, azul da marca e neutros do site.

## O que não foi testado

- **Deploy na Vercel:** se os TTF do Geist entram no pacote das rotas de PDF (`outputFileTracingIncludes`) foi conferido só por simulação e build local.
- **Cor da marca diferente do azul** em tela (só o azul do site foi visto; as outras estão cobertas por teste numérico).
- **Favicon em navegador real** em 32×32: conferido na imagem gerada e ampliada, não numa aba.
- Telas de detalhe (cliente e editor de proposta) sem dados.

## Pendências geradas

Em `docs/PENDENCIAS.md`, seções "Surgidas na Fase 3.5" e "Da revisão sênior da Fase 3.5": logo em vetor e modernizada (a atual é um JPEG de 713 px e o texto não se lê em 36 px), validar o escuro derivado com o dono, conferir as fontes dos PDFs no primeiro deploy, capturas de detalhe com dados, cache da URL da logo, manifesto sem cache, paginação de PDFs antigos, timeout de conexão do banco, e a intermitência do logout.
