import { concluirUploadDesenho, iniciarUploadDesenho } from "../actions/desenho";

export type ResultadoDoEnvio = { ok: true; anexoId: string; mensagem: string } | { ok: false; erro: string };

/**
 * Envia a imagem do desenho de um item que JÁ existe: pede o link de envio, sobe o arquivo direto ao Storage e pede ao
 * servidor para validar, processar e ligar ao item. Nunca lança: devolve o erro em português simples. `temAnterior` só
 * ajusta a mensagem ("o desenho anterior foi mantido"): em qualquer falha o item continua como estava.
 */
export async function enviarDesenhoDoItem(p: { propostaId: string; itemId: string; arquivo: File; temAnterior: boolean }): Promise<ResultadoDoEnvio> {
  const manteve = p.temAnterior ? " O desenho anterior foi mantido." : "";
  try {
    const inicio = await iniciarUploadDesenho({ propostaId: p.propostaId, itemId: p.itemId, mime: p.arquivo.type, tamanhoBytes: p.arquivo.size });
    if (!inicio.ok || !inicio.dados) return { ok: false, erro: inicio.ok ? "Não foi possível preparar o envio." : inicio.erro };
    // Mesmo formato que o SDK do Supabase usa para URLs assinadas de upload.
    const corpo = new FormData();
    corpo.append("cacheControl", "3600");
    corpo.append("", p.arquivo);
    const resposta = await fetch(inicio.dados.url, { method: "PUT", body: corpo, headers: { "x-upsert": "false" } });
    if (!resposta.ok) return { ok: false, erro: `O envio da imagem falhou. Confira a conexão e tente de novo.${manteve}` };
    const fim = await concluirUploadDesenho({ propostaId: p.propostaId, itemId: p.itemId, caminho: inicio.dados.caminho });
    if (!fim.ok || !fim.dados) return { ok: false, erro: `${fim.ok ? "Não foi possível salvar o desenho." : fim.erro}${manteve}` };
    return { ok: true, anexoId: fim.dados.anexoId, mensagem: fim.mensagem ?? "Desenho personalizado salvo." };
  } catch {
    return { ok: false, erro: `Não foi possível enviar a imagem. Confira a conexão e tente de novo.${manteve}` };
  }
}
