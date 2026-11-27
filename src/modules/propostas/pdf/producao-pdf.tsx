import { Document, Image, Page, Text, View } from "@react-pdf/renderer";

import { resolverDesenhoDoItem } from "@/lib/dominio/desenho-item";
import { textoDoRodape } from "@/lib/dominio/texto-proposta";

import type { ConteudoProposta } from "../conteudo";
import { COR_PDF, corDaMarca, DesenhoPdf, dataBr, FAMILIA_PDF, ImagemDoDesenhoPdf, NEGRITO, Rodape } from "./comum";
import { CAIXAS_DA_IMAGEM, CAIXAS_DO_DESENHO_AUTOMATICO, imagemParaPdf, type CaixasPorTamanho, type ImagensDoDesenho } from "./imagens";
import type { LogoPdf } from "./proposta-pdf";

/**
 * Folha de produção / ordem de serviço: SEM valores. Itens com medidas, tipologia, linha/acabamento/vidro (na
 * descrição), desenho, local e observações, para a fábrica e os instaladores. Se a proposta foi aprovada, só a opção aprovada.
 */
export function ProducaoPdf({ c, opcaoId, logo = null, imagens = {}, caixas = CAIXAS_DA_IMAGEM }: { c: ConteudoProposta; opcaoId: string | null; logo?: LogoPdf; imagens?: ImagensDoDesenho; caixas?: CaixasPorTamanho }) {
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
          <View key={o.id} style={{ paddingBottom: 8 }}>
            {varias ? <Text style={{ fontSize: 10, ...NEGRITO, marginBottom: 4 }}>{o.nome.toUpperCase()}</Text> : null}
            {o.secoes.map((s, si) => (
              <View key={si}>
                {s.grupo ? <Text style={{ fontSize: 9.5, ...NEGRITO, marginTop: 8, marginBottom: 4 }}>• {s.grupo.toUpperCase()};</Text> : null}
                {s.itens.map((i) => {
                  const desenho = resolverDesenhoDoItem(i);
                  return (
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
                      {desenho.tipo === "imagem" && desenho.tamanho === "GRANDE" ? (
                        // Grande: abaixo do texto, na largura da coluna (o item continua indivisível).
                        <View style={{ marginTop: 6, alignSelf: "center" }}>
                          <ImagemDoDesenhoPdf imagem={imagemParaPdf(imagens, desenho.imagem, i.numero)} largura={caixas.GRANDE.producao.largura} altura={caixas.GRANDE.producao.altura} />
                        </View>
                      ) : null}
                    </View>
                    {desenho.tipo === "imagem" && desenho.tamanho === "GRANDE" ? null : (
                      <View style={{ width: desenho.tipo === "imagem" ? caixas.NORMAL.producao.largura : CAIXAS_DO_DESENHO_AUTOMATICO.producao.largura, flexShrink: 0 }}>
                        {desenho.tipo === "imagem" ? (
                          <ImagemDoDesenhoPdf imagem={imagemParaPdf(imagens, desenho.imagem, i.numero)} largura={caixas.NORMAL.producao.largura} altura={caixas.NORMAL.producao.altura} />
                        ) : (
                          <DesenhoPdf tipo={i.tipoDesenho} folhas={i.folhas} larguraMm={i.medidas[0]?.larguraMm ?? 2000} alturaMm={i.medidas[0]?.alturaMm ?? 1200} largura={CAIXAS_DO_DESENHO_AUTOMATICO.producao.largura} />
                        )}
                      </View>
                    )}
                  </View>
                  );
                })}
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}
