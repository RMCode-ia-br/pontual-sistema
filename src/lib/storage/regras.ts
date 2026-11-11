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
  // O Chrome no Windows com Excel instalado declara .csv assim.
  "application/vnd.ms-excel": "csv",
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

function ascii(bytes: Uint8Array, inicio: number, fim: number): string {
  return String.fromCharCode(...Array.from(bytes.slice(inicio, fim)));
}

const ASSINATURAS: Record<string, (b: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v),
  "image/webp": (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
  "application/pdf": (b) => ascii(b, 0, 5) === "%PDF-",
};

const TIPOS_DE_TEXTO = new Set(["text/plain", "text/csv", "application/vnd.ms-excel", "application/xml", "text/xml"]);

/**
 * Confere os primeiros bytes do arquivo com o tipo declarado. O tipo vem do navegador e pode mentir:
 * um executável enviado como "image/png" falha aqui. Arquivos de texto não podem ter bytes nulos.
 */
export function assinaturaConfere(mime: string, inicio: Uint8Array): boolean {
  if (inicio.length === 0) return false;
  const regra = ASSINATURAS[mime];
  if (regra) return regra(inicio);
  if (TIPOS_DE_TEXTO.has(mime)) return !inicio.includes(0);
  return false;
}

/** Nome seguro para exibição/arquivo: sem caminhos, sem caracteres de controle. */
export function sanitizarNomeArquivo(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? "arquivo";
  const limpo = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim();
  return (limpo || "arquivo").slice(0, 120);
}

/** Entidades que podem receber anexos nesta fase (cresce a cada fase). */
export const ENTIDADES_COM_ANEXO = ["ConfiguracaoEmpresa", "Tarefa", "Cliente", "Fornecedor", "Produto", "Funcionario", "Projeto", "EventoAgenda", "MedidaRascunho"] as const;
export type EntidadeComAnexo = (typeof ENTIDADES_COM_ANEXO)[number];
