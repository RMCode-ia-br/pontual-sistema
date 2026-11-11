import { Document, Image, Page, Text, View } from "@react-pdf/renderer";

import { linhasDePagamento, linhasDePrazo, notasNumeradas, textoDasMedidas, textoDoRodape } from "@/lib/dominio/texto-proposta";
import { pontosBaseParaPercentual } from "@/lib/dominio/preco";

import type { ConteudoProposta } from "../conteudo";
import { corDaMarca, DesenhoPdf, dataBr, moeda, Rodape } from "./comum";

export type LogoPdf = { data: Buffer; format: "png" | "jpg" } | null;

const azulClaro = "#eff6ff";

/**
 * PDF da proposta (A4 retrato): cabeçalho, escopo por opção e seção, itens com desenho (sem quebrar entre páginas),
 * totais com a nota fiscal em linha separada, notas importantes, termos comerciais, assinatura e rodapé em todas as páginas.
 * Nunca mostra custo, markup nem comissões (o conteúdo nem os contém).
 */
export function PropostaPdf({ c, logo }: { c: ConteudoProposta; logo: LogoPdf }) {
  const cor = corDaMarca(c.empresa.corPrimaria);
  const maiusculas = (t: string) => (c.descricoesMaiusculas ? t.toUpperCase() : t);
  const nomeEmpresa = c.empresa.nomeFantasia ?? "";
  const varias = c.opcoes.length > 1;

  return (
    <Document title={`Proposta ${c.numero}`} author={nomeEmpresa} subject="Proposta comercial">
      <Page size="A4" style={{ paddingTop: 36, paddingBottom: 56, paddingHorizontal: 36, fontFamily: "Helvetica", fontSize: 9, color: "#111827" }}>
        <Rodape cor={cor} texto={textoDoRodape({ ...c.empresa })} />

        {/* Cabeçalho */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf (PDF), não é <img> HTML */}
            {logo ? <Image src={logo} style={{ width: 54, height: 54, objectFit: "contain" }} /> : null}
            <View>
              <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: cor }}>{nomeEmpresa}</Text>
              {c.empresa.razaoSocial && c.empresa.razaoSocial !== nomeEmpresa ? <Text style={{ fontSize: 8, color: "#4b5563" }}>{c.empresa.razaoSocial}</Text> : null}
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold" }}>
              PROPOSTA {c.numero}
              {c.revisao > 0 ? ` — Rev. ${c.revisao}` : ""}
            </Text>
            {c.parte ? <Text style={{ fontSize: 8 }}>{c.parte}</Text> : null}
            <Text style={{ fontSize: 8, color: "#4b5563" }}>Data: {dataBr(c.data)}</Text>
          </View>
        </View>

        <View style={{ backgroundColor: azulClaro, borderLeftWidth: 3, borderLeftColor: cor, padding: 8, marginBottom: 10 }}>
          <Linha rotulo="Cliente" valor={c.cliente.nome} />
          {c.cliente.contato ? <Linha rotulo="Contato" valor={c.cliente.contato} /> : null}
          {c.cliente.telefone ? <Linha rotulo="Telefone" valor={c.cliente.telefone} /> : null}
          {c.cliente.email ? <Linha rotulo="E-mail" valor={c.cliente.email} /> : null}
          {c.cliente.enderecoObra ? <Linha rotulo="Obra" valor={c.cliente.enderecoObra} /> : null}
          {c.consultor.nome ? <Linha rotulo="Consultor" valor={`${c.consultor.nome}${c.consultor.cargo ? ` — ${c.consultor.cargo}` : ""}`} /> : null}
        </View>

        <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: cor, marginBottom: 6 }}>{c.tituloEscopo}</Text>

        {/* Escopo */}
        {c.opcoes.map((o) => (
          <View key={o.id} style={{ marginBottom: 10 }}>
            {varias ? <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", backgroundColor: cor, color: "#ffffff", padding: 4, marginBottom: 4 }}>{o.nome.toUpperCase()}</Text> : null}
            {o.secoes.map((s, si) => (
              <View key={si}>
                {s.grupo ? <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 4, marginBottom: 3, borderBottomWidth: 1, borderBottomColor: "#d1d5db", paddingBottom: 2 }}>{s.grupo.toUpperCase()}</Text> : null}
                {s.itens.map((i) => (
                  <View key={i.numero} wrap={false} style={{ flexDirection: "row", alignItems: "flex-start", borderBottomWidth: 0.5, borderBottomColor: "#d1d5db", paddingVertical: 5 }}>
                    <View style={{ width: 34, flexShrink: 0 }}>
                      <Text style={{ fontFamily: "Helvetica-Bold" }}>{String(i.numero).padStart(2, "0")}</Text>
                      <Text style={{ fontSize: 8, color: "#4b5563" }}>{i.quantidade} un</Text>
                    </View>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text>{maiusculas(i.descricao)}</Text>
                      {i.medidas.length > 1 ? <Text style={{ fontSize: 8, color: "#374151", marginTop: 1 }}>MED.: {textoDasMedidas(i.medidas)}</Text> : null}
                      {i.local ? <Text style={{ fontSize: 8, color: "#374151", marginTop: 1 }}>Local: {maiusculas(i.local)}</Text> : null}
                      {i.observacoes ? <Text style={{ fontSize: 8, color: "#374151", marginTop: 1 }}>Obs.: {maiusculas(i.observacoes)}</Text> : null}
                    </View>
                    <View style={{ width: 88, flexShrink: 0 }}>
                      <DesenhoPdf tipo={i.tipoDesenho} folhas={i.folhas} larguraMm={i.medidas[0]?.larguraMm ?? 2000} alturaMm={i.medidas[0]?.alturaMm ?? 1200} largura={88} />
                    </View>
                    {c.exibirValorPorItem ? <Text style={{ width: 74, flexShrink: 0, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{moeda(i.precoTotalCentavos)}</Text> : null}
                  </View>
                ))}
              </View>
            ))}

            {/* Totais da opção: a nota fiscal aparece em linha separada */}
            <View wrap={false} style={{ alignSelf: "flex-end", width: 240, marginTop: 6, borderTopWidth: 1, borderTopColor: cor, paddingTop: 4 }}>
              {o.totais.descontoCentavos > 0 || c.comNotaFiscal ? <Totais rotulo="Subtotal dos itens" valor={moeda(o.totais.itensCentavos)} /> : null}
              {o.totais.descontoCentavos > 0 ? <Totais rotulo="Desconto" valor={`− ${moeda(o.totais.descontoCentavos)}`} /> : null}
              {c.comNotaFiscal ? <Totais rotulo={`Acréscimo da nota fiscal (${pontosBaseParaPercentual(c.acrescimoNotaPb)}%)`} valor={moeda(o.totais.acrescimoNotaCentavos)} /> : null}
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
                <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>{varias ? `TOTAL ${o.nome.toUpperCase()}` : "TOTAL"}</Text>
                <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, color: cor }}>{moeda(o.totais.totalCentavos)}</Text>
              </View>
            </View>
          </View>
        ))}

        {/* Notas importantes */}
        {c.notas.length > 0 ? (
          <View style={{ marginTop: 6 }}>
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: cor, marginBottom: 3 }} minPresenceAhead={40}>
              NOTAS IMPORTANTES
            </Text>
            {notasNumeradas(c.notas).map((n, i) => (
              <Text key={i} style={{ fontSize: 8, marginBottom: 2, textAlign: "justify" }}>
                {n}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Termos comerciais */}
        <View style={{ marginTop: 10 }} wrap={false}>
          <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: cor, marginBottom: 3 }}>TERMOS COMERCIAIS</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 2 }}>1.0 FORMA DE PAGAMENTO</Text>
          {c.opcoes.map((o) => (
            <View key={o.id} style={{ marginBottom: 3 }}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                VALOR TOTAL {varias ? `${o.nome.toUpperCase()} ` : ""}
                {moeda(o.totais.totalCentavos)}
                {c.comNotaFiscal ? " (com nota fiscal)" : ""}
              </Text>
              {linhasDePagamento(o.totais.totalCentavos, c.pagamento.parcelas, c.pagamento.textoLivre).map((l, i) => (
                <Text key={i} style={{ fontSize: 8.5, marginLeft: 8 }}>
                  • {l}
                </Text>
              ))}
            </View>
          ))}
          {c.pagamento.dadosPagamento ? <Text style={{ fontSize: 8.5, marginTop: 2 }}>{c.pagamento.dadosPagamento}</Text> : null}

          {linhasDePrazo({ ...c.prazo, tipoDias: c.prazo.tipoDias ?? "UTEIS" }).length > 0 ? (
            <View style={{ marginTop: 6 }}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 2 }}>PRAZO DE ENTREGA (APÓS MEDIÇÃO EXATA PARA PRODUÇÃO)</Text>
              {linhasDePrazo({ ...c.prazo, tipoDias: c.prazo.tipoDias ?? "UTEIS" }).map((l, i) => (
                <Text key={i} style={{ fontSize: 8.5, marginLeft: 8 }}>
                  • {l}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={{ marginTop: 6 }}>
            <Text style={{ fontSize: 8.5 }}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Validade da proposta: </Text>
              {c.validade.encerradaPorReajuste ? "encerrada por reajuste de fornecedor" : [c.validade.texto, c.validade.ate ? `até ${dataBr(c.validade.ate)}` : null].filter(Boolean).join(" — ") || "Até alteração dos fornecedores"}
            </Text>
          </View>
        </View>

        {c.consultor.nome ? (
          <View style={{ marginTop: 16 }} wrap={false}>
            <Text style={{ fontSize: 9 }}>Att,</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, marginTop: 14 }}>{c.consultor.nome.toUpperCase()}</Text>
            {c.consultor.cargo ? <Text style={{ fontSize: 8.5 }}>{c.consultor.cargo.toUpperCase()}</Text> : null}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <Text style={{ fontSize: 8.5, marginBottom: 1 }}>
      <Text style={{ fontFamily: "Helvetica-Bold" }}>{rotulo}: </Text>
      {valor}
    </Text>
  );
}

function Totais({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 1 }}>
      <Text style={{ fontSize: 8.5, color: "#374151" }}>{rotulo}</Text>
      <Text style={{ fontSize: 8.5 }}>{valor}</Text>
    </View>
  );
}
