import { enviarImagemDeDesenho, type ResultadoDoEnvio } from "@/components/desenho/envio-cliente";

import { concluirUploadDesenho, iniciarUploadDesenho } from "../actions/desenho";

export type { ResultadoDoEnvio };

/** Envia a imagem do desenho de um item que JÁ existe (mesmo envio da tipologia, com as ações do item). */
export async function enviarDesenhoDoItem(p: { propostaId: string; itemId: string; arquivo: File; temAnterior: boolean }): Promise<ResultadoDoEnvio> {
  return enviarImagemDeDesenho(
    {
      iniciar: (e) => iniciarUploadDesenho({ propostaId: p.propostaId, itemId: p.itemId, ...e }),
      concluir: (e) => concluirUploadDesenho({ propostaId: p.propostaId, itemId: p.itemId, ...e }),
    },
    { arquivo: p.arquivo, temAnterior: p.temAnterior },
  );
}
