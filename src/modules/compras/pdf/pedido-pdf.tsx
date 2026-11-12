import { Document, Image, Page, Text, View } from "@react-pdf/renderer";

import { textoDoRodape } from "@/lib/dominio/texto-proposta";
import { COR_PDF, corDaMarca, FAMILIA_PDF, NEGRITO, Rodape, dataBr, moeda } from "@/modules/propostas/pdf/comum";
import type { LogoPdf } from "@/modules/propostas/pdf/proposta-pdf";

export type DadosDoPedidoPdf = {
  numero: string;
  data: string;
  fornecedor: string;
  empresa: { nomeFantasia: string | null; razaoSocial: string | null; corPrimaria: string | null; cnpj: string | null; endereco: string | null; cidade: string | null; uf: string | null; cep: string | null; telefone: string | null; email: string | null };
  previsaoEntrega: string | null;
  condicoes: string | null;
  observacao: string | null;
  itens: { ordem: number; descricao: string; detalhe: string | null; quantidade: string; unidade: string; precoCentavos: number | null; subtotalCentavos: number | null }[];
  totalCentavos: number;
  itensSemPreco: number;
};

/** Pedido de compra ao fornecedor (A4 retrato): itens com quantidade, medidas e, quando informado, preço. Sem nada interno da obra. */
export function PedidoPdf({ d, logo }: { d: DadosDoPedidoPdf; logo: LogoPdf }) {
  const cor = corDaMarca(d.empresa.corPrimaria);
  const algumPreco = d.itens.some((i) => i.precoCentavos !== null);
  return (
    <Document title={`Pedido ${d.numero}`} author={d.empresa.nomeFantasia ?? ""} subject="Pedido de compra">
      <Page size="A4" style={{ paddingTop: 36, paddingBottom: 56, paddingHorizontal: 36, fontFamily: FAMILIA_PDF, fontSize: 9, color: COR_PDF.texto }}>
        <Rodape cor={cor} texto={textoDoRodape({ endereco: d.empresa.endereco, cidade: d.empresa.cidade, uf: d.empresa.uf, cep: d.empresa.cep, cnpj: d.empresa.cnpj, telefone: d.empresa.telefone, email: d.empresa.email })} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf (PDF), não é <img> HTML */}
            {logo ? <Image src={logo} style={{ width: 36, height: 36, objectFit: "contain" }} /> : null}
            <Text style={{ fontSize: 14, ...NEGRITO, color: cor }}>PEDIDO DE COMPRA</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 11, ...NEGRITO }}>{d.numero}</Text>
            <Text style={{ fontSize: 8, color: COR_PDF.suave }}>Emitido em {dataBr(d.data)}</Text>
          </View>
        </View>

        <View style={{ borderWidth: 1, borderColor: COR_PDF.borda, padding: 6, marginBottom: 10 }}>
          <Text style={{ fontSize: 8.5 }}>
            <Text style={{ ...NEGRITO }}>Fornecedor: </Text>
            {d.fornecedor}
          </Text>
          {d.empresa.razaoSocial || d.empresa.nomeFantasia ? (
            <Text style={{ fontSize: 8.5, marginTop: 1 }}>
              <Text style={{ ...NEGRITO }}>Comprador: </Text>
              {d.empresa.nomeFantasia ?? d.empresa.razaoSocial}
              {d.empresa.cnpj ? `  ·  CNPJ ${d.empresa.cnpj}` : ""}
            </Text>
          ) : null}
          {d.previsaoEntrega ? (
            <Text style={{ fontSize: 8.5, marginTop: 1 }}>
              <Text style={{ ...NEGRITO }}>Previsão de entrega: </Text>
              {dataBr(d.previsaoEntrega)}
            </Text>
          ) : null}
          {d.condicoes ? (
            <Text style={{ fontSize: 8.5, marginTop: 1 }}>
              <Text style={{ ...NEGRITO }}>Condições: </Text>
              {d.condicoes}
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COR_PDF.texto, paddingBottom: 3, marginBottom: 2 }}>
          <Text style={{ width: 22, ...NEGRITO }}>Nº</Text>
          <Text style={{ flex: 1, ...NEGRITO }}>Descrição</Text>
          <Text style={{ width: 70, textAlign: "right", ...NEGRITO }}>Quantidade</Text>
          {algumPreco ? <Text style={{ width: 62, textAlign: "right", ...NEGRITO }}>Preço</Text> : null}
          {algumPreco ? <Text style={{ width: 66, textAlign: "right", ...NEGRITO }}>Subtotal</Text> : null}
        </View>
        {d.itens.map((i) => (
          <View key={i.ordem} wrap={false} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COR_PDF.linha, paddingVertical: 5 }}>
            <Text style={{ width: 22, ...NEGRITO }}>{String(i.ordem).padStart(2, "0")}</Text>
            <View style={{ flex: 1, paddingRight: 6 }}>
              <Text>{i.descricao}</Text>
              {i.detalhe ? <Text style={{ fontSize: 8, color: COR_PDF.suave }}>{i.detalhe}</Text> : null}
            </View>
            <Text style={{ width: 70, textAlign: "right" }}>
              {i.quantidade} {i.unidade}
            </Text>
            {algumPreco ? <Text style={{ width: 62, textAlign: "right" }}>{i.precoCentavos !== null ? moeda(i.precoCentavos) : "—"}</Text> : null}
            {algumPreco ? <Text style={{ width: 66, textAlign: "right" }}>{i.subtotalCentavos !== null ? moeda(i.subtotalCentavos) : "—"}</Text> : null}
          </View>
        ))}
        {algumPreco ? (
          <View style={{ alignItems: "flex-end", marginTop: 8 }}>
            <Text style={{ fontSize: 10, ...NEGRITO }}>Total: {moeda(d.totalCentavos)}</Text>
            {d.itensSemPreco > 0 ? <Text style={{ fontSize: 7.5, color: COR_PDF.suave }}>{d.itensSemPreco} item(ns) sem preço informado.</Text> : null}
          </View>
        ) : null}
        {d.observacao ? (
          <View style={{ marginTop: 10 }}>
            <Text style={{ ...NEGRITO, marginBottom: 2 }}>Observações</Text>
            <Text>{d.observacao}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
