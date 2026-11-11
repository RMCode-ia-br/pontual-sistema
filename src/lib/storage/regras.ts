/**
 * Regras de upload (puras, sem dependências do servidor), usadas no servidor e no navegador.
 * Imagens são comprimidas no navegador antes do envio (lado maior ~1600 px).
 */
export const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB

export const TIPOS_PERMITIDOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/xml": "xml",
  "text/xml": "xml",
};

export type ResultadoValidacaoArquivo = { valido: true; extensao: string } | { valido: false; motivo: string };

export function validarArquivo(mime: string, tamanhoBytes: number): ResultadoValidacaoArquivo {
  const extensao = TIPOS_PERMITIDOS[mime];
  if (!extensao) return { valido: false, motivo: "Tipo de arquivo não permitido. Envie imagem, PDF, texto, CSV ou XML." };
  if (!Number.isFinite(tamanhoBytes) || tamanhoBytes <= 0) return { valido: false, motivo: "Arquivo vazio." };
  if (tamanhoBytes > TAMANHO_MAXIMO_BYTES) {
    return { valido: false, motivo: `O arquivo passa de ${TAMANHO_MAXIMO_BYTES / 1024 / 1024} MB.` };
  }
  return { valido: true, extensao };
}

/** Nome seguro para exibição/arquivo: sem caminhos, sem caracteres de controle. */
export function sanitizarNomeArquivo(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? "arquivo";
  const limpo = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim();
  return (limpo || "arquivo").slice(0, 120);
}

/** Entidades que podem receber anexos nesta fase (cresce a cada fase). */
export const ENTIDADES_COM_ANEXO = ["ConfiguracaoEmpresa", "Tarefa"] as const;
export type EntidadeComAnexo = (typeof ENTIDADES_COM_ANEXO)[number];
