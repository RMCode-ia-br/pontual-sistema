/**
 * Gerador de iCalendar (RFC 5545) para exportar e assinar a agenda. Bloco genérico, sem conhecimento do
 * negócio. Instantes sempre em UTC (`...Z`, sem VTIMEZONE), linhas terminadas em CRLF, texto escapado e
 * linhas longas dobradas em 75 octetos sem partir caracteres multibyte.
 */

export type EventoIcs = {
  /** Estável entre exportações (senão o calendário duplica o evento). */
  uid: string;
  inicio: Date;
  fim: Date;
  titulo: string;
  descricao?: string | null;
  local?: string | null;
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  /** Incrementar a cada alteração faz o calendário atualizar o evento já importado. */
  sequencia?: number;
  atualizadoEm?: Date;
  /** Minutos de antecedência do alarme (ex.: 1440 = 24 h). */
  alarmeMin?: number | null;
};

export type CalendarioIcs = {
  /** Identifica o produto (ex.: "-//Pontual Gestão//Agenda//PT"). */
  idProduto: string;
  nome: string;
  eventos: EventoIcs[];
  /** Instante de geração (DTSTAMP); padrão: agora. */
  geradoEm?: Date;
};

/** Escapa texto de propriedade: `\`, `;`, `,` e quebras de linha (RFC 5545, 3.3.11). */
export function escaparTextoIcs(texto: string): string {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Instante → `20261113T123000Z`. */
export function dataHoraIcs(instante: Date): string {
  if (Number.isNaN(instante.getTime())) throw new RangeError("Data inválida para o iCalendar.");
  return instante.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

const encoder = new TextEncoder();

/** Dobra a linha em no máximo 75 octetos (UTF-8); as continuações começam com um espaço. */
export function dobrarLinhaIcs(linha: string): string[] {
  if (encoder.encode(linha).length <= 75) return [linha];
  const partes: string[] = [];
  let atual = "";
  let bytes = 0;
  // Primeira linha: 75 octetos; continuações: 74 + o espaço inicial.
  let limite = 75;
  for (const caractere of linha) {
    const tamanho = encoder.encode(caractere).length;
    if (bytes + tamanho > limite) {
      partes.push(atual);
      atual = "";
      bytes = 0;
      limite = 74;
    }
    atual += caractere;
    bytes += tamanho;
  }
  if (atual) partes.push(atual);
  return partes.map((p, i) => (i === 0 ? p : ` ${p}`));
}

function adicionar(linhas: string[], linha: string) {
  linhas.push(...dobrarLinhaIcs(linha));
}

/** Texto sem caracteres de controle (um `\u0000` ou `\u0007` no meio quebraria o arquivo). */
function limpar(texto: string): string {
  return texto.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export function gerarCalendarioIcs(calendario: CalendarioIcs): string {
  const geradoEm = calendario.geradoEm ?? new Date();
  const linhas: string[] = [];
  adicionar(linhas, "BEGIN:VCALENDAR");
  adicionar(linhas, "VERSION:2.0");
  adicionar(linhas, `PRODID:${escaparTextoIcs(limpar(calendario.idProduto))}`);
  adicionar(linhas, "CALSCALE:GREGORIAN");
  adicionar(linhas, "METHOD:PUBLISH");
  adicionar(linhas, `X-WR-CALNAME:${escaparTextoIcs(limpar(calendario.nome))}`);
  adicionar(linhas, "X-WR-TIMEZONE:America/Sao_Paulo");

  for (const e of calendario.eventos) {
    if (e.fim.getTime() <= e.inicio.getTime()) continue; // evento inválido: nunca gera arquivo quebrado
    adicionar(linhas, "BEGIN:VEVENT");
    adicionar(linhas, `UID:${escaparTextoIcs(limpar(e.uid))}`);
    adicionar(linhas, `DTSTAMP:${dataHoraIcs(e.atualizadoEm ?? geradoEm)}`);
    adicionar(linhas, `DTSTART:${dataHoraIcs(e.inicio)}`);
    adicionar(linhas, `DTEND:${dataHoraIcs(e.fim)}`);
    adicionar(linhas, `SUMMARY:${escaparTextoIcs(limpar(e.titulo))}`);
    if (e.descricao) adicionar(linhas, `DESCRIPTION:${escaparTextoIcs(limpar(e.descricao))}`);
    if (e.local) adicionar(linhas, `LOCATION:${escaparTextoIcs(limpar(e.local))}`);
    adicionar(linhas, `STATUS:${e.status ?? "CONFIRMED"}`);
    adicionar(linhas, `SEQUENCE:${Math.max(0, Math.trunc(e.sequencia ?? 0))}`);
    if (e.alarmeMin && e.alarmeMin > 0) {
      adicionar(linhas, "BEGIN:VALARM");
      adicionar(linhas, "ACTION:DISPLAY");
      adicionar(linhas, `DESCRIPTION:${escaparTextoIcs(limpar(e.titulo))}`);
      adicionar(linhas, `TRIGGER:-PT${Math.trunc(e.alarmeMin)}M`);
      adicionar(linhas, "END:VALARM");
    }
    adicionar(linhas, "END:VEVENT");
  }

  adicionar(linhas, "END:VCALENDAR");
  return `${linhas.join("\r\n")}\r\n`;
}
