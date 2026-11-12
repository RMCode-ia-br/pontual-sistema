import { NextResponse } from "next/server";

/** Resposta de download de CSV: tipo certo, nome do arquivo e sem cache (o arquivo reflete os dados de agora). */
export function respostaDeCsv(csv: string, arquivo: string): NextResponse {
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${arquivo}"`, "Cache-Control": "no-store" },
  });
}
