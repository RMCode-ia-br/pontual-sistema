import { Document, Page, Text, View } from "@react-pdf/renderer";

import { textoDoRodape } from "@/lib/dominio/texto-proposta";

import type { ConteudoProposta } from "../conteudo";
import { corDaMarca, DesenhoPdf, dataBr, Rodape } from "./comum";

/**
 * Folha de produção / ordem de serviço: SEM valores. Itens com medidas, tipologia, linha/acabamento/vidro (na
 * descrição), desenho, local e observações, para a fábrica e os instaladores. Se a proposta foi aprovada, só a opção aprovada.
 */
export function ProducaoPdf({ c, opcaoId }: { c: ConteudoProposta; opcaoId: string | null }) {
  const cor = corDaMarca(c.empresa.corPrimaria);
  const opcoes = opcaoId ? c.opcoes.filter((o) => o.id === opcaoId) : c.opcoes;
  const varias = opcoes.length > 1;

  return (
    <Document title={`Folha de produção ${c.numero}`} author={c.empresa.nomeFantasia ?? ""} subject="Folha de produção (sem valores)">
      <Page size="A4" style={{ paddingTop: 36, paddingBottom: 56, paddingHorizontal: 36, fontFamily: "Helvetica", fontSize: 9, color: "#111827" }}>
        <Rodape cor={cor} texto={textoDoRodape({ ...c.empresa })} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: cor }}>FOLHA DE PRODUÇÃO</Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold" }}>
              Proposta {c.numero}
              {c.revisao > 0 ? ` — Rev. ${c.revisao}` : ""}
            </Text>
            {c.parte ? <Text style={{ fontSize: 8 }}>{c.parte}</Text> : null}
            <Text style={{ fontSize: 8, color: "#4b5563" }}>Emitida em {dataBr(c.data)}</Text>
          </View>
        </View>
        <View style={{ borderWidth: 1, borderColor: "#d1d5db", padding: 6, marginBottom: 10 }}>
          <Text style={{ fontSize: 8.5 }}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Cliente: </Text>
            {c.cliente.nome}
            {c.cliente.telefone ? `  ·  ${c.cliente.telefone}` : ""}
          </Text>
          {c.cliente.enderecoObra ? (
            <Text style={{ fontSize: 8.5, marginTop: 1 }}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Obra: </Text>
              {c.cliente.enderecoObra}
            </Text>
          ) : null}
        </View>

        {opcoes.map((o) => (
          <View key={o.id} style={{ marginBottom: 8 }}>
            {varias ? <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 4 }}>{o.nome.toUpperCase()}</Text> : null}
            {o.secoes.map((s, si) => (
              <View key={si}>
                {s.grupo ? <Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 4 }}>• {s.grupo.toUpperCase()};</Text> : null}
                {s.itens.map((i) => (
                  <View key={i.numero} wrap={false} style={{ flexDirection: "row", alignItems: "flex-start", borderBottomWidth: 0.5, borderBottomColor: "#9ca3af", paddingVertical: 6 }}>
                    <Text style={{ width: 26, flexShrink: 0, fontFamily: "Helvetica-Bold", fontSize: 11 }}>{String(i.numero).padStart(2, "0")}</Text>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text>{i.descricao.toUpperCase()}</Text>
                      <View style={{ marginTop: 3 }}>
                        {i.medidas.map((m, k) => (
                          <Text key={k} style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>
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
