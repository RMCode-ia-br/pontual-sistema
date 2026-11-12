import { Font, Line, Rect, Svg, Text, View } from "@react-pdf/renderer";

import { ALTURA_QUADRO, gerarDesenho, LARGURA_QUADRO, type TipoDesenho } from "@/lib/dominio/desenho";
import { COR_PADRAO_DO_SISTEMA, derivarTemaDaMarca } from "@/lib/tema/derivar";

// As propostas reais não hifenizam palavras ("TEM-PERADO"): desliga a hifenização automática do react-pdf.
Font.registerHyphenationCallback((palavra) => [palavra]);

/**
 * Cor da marca vinda de Configurações para o PDF (fundo branco): a variante do tema claro, que já tem
 * contraste AA sobre branco (cores claras como amarelo são escurecidas). Inválida ou vazia: azul padrão.
 */
export function corDaMarca(cor: string | null): string {
  return derivarTemaDaMarca(cor)?.claro["--primary"] ?? COR_PADRAO_DO_SISTEMA;
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
          // A primeira forma é a moldura (perfil de alumínio): traço grosso, como nos desenhos das propostas reais.
          <Rect key={i} x={f.x} y={f.y} width={f.w} height={f.h} fill={f.vidro ? "#dbeafe" : "none"} stroke="#111827" strokeWidth={i === 0 ? 2.6 : 0.9} />
        ) : (
          <Line key={i} x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} stroke="#111827" strokeWidth={0.7} strokeDasharray={f.tracejada ? "2 1.6" : undefined} />
        ),
      )}
    </Svg>
  );
}

/** Título em caixa cinza centralizada ("ESCOPO DO SERVIÇO", "NOTAS IMPORTANTES", "TERMOS COMERCIAIS"), como nas propostas reais. */
export function CaixaTitulo({ texto }: { texto: string }) {
  return (
    <View style={{ backgroundColor: "#e5e7eb", borderWidth: 1, borderColor: "#111827", paddingVertical: 5, marginBottom: 8 }}>
      <Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold", textAlign: "center" }}>{texto}</Text>
    </View>
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
