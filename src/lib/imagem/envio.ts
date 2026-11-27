import "server-only";

import { randomUUID } from "node:crypto";

import { ErroNegocio } from "@/lib/acoes";
import { prisma } from "@/lib/db";
import { baixarObjeto, gravarObjeto, infoDoObjeto, removerObjeto } from "@/lib/storage";

import { processarImagemDeDesenho } from "./processar";
import { LIMITE_BYTES_IMAGEM, TIPOS_DE_IMAGEM_ACEITOS } from "./validar";

/**
 * Núcleo do envio de imagem em dois passos (original direto ao Storage; o servidor valida, processa e registra),
 * compartilhado pelo desenho do item e pelo da tipologia. Nada aqui conhece o negócio: o prefixo do caminho e o registro
 * da linha ficam com quem chama.
 */

export type ImagemGravada = {
  caminho: string;
  mime: string;
  tamanhoBytes: number;
  sha256: string;
  larguraPx: number;
  alturaPx: number;
};

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Caminho do original (passo 1): do sistema, nunca do usuário. */
export function caminhoDoOriginal(prefixo: string, id: string, extensao: string): string {
  return `${prefixo}/${id}/${randomUUID()}-original.${extensao}`;
}

/** O caminho recebido no passo 2 tem que ser exatamente um dos gerados no passo 1 para ESTE dono (prefixo + id). */
export function caminhoDoOriginalEhValido(prefixo: string, id: string, caminho: string): boolean {
  return new RegExp(`^${escapar(prefixo)}/${escapar(id)}/[0-9a-f-]{36}-original\\.(png|jpg)$`).test(caminho);
}

const MENSAGEM_LIMITE = `A imagem passa de ${LIMITE_BYTES_IMAGEM / 1024 / 1024} MB. Reduza o desenho e tente de novo.`;

/**
 * Passo 2: confere o original no Storage, processa no servidor (tipo pelos bytes, sRGB, redução, sem metadados), grava a
 * versão final e chama `registrar` (que cria o `Anexo` e liga ao dono, numa transação). O original nunca é referenciado;
 * a versão final só é apagada se NÃO chegou a ser registrada. Em dúvida (conexão caída depois do COMMIT), deixa o órfão.
 */
export async function concluirEnvioDeImagem<T>(e: {
  prefixo: string;
  id: string;
  caminhoOriginal: string;
  /** Recusa cedo (dono existe, em estado de receber imagem); a conferência que manda é a de dentro de `registrar`. */
  conferirDono: () => Promise<void>;
  registrar: (imagem: ImagemGravada) => Promise<T>;
}): Promise<T> {
  let caminhoFinal: string | null = null;
  let gravado = false;
  try {
    await e.conferirDono();

    const info = await infoDoObjeto(e.caminhoOriginal);
    if (!info) throw new ErroNegocio("O envio da imagem não foi concluído. Tente de novo.");
    if (info.tamanhoBytes <= 0 || info.tamanhoBytes > LIMITE_BYTES_IMAGEM) throw new ErroNegocio(MENSAGEM_LIMITE);
    if (!TIPOS_DE_IMAGEM_ACEITOS[info.mime]) throw new ErroNegocio("Só aceitamos imagens PNG ou JPG.");

    const original = await baixarObjeto(e.caminhoOriginal);
    if (original.length > LIMITE_BYTES_IMAGEM) throw new ErroNegocio(MENSAGEM_LIMITE);
    const imagem = await processarImagemDeDesenho(original);

    caminhoFinal = `${e.prefixo}/${e.id}/${randomUUID()}.${imagem.formato}`;
    await gravarObjeto(caminhoFinal, imagem.bytes, imagem.mime);
    gravado = true;

    const resultado = await e.registrar({ caminho: caminhoFinal, mime: imagem.mime, tamanhoBytes: imagem.bytes.length, sha256: imagem.sha256, larguraPx: imagem.larguraPx, alturaPx: imagem.alturaPx });
    gravado = false; // a partir daqui o arquivo final é referenciado: nunca apagar
    return resultado;
  } finally {
    await removerObjeto(e.caminhoOriginal).catch(() => undefined);
    if (gravado && caminhoFinal) {
      const registrado = await prisma.anexo.count({ where: { caminho: caminhoFinal } }).catch(() => 1);
      if (registrado === 0) await removerObjeto(caminhoFinal).catch(() => undefined);
    }
  }
}
