# Identidade visual (Fase 3.5)

Tarefa extra entre as Fases 3 e 4 (decisão 85). O sistema usa a identidade do site da empresa (https://pontual-mu.vercel.app) e a logo da Pontual. Nada da empresa fica fixo no código: a **cor** e a **logo** vêm de Configurações > Empresa; o código só guarda tokens genéricos de design.

Os valores medidos no site estão em [IDENTIDADE_VISUAL.extraido.md](IDENTIDADE_VISUAL.extraido.md), gerado por `npm run identidade:extrair` (Playwright; só estilos, sem fotos nem textos do site).

## O que veio do site e o que é derivado

| Item | Origem |
| --- | --- |
| Tema claro: neutros, raio (`0.5rem`), bordas, charts neutros | **Extraído** do site (`:root`) |
| Fontes: Geist (texto e títulos) e Geist Mono (rótulos) | **Extraído** (o app já usa as duas via `next/font`) |
| Títulos: peso 600 e espaçamento `-0.025em` | **Extraído** (`globals.css`, camada base) |
| Botão `rounded-lg`, peso 500; cartão `rounded-xl` com borda e sem sombra | **Extraído** |
| Tema escuro | **Derivado**: o site só tem tema claro. Neutros no mesmo matiz azulado (252°) do `#121921` do site |
| Cor da marca (primary, ring, accent, chart-1/2, sidebar-primary) | **Configurações** (`corPrimaria`), derivada por `src/lib/tema` |

## Como a cor da marca vira tema

`derivarTemaDaMarca(hex)` (`src/lib/tema/derivar.ts`) recebe o hex de `ConfiguracaoEmpresa.corPrimaria` e devolve os tokens dos dois modos. As relações abaixo foram **medidas no site** (azul `#0064b5` = OKLCH L 0,50 / C 0,15 / H 252) e reproduzem os valores dele exatamente para esse azul (há teste):

- `accent` = L 0,95 e C × 0,13; `accent-foreground` = L − 0,12 e C × 0,77 (escurecido até contraste ≥ 7);
- `chart-2` = L + 0,15, C × 0,67 e matiz − 7°;
- `ring`, `chart-1` e `sidebar-primary` = a própria cor da marca.

O CSS é injetado no `<head>` por `EstiloDaMarca` como `:root:root{…}` (claro) e `:root:root.dark{…}` (escuro), que vencem o `globals.css` por especificidade. O `globals.css` traz como padrão exatamente o que a função gera para o azul do site, então a tela aparece certa mesmo sem cor configurada.

## Contraste WCAG AA (seção 11 da especificação)

Regras garantidas por código e por testes, para **qualquer** cor digitada:

1. Texto sobre a cor da marca (botão primário): ≥ 4,5:1.
2. A cor da marca como texto ou ícone sobre as superfícies (fundo, cartão, secundária, suave e a tinta `bg-primary/10` usada no menu ativo): ≥ 4,5:1.
3. `accent-foreground` sobre `accent`: ≥ 4,5:1 (alvo 7:1). Gráficos: ≥ 3:1 sobre o fundo.

Quando a cor não passa, mantém-se matiz e croma e ajusta-se só a luminosidade; a cor que já passa fica **idêntica** à digitada. Configurações mostra o aviso "ajustada" quando isso acontece.

Para o azul do site (`#0064b5`):

| Par | Claro | Escuro |
| --- | --- | --- |
| Marca original sobre o fundo | 6,02 (passa) | **3,20 (reprova)** |
| Primária usada sobre o fundo | 6,02 (`#0064b5`) | 5,64 (`#3c8ee2`, **variante derivada**) |
| Texto sobre a primária | 5,86 (`#fcfcfc`) | 5,76 (`#060c13`) |
| Primária sobre secundária / suave | 5,45 / 5,03 | 5,24 (cartão) / 4,54 (suave) |
| `accent-foreground` sobre `accent` | 8,67 | 10,59 |
| `chart-2` sobre o fundo | 3,21 | 3,47 |

**Por que a variante clara no escuro:** `#0064b5` sobre o fundo escuro dá 3,20:1, abaixo do mínimo de 4,5:1 para texto. No tema escuro a função clareia o azul (mesmo matiz e croma) até passar; é o que acontece com as cores escuras em geral. Cores claras (amarelo, ciano) passam no escuro e, no claro, são escurecidas.

## Superfícies (neutros) e a regra de sincronia

Os neutros não dependem da marca e ficam em `globals.css`. As superfícies usadas no cálculo de contraste estão duplicadas em `SUPERFICIES` (`src/lib/tema/derivar.ts`); `tests/unit/tema.test.ts` falha se os dois divergirem e confere o contraste de toda a paleta neutra.

| Superfície | Claro | Escuro |
| --- | --- | --- |
| Fundo | `#ffffff` | `#0a0f14` |
| Cartão | `#ffffff` | `#12181e` |
| Secundária / suave | `#f1f4f7` / `#e8ebef` | `#1f252b` |
| Texto | `#121921` | `#f1f4f7` |
| Texto secundário | `#5e646c` | `#9ea5ae` |
| Destrutivo | `#e40014` | `#fb575d` |

O escuro é uma **proposta derivada** (o site não tem escuro); fica em PENDENCIAS para validação do dono.
