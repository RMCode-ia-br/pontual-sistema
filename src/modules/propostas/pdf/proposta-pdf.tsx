import { Document, Image, Page, Text, View } from "@react-pdf/renderer";

import { linhasDePagamento, linhasDePrazo, notasNumeradas, textoDoRodape } from "@/lib/dominio/texto-proposta";
import { pontosBaseParaPercentual } from "@/lib/dominio/preco";

import type { ConteudoProposta } from "../conteudo";
import { CaixaTitulo, COR_PDF, corDaMarca, DesenhoPdf, dataBr, FAMILIA_PDF, moeda, NEGRITO, Rodape } from "./comum";

export type LogoPdf = { data: Buffer; format: "png" | "jpg" } | null;

/** Nome genérico dado pelo sistema a opções sem nome próprio ("Opção 1"): não vai para o "VALOR TOTAL". */
const nomeGenerico = (nome: string) => /^op[cç][aã]o\s*\d+$/i.test(nome.trim());

/**
 * PDF da proposta (A4 retrato), na estrutura das propostas reais da Pontual: cabeçalho em duas colunas (cliente à
 * esquerda; nº, data e consultor à direita), "ESCOPO DO SERVIÇO", seções "• NOME;", cada item num quadro com as colunas
 * nº | quantidade | descrição, local, medidas e desenho | valor (nunca quebra entre páginas), totais com a nota fiscal em
 * linha separada, notas importantes, termos comerciais, assinatura e rodapé em todas as páginas.
 * Nunca mostra custo, markup nem comissões (o conteúdo nem os contém).
 */
