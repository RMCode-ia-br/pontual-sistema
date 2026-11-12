/**
 * Garantia e assistência (R12). Funções puras sobre datas de calendário "aaaa-mm-dd".
 * Garantia de REGULAGEM: `garantiaDias` (padrão 90) contados da conclusão da instalação (etapa-marco do modelo).
 * Garantia dos VIDROS: só até a instalação. A classificação é uma SUGESTÃO; o gestor pode sobrescrever.
 */
import { somarDias } from "./calendario";

export type TipoDeProblema = "REGULAGEM" | "VIDRO" | "OUTRO";
export type Classificacao = "EM_GARANTIA" | "FORA_DA_GARANTIA";

export const ROTULO_CLASSIFICACAO: Record<Classificacao, string> = {
  EM_GARANTIA: "Em garantia",
  FORA_DA_GARANTIA: "Fora da garantia",
};

export type EntradaDeClassificacao = {
  tipoProblema: TipoDeProblema;
  /** Há obra vinculada ao chamado? */
  temObra: boolean;
  /** Data em que a etapa-marco (instalação) foi concluída; `null` se ainda não foi. */
  marcoConcluidoEm: string | null;
  /** Data de abertura do chamado. */
  abertoEm: string;
  garantiaDias: number;
};

export type ResultadoDaClassificacao = {
  classificacao: Classificacao;
  /** Sugestão: cobra a visita quando está fora da garantia. */
  cobrarVisita: boolean;
  /** Último dia da garantia de regulagem (vazio se não dá para calcular). */
  garantiaAte: string | null;
  /** Explicação para mostrar ao gestor. */
  motivo: string;
};

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export function classificarChamado(e: EntradaDeClassificacao): ResultadoDaClassificacao {
  const fora = (motivo: string, garantiaAte: string | null = null): ResultadoDaClassificacao => ({
    classificacao: "FORA_DA_GARANTIA",
    cobrarVisita: true,
    garantiaAte,
    motivo,
  });
  const dentro = (motivo: string, garantiaAte: string | null): ResultadoDaClassificacao => ({
    classificacao: "EM_GARANTIA",
    cobrarVisita: false,
    garantiaAte,
    motivo,
  });

  if (!e.temObra) return fora("Sem obra vinculada: não dá para conferir a garantia. Confirme e ajuste se for o caso.");
  if (!e.marcoConcluidoEm) return fora("A instalação ainda não foi concluída; a garantia começa na conclusão. Confirme e ajuste se for o caso.");

  const garantiaAte = somarDias(e.marcoConcluidoEm, e.garantiaDias);

  if (e.tipoProblema === "VIDRO") {
    return e.abertoEm <= e.marcoConcluidoEm
      ? dentro(`Vidro avisado até a instalação (concluída em ${br(e.marcoConcluidoEm)}).`, garantiaAte)
      : fora(`A garantia dos vidros vale só até a instalação (concluída em ${br(e.marcoConcluidoEm)}).`, garantiaAte);
  }

  const janela = `instalação concluída em ${br(e.marcoConcluidoEm)}; regulagem até ${br(garantiaAte)}`;
  return e.abertoEm <= garantiaAte
    ? dentro(`Dentro da garantia de regulagem (${janela}).`, garantiaAte)
    : fora(`Passou da garantia de regulagem (${janela}).`, garantiaAte);
}
