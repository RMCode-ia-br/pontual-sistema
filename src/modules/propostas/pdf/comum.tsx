import { Line, Rect, Svg, Text, View } from "@react-pdf/renderer";

import { ALTURA_QUADRO, gerarDesenho, LARGURA_QUADRO, type TipoDesenho } from "@/lib/dominio/desenho";

export const COR_PADRAO = "#1d4ed8";

/** Cor da marca vinda de Configurações (validada: só #rrggbb entra no PDF). */
export function corDaMarca(cor: string | null): string {
  return cor && /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : COR_PADRAO;
}

export function moeda(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dataBr(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Desenho esquemático da esquadria (mesmas formas da tela). */
export function DesenhoPdf({ tipo, folhas, larguraMm, alturaMm, largura = 96 }: { tipo: string; folhas: number | null; larguraMm: number; alturaMm: number; largura?: number }) {
  const formas = gerarDesenho({ tipo: tipo as TipoDesenho, folhas, larguraMm, alturaMm });
  const altura = (largura * ALTURA_QUADRO) / LARGURA_QUADRO;
  return (
    <Svg width={largura} height={altura} viewBox={`0 0 ${LARGURA_QUADRO} ${ALTURA_QUADRO}`}>
      {formas.map((f, i) =>
        f.t === "rect" ? (
          <Rect key={i} x={f.x} y={f.y} width={f.w} height={f.h} fill={f.vidro ? "#dbeafe" : "none"} stroke="#111827" strokeWidth={0.9} />
        ) : (
          <Line key={i} x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} stroke="#111827" strokeWidth={0.7} strokeDasharray={f.tracejada ? "2 1.6" : undefined} />
        ),
      )}
    </Svg>
  );
}

/** Rodapé fixo em TODAS as páginas: endereço, CNPJ, telefone, e-mail e numeração. */
export function Rodape({ texto, cor }: { texto: string; cor: string }) {
  return (
    <View fixed style={{ position: "absolute", left: 36, right: 36, bottom: 18, borderTopWidth: 1, borderTopColor: cor, paddingTop: 4 }}>
      <Text style={{ fontSize: 7, color: "#374151", textAlign: "center" }}>{texto}</Text>
      <Text style={{ fontSize: 7, color: "#6b7280", textAlign: "center", marginTop: 1 }} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}
