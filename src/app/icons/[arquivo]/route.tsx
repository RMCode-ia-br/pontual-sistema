import { ImageResponse } from "next/og";

import { prisma } from "@/lib/db";

/** Tamanho e se o desenho ocupa a área toda (maskable precisa de margem de segurança). */
const ICONES: Record<string, { tamanho: number; maskable: boolean }> = {
  "icone-192.png": { tamanho: 192, maskable: false },
  "icone-512.png": { tamanho: 512, maskable: false },
  "icone-maskable-512.png": { tamanho: 512, maskable: true },
  "apple-touch-icon.png": { tamanho: 180, maskable: true },
};

const COR_PADRAO = "#1d4ed8";

/** Cor e inicial vêm de Configurações (nada da empresa fixo); se o banco falhar, usa o padrão. */
async function identidade(): Promise<{ cor: string; inicial: string }> {
  try {
    const cfg = await prisma.configuracaoEmpresa.findUnique({
      where: { id: "singleton" },
      select: { corPrimaria: true, nomeFantasia: true },
    });
    const cor = cfg?.corPrimaria && /^#[0-9a-fA-F]{6}$/.test(cfg.corPrimaria) ? cfg.corPrimaria : COR_PADRAO;
    return { cor, inicial: cfg?.nomeFantasia?.trim().charAt(0).toUpperCase() || "P" };
  } catch {
    return { cor: COR_PADRAO, inicial: "P" };
  }
}

export async function GET(_requisicao: Request, { params }: { params: Promise<{ arquivo: string }> }) {
  const { arquivo } = await params;
  const definicao = ICONES[arquivo];
  if (!definicao) return new Response("Não encontrado.", { status: 404 });

  const { cor, inicial } = await identidade();
  const { tamanho, maskable } = definicao;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: cor,
          color: "#ffffff",
          fontSize: tamanho * (maskable ? 0.5 : 0.62),
          fontWeight: 700,
          // Ícone comum tem cantos arredondados; o maskable é quadrado (o sistema recorta).
          borderRadius: maskable ? 0 : tamanho * 0.22,
        }}
      >
        {inicial}
      </div>
    ),
    { width: tamanho, height: tamanho, headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
