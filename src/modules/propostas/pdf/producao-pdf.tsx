import { Document, Image, Page, Text, View } from "@react-pdf/renderer";

import { textoDoRodape } from "@/lib/dominio/texto-proposta";

import type { ConteudoProposta } from "../conteudo";
import { COR_PDF, corDaMarca, DesenhoPdf, dataBr, FAMILIA_PDF, NEGRITO, Rodape } from "./comum";
import type { LogoPdf } from "./proposta-pdf";

/**
 * Folha de produção / ordem de serviço: SEM valores. Itens com medidas, tipologia, linha/acabamento/vidro (na
 * descrição), desenho, local e observações, para a fábrica e os instaladores. Se a proposta foi aprovada, só a opção aprovada.
 */
export function ProducaoPdf({ c, opcaoId, logo = null }: { c: ConteudoProposta; opcaoId: string | null; logo?: LogoPdf }) {
  const cor = corDaMarca(c.empresa.corPrimaria);
  const opcoes = opcaoId ? c.opcoes.filter((o) => o.id === opcaoId) : c.opcoes;
  const varias = opcoes.length > 1;

  return (
    <Document title={`Folha de produção ${c.numero}`} author={c.empresa.nomeFantasia ?? ""} subject="Folha de produção (sem valores)">
      <Page size="A4" style={{ paddingTop: 36, paddingBottom: 56, paddingHorizontal: 36, fontFamily: FAMILIA_PDF, fontSize: 9, color: COR_PDF.texto }}>
        <Rodape cor={cor} texto={textoDoRodape({ ...c.empresa })} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf (PDF), não é <img> HTML */}
            {logo ? <Image src={logo} style={{ width: 36, height: 36, objectFit: "contain" }} /> : null}
            <Text style={{ fontSize: 14, ...NEGRITO, color: cor }}>FOLHA DE PRODUÇÃO</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 11, ...NEGRITO }}>
              Proposta {c.numero}
              {c.revisao > 0 ? ` — Rev. ${c.revisao}` : ""}
            </Text>
            {c.parte ? <Text style={{ fontSize: 8 }}>{c.parte}</Text> : null}
            <Text style={{ fontSize: 8, color: COR_PDF.suave }}>Emitida em {dataBr(c.data)}</Text>
          </View>
        </View>
        <View style={{ borderWidth: 1, borderColor: COR_PDF.borda, padding: 6, marginBottom: 10 }}>
          <Text style={{ fontSize: 8.5 }}>
            <Text style={{ ...NEGRITO }}>Cliente: </Text>
            {c.cliente.nome}
            {c.cliente.telefone ? `  ·  ${c.cliente.telefone}` : ""}
          </Text>
          {c.cliente.enderecoObra ? (
            <Text style={{ fontSize: 8.5, marginTop: 1 }}>
              <Text style={{ ...NEGRITO }}>Obra: </Text>
              {c.cliente.enderecoObra}
            </Text>
          ) : null}
        </View>

        {opcoes.map((o) => (
          <View key={o.id} style={{ marginBottom: 8 }}>
            {varias ? <Text style={{ fontSize: 10, ...NEGRITO, marginBottom: 4 }}>{o.nome.toUpperCase()}</Text> : null}
            {o.secoes.map((s, si) => (
              <View key={si}>
                {s.grupo ? <Text style={{ fontSize: 9.5, ...NEGRITO, marginTop: 8, marginBottom: 4 }}>• {s.grupo.toUpperCase()};</Text> : null}
                {s.itens.map((i) => (
                  <View key={i.numero} wrap={false} style={{ flexDirection: "row", alignItems: "flex-start", borderBottomWidth: 0.5, borderBottomColor: COR_PDF.linha, paddingVertical: 6 }}>
                    <Text style={{ width: 26, flexShrink: 0, ...NEGRITO, fontSize: 11 }}>{String(i.numero).padStart(2, "0")}</Text>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text>{i.descricao.toUpperCase()}</Text>
                      <View style={{ marginTop: 3 }}>
                        {i.medidas.map((m, k) => (
                          <Text key={k} style={{ fontSize: 10, ...NEGRITO }}>
                            {m.larguraMm} × {m.alturaMm} mm — {m.quantidade} un{m.local ? ` — ${m.local}` : ""}
                          </Text>
                        ))}
                      </View>
                      {i.local ? <Text style={{ fontSize: 8.5, marginTop: 2 }}>Local: {i.local}</Text> : null}
                      {i.observacoes ? <Text style={{ fontSize: 8.5, marginTop: 1 }}>Obs.: {i.observacoes}</Text> : null}
                    </View>
                    <View style={{ width: 110, flexShrink: 0 }}>
                      <DesenhoPdf tipo={i.tipoDesenho} folhas={i.folhas} larguraMm={i.medidas[0]?.larguraMm ?? 2000} alturaMm={i.medidas[0]?.alturaMm ?? 1200} largura={110} />
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}
