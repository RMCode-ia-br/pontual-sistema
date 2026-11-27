# Fase 3.6b-1 — Desenho personalizado no item da proposta

Pedido do Marcelo (faz os desenhos no Word). O usuário cola (Ctrl+V), arrasta ou escolhe um PNG/JPG no item; a imagem substitui o desenho automático no PDF da proposta e na folha de produção. Sem imagem, tudo é como antes. Blocos 0 a 5 entregues, cada um com commit e push. Decisões 152–164 em `docs/DECISOES.md`.

## O que foi entregue
- **Armazenamento:** a imagem é um `Anexo` (`categoria "desenho-item"`, bucket privado, URL assinada, upload direto do navegador); o item aponta por `ItemProposta.desenhoAnexoId`. Colunas novas e opcionais no `Anexo`: `sha256`, `larguraPx`, `alturaPx`.
- **Upload em dois passos** (`iniciarUploadDesenho` / `concluirUploadDesenho`): tipo pelos bytes (PNG/JPG), 8 MB, 10.000 px por lado, 40 MP, sem APNG; `sharp` aplica EXIF, converte para sRGB, reduz a 1600 px, põe fundo branco, tira metadados, calcula o SHA-256 e grava o final; o original é apagado. Conclusão dentro da transação com `exigirRascunho` (lock da linha).
- **Snapshot (R4):** `ItemConteudo.desenhoImagem` e `tamanhoDesenho: "GRANDE"` só existem quando há imagem, então snapshots e PDFs sem imagem não mudam. O PDF da proposta enviada lê só o snapshot.
- **Falha segura:** imagem que não carrega ou com hash errado dá `ErroDesenhoIndisponivel` e resposta 503 com mensagem legível; nunca cai no desenho automático.
- **Tamanho Normal/Grande por item** em `desenhoConfig` (sem migração). Constantes únicas `CAIXAS_DA_IMAGEM` em `src/modules/propostas/pdf/imagens.ts` (valores provisórios; nenhum teste os fixa).
- **Item novo** aceita a imagem antes de salvar (envio automático ao salvar; falha nunca perde o item).
- **Assinatura** "Att, consultor" dentro do último bloco dos termos, nunca sozinha na página.
- **Comparação de revisões:** motivos "Desenho personalizado adicionado/trocado/removido" e "Tamanho do desenho alterado".
- **Health:** campo `sharp` em `/api/health`.
- Migração `20261125000000_desenho_item` (aplicada com OK do dono).

## Suíte completa (26/11/2026)
| Camada | Base 3.6a | Agora |
|---|---|---|
| Unitários | 1.470 | **1.571 / 1.571** |
| Integração | 526 | **556 / 556** |
| E2E | 673 | **673 passaram na 1ª rodada, 19 ignorados** (os mesmos da base) |

Na 1ª rodada do E2E houve 9 falhas e 39 "não rodaram" (efeito das falhas em `describe` serial), todas em 9 arquivos sem relação com o desenho (importação, estoque, financeiro, formas de pagamento): oito eram estouro do limite de 30 s, em geral no projeto celular, e uma foi o alerta da importação não achado em 5 s. A reexecução desses arquivos (desktop e celular) passou com **104/104**. A causa da lentidão da 1ª rodada não foi identificada. Antes disso, os testes unitários estouravam 5 s sob carga (argon2 e PDF); `testTimeout` passou a 30 s em `vitest.config.mts`.

## Prova "sem imagem o PDF é igual ao anterior"
Contra o "antes" gerado no commit `9accfc9` (26 PDFs: 6 de fixture e 7 propostas reais, proposta e folha de produção): texto idêntico nos 26; 25 idênticos pixel a pixel.

**Diferenças de 8 a 14 pixels são ruído de renderização, não regressão:** o 26º PDF difere em 14 px sempre nos mesmos pontos de linhas finas (ex.: `372,862,466,864`), e o próprio "antes" gerado duas vezes já diferia nesses pontos.

## Revisão sênior (subagente de contexto limpo, somente leitura)
Sem achado grave: sem path traversal, sem IDOR entre itens/propostas, tipo sempre pelos bytes, toda mutação com sessão + Zod + auditoria, snapshot enviado intacto. Achados e destino:
1. **Corrigido:** o `finally` podia apagar o arquivo final já referenciado se a confirmação do COMMIT se perdesse; agora confere no banco se existe `Anexo` com o caminho e, em dúvida, deixa o arquivo órfão.
2. **Corrigido:** `maxDuration = 60` nas duas rotas de PDF.
3. **PENDENCIAS:** tamanho do original só checado antes do download (conferir `fileSizeLimit` do bucket), limpeza de originais órfãos, prazo total e limite por imagem no PDF, `ErroNegocio` de snapshot incompleto sem tratamento na rota, tamanho Grande lembrado depois de remover a imagem, semáforo de memória no processamento.

## Lista da 7C
Quem sobe, troca e remove a imagem do item (hoje `can(…, "editar", "proposta")`, libera tudo); quem muda o tamanho Normal/Grande.

## Fica para depois
- **3.6b-2:** editor de desenho (desenhar dentro do sistema, em vez de colar imagem).
- **3.6b-3:** desenho na tipologia e "salvar desenho da proposta como nova tipologia" (ponto de extensão já em `resolverDesenhoDoItem`).

## Em aberto
Página 1 vazia no caso limite de 3 itens com imagem 4:3 no tamanho Normal (anterior ao recurso, idêntica no commit anterior); texto pequeno dentro da imagem fica ilegível mesmo em Grande; Ctrl+C direto do Word real não testado; peso com muitas fotos (variante de 800 px não implementada: 20 itens PNG de traço ~110 KB e JPG ~170 KB saem leves, mas imagens com ruído chegaram a ~17,8 MB).

## Auditoria de `Anexo`
Nenhuma listagem de anexos mostra o desenho do item; `excluirAnexo` recusa a categoria `desenho-item`; `ItemProposta` não está em `ENTIDADES_COM_ANEXO`.

## SQL de volta da migração
```sql
ALTER TABLE "ItemProposta" DROP CONSTRAINT "ItemProposta_desenhoAnexoId_fkey";
DROP INDEX "ItemProposta_desenhoAnexoId_idx";
ALTER TABLE "ItemProposta" DROP COLUMN "desenhoAnexoId";
ALTER TABLE "Anexo" DROP CONSTRAINT "Anexo_dimensoes_positivas";
ALTER TABLE "Anexo" DROP COLUMN "sha256", DROP COLUMN "larguraPx", DROP COLUMN "alturaPx";
```
