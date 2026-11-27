export type ResultadoDoEnvio = { ok: true; anexoId: string; mensagem: string } | { ok: false; erro: string };

type RespostaDeAcao<T> = { ok: true; dados?: T; mensagem?: string } | { ok: false; erro: string };

/** As duas ações do servidor do dono do desenho (item ou tipologia), chamadas só por funções de cliente. */
export type AcoesDeEnvio = {
  iniciar: (p: { mime: string; tamanhoBytes: number }) => Promise<RespostaDeAcao<{ url: string; caminho: string }>>;
  concluir: (p: { caminho: string }) => Promise<RespostaDeAcao<{ anexoId: string }>>;
};

/**
 * Envio em dois passos, igual para o item e para a tipologia: pede o link de envio, sobe o arquivo direto ao Storage e pede ao
 * servidor para validar, processar e ligar ao dono. Nunca lança: devolve o erro em português simples. `temAnterior` só ajusta a
 * mensagem ("o desenho anterior foi mantido"): em qualquer falha o dono continua como estava.
 */
export async function enviarImagemDeDesenho(acoes: AcoesDeEnvio, p: { arquivo: File; temAnterior: boolean }): Promise<ResultadoDoEnvio> {
  const manteve = p.temAnterior ? " O desenho anterior foi mantido." : "";
  try {
    const inicio = await acoes.iniciar({ mime: p.arquivo.type, tamanhoBytes: p.arquivo.size });
    if (!inicio.ok || !inicio.dados) return { ok: false, erro: inicio.ok ? "Não foi possível preparar o envio." : inicio.erro };
    // Mesmo formato que o SDK do Supabase usa para URLs assinadas de upload.
    const corpo = new FormData();
    corpo.append("cacheControl", "3600");
    corpo.append("", p.arquivo);
    const resposta = await fetch(inicio.dados.url, { method: "PUT", body: corpo, headers: { "x-upsert": "false" } });
    if (!resposta.ok) return { ok: false, erro: `O envio da imagem falhou. Confira a conexão e tente de novo.${manteve}` };
    const fim = await acoes.concluir({ caminho: inicio.dados.caminho });
    if (!fim.ok || !fim.dados) return { ok: false, erro: `${fim.ok ? "Não foi possível salvar o desenho." : fim.erro}${manteve}` };
    return { ok: true, anexoId: fim.dados.anexoId, mensagem: fim.mensagem ?? "Desenho salvo." };
  } catch {
    return { ok: false, erro: `Não foi possível enviar a imagem. Confira a conexão e tente de novo.${manteve}` };
  }
}