export function PropostaPdf({ c, logo, aviso = null }: { c: ConteudoProposta; logo: LogoPdf; aviso?: string | null }) {
  const cor = corDaMarca(c.empresa.corPrimaria);
  const maiusculas = (t: string) => (c.descricoesMaiusculas ? t.toUpperCase() : t);
  const nomeEmpresa = c.empresa.nomeFantasia ?? "";
  const varias = c.opcoes.length > 1;
  const prazo = linhasDePrazo({ ...c.prazo, tipoDias: c.prazo.tipoDias ?? "UTEIS" });
  const nomeNoTotal = (nome: string) => (varias || !nomeGenerico(nome) ? `${nome.toUpperCase()} ` : "");

  return (
    <Document title={`Proposta ${c.numero}`} author={nomeEmpresa} subject="Proposta comercial">
      <Page size="A4" style={{ paddingTop: 36, paddingBottom: 60, paddingHorizontal: 36, fontFamily: FAMILIA_PDF, fontSize: 9, color: COR_PDF.texto }}>
        <Rodape cor={cor} texto={textoDoRodape({ ...c.empresa })} />
        {aviso ? (
          <Text fixed style={{ position: "absolute", top: 14, left: 36, right: 36, fontSize: 8, ...NEGRITO, color: COR_PDF.alerta, textAlign: "center" }}>
            {aviso}
          </Text>
        ) : null}

        {/* Identidade */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf (PDF), não é <img> HTML */}
          {logo ? <Image src={logo} style={{ width: 44, height: 44, objectFit: "contain" }} /> : null}
          <View>
            <Text style={{ fontSize: 13, ...NEGRITO, color: cor }}>{nomeEmpresa}</Text>
            {c.empresa.razaoSocial && c.empresa.razaoSocial !== nomeEmpresa ? <Text style={{ fontSize: 8, color: COR_PDF.suave }}>{c.empresa.razaoSocial}</Text> : null}
          </View>
        </View>

        {/* Cabeçalho em duas colunas, como na proposta real */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Campo rotulo="Cliente" valor={c.cliente.nome} />
            {c.cliente.contato ? <Campo rotulo="Contato" valor={c.cliente.contato} /> : null}
            {c.cliente.telefone ? <Campo rotulo="Telefone" valor={c.cliente.telefone} /> : null}
            {c.cliente.email ? <Campo rotulo="E-mail" valor={c.cliente.email} /> : null}
            {c.cliente.enderecoObra ? <Campo rotulo="Endereço da obra" valor={c.cliente.enderecoObra} /> : null}
          </View>
          <View style={{ width: 235 }}>
            <Direita rotulo="Nº DA PROPOSTA" valor={`${c.numero}${c.revisao > 0 ? ` — Rev. ${c.revisao}` : ""}`} destaque />
            {c.parte ? <Direita rotulo="PARTE" valor={c.parte} /> : null}
            <Direita rotulo="DATA DA PROPOSTA" valor={dataBr(c.data)} />
            {c.consultor.nome ? <Direita rotulo="CONSULTOR RESPONSÁVEL" valor={c.consultor.nome.toUpperCase()} /> : null}
            {c.empresa.email ? <Direita rotulo="E-MAIL" valor={c.empresa.email} /> : null}
            {c.empresa.telefone ? <Direita rotulo="TELEFONE" valor={c.empresa.telefone} /> : null}
          </View>
        </View>

        <CaixaTitulo texto={c.tituloEscopo} />

        {/* Escopo */}
        {c.opcoes.map((o) => (
          <View key={o.id} style={{ marginBottom: 10 }}>
            {varias ? <Text style={{ fontSize: 10, ...NEGRITO, backgroundColor: cor, color: "#ffffff", padding: 4, marginTop: 6, marginBottom: 4 }}>{o.nome.toUpperCase()}</Text> : null}
            {o.secoes.map((s, si) => (
              <View key={si}>
                {s.grupo ? <Text style={{ fontSize: 9.5, ...NEGRITO, marginTop: 8, marginBottom: 4 }}>• {s.grupo.toUpperCase()};</Text> : null}
                {s.itens.map((i) => {
                  const comAnotacoes = i.medidas.some((m) => !!m.local);
                  return (
                    <View key={i.numero} wrap={false} style={{ flexDirection: "row", borderWidth: 1, borderColor: COR_PDF.texto, marginBottom: -1 }}>
                      <Text style={{ width: 24, flexShrink: 0, textAlign: "center", paddingTop: 3, borderRightWidth: 1, borderRightColor: COR_PDF.texto }}>{String(i.numero).padStart(2, "0")}</Text>
                      <Text style={{ width: 24, flexShrink: 0, textAlign: "center", paddingTop: 3, borderRightWidth: 1, borderRightColor: COR_PDF.texto }}>{String(i.quantidade).padStart(2, "0")}</Text>
                      <View style={{ flex: 1, padding: 5 }}>
                        <Text>{maiusculas(i.descricao)}</Text>
                        {i.local ? <Text style={{ fontSize: 8.5, marginTop: 4 }}>LOCAL: {maiusculas(i.local)}</Text> : null}
                        {comAnotacoes ? (
                          <View style={{ marginTop: 4 }}>
                            {i.medidas.map((m, k) => (
                              <Text key={k} style={{ fontSize: 8.5 }}>
                                {k === 0 ? "MED. " : ""}
                                {m.larguraMm} X {m.alturaMm} = {String(m.quantidade).padStart(2, "0")}
                                {m.local ? ` ${maiusculas(m.local)}` : ""}
                              </Text>
                            ))}
                          </View>
                        ) : null}
                        {i.observacoes ? <Text style={{ fontSize: 8.5, marginTop: 4 }}>OBS: {maiusculas(i.observacoes)}</Text> : null}
                        <View style={{ marginTop: 6, alignSelf: "center" }}>
                          <DesenhoPdf tipo={i.tipoDesenho} folhas={i.folhas} larguraMm={i.medidas[0]?.larguraMm ?? 2000} alturaMm={i.medidas[0]?.alturaMm ?? 1200} largura={170} />
                        </View>
                      </View>
                      {c.exibirValorPorItem ? (
                        <View style={{ width: 84, flexShrink: 0, borderLeftWidth: 1, borderLeftColor: COR_PDF.texto, justifyContent: "center", alignItems: "center" }}>
                          <Text>{moeda(i.precoTotalCentavos)}</Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}

            {/* Totais da opção: a nota fiscal aparece em linha separada */}
            <View wrap={false} style={{ alignSelf: "flex-end", width: 250, marginTop: 10, borderTopWidth: 1, borderTopColor: cor, paddingTop: 4 }}>
              {o.totais.descontoCentavos > 0 || c.comNotaFiscal ? <Totais rotulo="Subtotal dos itens" valor={moeda(o.totais.itensCentavos)} /> : null}
              {o.totais.descontoCentavos > 0 ? <Totais rotulo="Desconto" valor={`− ${moeda(o.totais.descontoCentavos)}`} /> : null}
              {c.comNotaFiscal ? <Totais rotulo={`Acréscimo da nota fiscal (${pontosBaseParaPercentual(c.acrescimoNotaPb)}%)`} valor={moeda(o.totais.acrescimoNotaCentavos)} /> : null}
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
                <Text style={{ ...NEGRITO, fontSize: 10 }}>{varias ? `TOTAL ${o.nome.toUpperCase()}` : "TOTAL"}</Text>
                <Text style={{ ...NEGRITO, fontSize: 10, color: cor }}>{moeda(o.totais.totalCentavos)}</Text>
              </View>
            </View>
          </View>
        ))}

        {/* Notas importantes */}
        {c.notas.length > 0 ? (
          <View style={{ marginTop: 8 }}>
            <CaixaTitulo texto="NOTAS IMPORTANTES" />
            {notasNumeradas(c.notas).map((n, i) => (
              <Text key={i} style={{ fontSize: 8.5, marginBottom: 3, textAlign: "justify" }}>
                {n}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Termos comerciais */}
        <View style={{ marginTop: 12 }} wrap={false}>
          <CaixaTitulo texto="TERMOS COMERCIAIS" />
          <Text style={{ ...NEGRITO, fontSize: 9.5, marginBottom: 4 }}>1.0 FORMA DE PAGAMENTO:</Text>
          {c.opcoes.map((o) => (
            <View key={o.id} style={{ marginBottom: 4 }}>
              <Text style={{ ...NEGRITO }}>
                • VALOR TOTAL {nomeNoTotal(o.nome)}
                {moeda(o.totais.totalCentavos)}
                {c.comNotaFiscal ? " (com nota fiscal)" : ""};
              </Text>
              {linhasDePagamento(o.totais.totalCentavos, c.pagamento.parcelas, c.pagamento.textoLivre).map((l, i) => (
                <Text key={i} style={{ fontSize: 8.5, marginLeft: 14, marginTop: 1 }}>
                  {l.toUpperCase()};
                </Text>
              ))}
            </View>
          ))}
          {c.pagamento.dadosPagamento ? <Text style={{ ...NEGRITO, fontSize: 8.5, marginTop: 4 }}>{c.pagamento.dadosPagamento}</Text> : null}

          {prazo.length > 0 ? (
            <View style={{ marginTop: 8 }}>
              <Text style={{ ...NEGRITO, fontSize: 9 }}>• PRAZO DE ENTREGA (APÓS MEDIÇÃO EXATA PARA PRODUÇÃO):</Text>
              {prazo.map((l, i) => (
                <Text key={i} style={{ fontSize: 8.5, marginLeft: 14, marginTop: 1 }}>
                  {l};
                </Text>
              ))}
            </View>
          ) : null}

          <View style={{ marginTop: 8 }}>
            <Text style={{ ...NEGRITO, fontSize: 9 }}>• Validade da proposta:</Text>
            <Text style={{ fontSize: 8.5, marginLeft: 14, marginTop: 1 }}>
              {c.validade.encerradaPorReajuste ? "Encerrada por reajuste de fornecedor." : `${[c.validade.texto, c.validade.ate ? `até ${dataBr(c.validade.ate)}` : null].filter(Boolean).join(" — ") || "Até alteração dos fornecedores"}.`}
            </Text>
          </View>
        </View>

        {c.consultor.nome ? (
          <View style={{ marginTop: 16 }} wrap={false}>
            <Text style={{ fontSize: 9 }}>Att,</Text>
            <Text style={{ ...NEGRITO, fontSize: 10, marginTop: 14 }}>{c.consultor.nome.toUpperCase()}</Text>
            {c.consultor.cargo ? <Text style={{ fontSize: 8.5 }}>{c.consultor.cargo.toUpperCase()}</Text> : null}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <Text style={{ fontSize: 8.5, marginBottom: 2 }}>
      <Text style={{ ...NEGRITO }}>{rotulo}: </Text>
      {valor}
    </Text>
  );
}

function Direita({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 2 }}>
      <Text style={{ width: 128, textAlign: "right", fontSize: 7.5, paddingRight: 4, color: COR_PDF.textoForte }}>{rotulo} |</Text>
      <Text style={{ flex: 1, fontSize: destaque ? 10 : 8.5, ...(destaque ? NEGRITO : { fontFamily: FAMILIA_PDF }) }}>{valor}</Text>
    </View>
  );
}

function Totais({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 1 }}>
      <Text style={{ fontSize: 8.5, color: COR_PDF.textoForte }}>{rotulo}</Text>
      <Text style={{ fontSize: 8.5 }}>{valor}</Text>
    </View>
  );
}
