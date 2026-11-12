import path from "node:path";

import { Font } from "@react-pdf/renderer";

/**
 * Fontes dos PDFs (bloco genérico, sem conhecimento do negócio): Geist, a mesma família da interface.
 * Os arquivos TTF ficam em `src/lib/pdf/fontes/` (licença SIL OFL 1.1 em `OFL-Geist.txt`) e entram no pacote
 * das rotas de PDF por `outputFileTracingIncludes` (next.config.ts), senão sumiriam no deploy serverless.
 * O PDF só embute as fontes em ordem de peso: 400 texto, 500 médio, 600 negrito (títulos) e 700 extra.
 */
export const FAMILIA_PDF = "Geist";

let registrado = false;

export function registrarFontesDoPdf(): void {
  if (registrado) return;
  const pasta = path.join(process.cwd(), "src", "lib", "pdf", "fontes");
  Font.register({
    family: FAMILIA_PDF,
    fonts: [
      { src: path.join(pasta, "Geist-Regular.ttf"), fontWeight: 400 },
      { src: path.join(pasta, "Geist-Medium.ttf"), fontWeight: 500 },
      { src: path.join(pasta, "Geist-SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(pasta, "Geist-Bold.ttf"), fontWeight: 700 },
    ],
  });
  registrado = true;
}
