// Dados iniciais da Fase 0 (spec seção 13). Sem clientes fictícios e sem valores de negócio inventados.

export const LINHAS = ["Suprema", "Gold", "23", "25", "28", "30", "Euroshow"];

export const ACABAMENTOS = [
  "Anodizado natural/brilhante",
  "Anodizado preto",
  "Revestido branco",
  "Revestido preto",
  "Revestido bronze",
  "Amadeirado",
  "Dourado",
];

export const TIPOS_VIDRO = ["Incolor", "Fumê", "Bronze", "Refletivo", "Laminado", "Com película (insulfilm)"];

export const ESPESSURAS_VIDRO_MM = [6, 8, 10];

export const CATEGORIAS_PRODUTO = [
  "Perfis",
  "Vidros",
  "Ferragens e acessórios",
  "Borrachas e escovas",
  "Silicones e vedantes",
  "Parafusos e fixações",
  "Policarbonato",
  "Espelhos",
  "Produtos acabados",
];

export const MOTIVOS_PERDA = [
  "Preço",
  "Prazo",
  "Escolheu concorrente",
  "Só queria orçamento/especulação",
  "Adiou ou desistiu da obra",
  "Sem retorno",
  "Fora da região",
  "Serviço que não oferecemos",
  "Outro",
];

/** `justificado`: motivo não imputável à Pontual, que estende o prazo prometido (R8). */
export const MOTIVOS_BLOQUEIO: { nome: string; justificado: boolean }[] = [
  { nome: "Aguardando fornecedor", justificado: false },
  { nome: "Alvenaria não pronta", justificado: true },
  { nome: "Aguardando cliente", justificado: true },
  { nome: "Aguardando condomínio", justificado: true },
  { nome: "Clima", justificado: true },
  { nome: "Falta de espaço/outra demanda no local", justificado: true },
  { nome: "Mudança pedida pelo cliente", justificado: true },
  { nome: "Outro", justificado: false },
];

export const CATEGORIAS_FINANCEIRAS: { tipo: "RECEITA" | "DESPESA"; nome: string; grupoDre: string }[] = [
  { tipo: "RECEITA", nome: "Venda de esquadrias", grupoDre: "Receitas operacionais" },
  { tipo: "RECEITA", nome: "Venda de vidros e boxes", grupoDre: "Receitas operacionais" },
  { tipo: "RECEITA", nome: "Assistência e visitas", grupoDre: "Receitas operacionais" },
  { tipo: "RECEITA", nome: "Venda de sucata", grupoDre: "Outras receitas" },
  { tipo: "RECEITA", nome: "Outras receitas", grupoDre: "Outras receitas" },
  { tipo: "DESPESA", nome: "Perfis de alumínio", grupoDre: "Custos diretos" },
  { tipo: "DESPESA", nome: "Vidros", grupoDre: "Custos diretos" },
  { tipo: "DESPESA", nome: "Ferragens e acessórios", grupoDre: "Custos diretos" },
  { tipo: "DESPESA", nome: "Mão de obra e salários", grupoDre: "Custos diretos" },
  { tipo: "DESPESA", nome: "Impostos (DAS)", grupoDre: "Impostos" },
  { tipo: "DESPESA", nome: "Aluguel", grupoDre: "Despesas fixas" },
  { tipo: "DESPESA", nome: "Energia, água e internet", grupoDre: "Despesas fixas" },
  { tipo: "DESPESA", nome: "Combustível e transporte", grupoDre: "Despesas operacionais" },
  { tipo: "DESPESA", nome: "Manutenção", grupoDre: "Despesas operacionais" },
  { tipo: "DESPESA", nome: "Marketing", grupoDre: "Despesas comerciais" },
  { tipo: "DESPESA", nome: "Contador", grupoDre: "Despesas administrativas" },
  { tipo: "DESPESA", nome: "Ferramentas e equipamentos", grupoDre: "Despesas operacionais" },
  { tipo: "DESPESA", nome: "Pró-labore", grupoDre: "Despesas administrativas" },
  { tipo: "DESPESA", nome: "Outras despesas", grupoDre: "Despesas administrativas" },
];

type CategoriaTexto = "PROPOSTA_NOTAS" | "PROPOSTA_TERMOS" | "WHATSAPP" | "OUTRO";

/**
 * Textos padrão (Apêndice A e mensagens de WhatsApp). Variáveis entre {{ }}.
 * A numeração das notas e cláusulas é automática, por isso não vai no texto.
 */
export const MODELOS_TEXTO: { chave: string; titulo: string; categoria: CategoriaTexto; conteudo: string }[] = [
  {
    chave: "proposta.notas",
    titulo: "Notas importantes da proposta",
    categoria: "PROPOSTA_NOTAS",
    conteudo: [
      "Este serviço está sob os termos e condições da {{nomeFantasia}}.",
      "No caso de qualquer alteração proposta pelo cliente nas condições dos serviços e/ou equipamentos propostos, bem como em qualquer item dos Termos e Condições anexos, a {{nomeFantasia}} reserva-se o direito de reavaliar a presente proposta, reajustando os valores acordados.",
      "A {{nomeFantasia}} se reserva o direito de declinar da execução, sem qualquer prejuízo, caso não exista acordo nos termos e condições de contrato.",
      "Procedimento de trabalho: pedido de material; montagem das esquadrias; instalação das esquadrias; medição e pedido dos vidros após esquadria instalada; instalação dos vidros, finalização e acabamento.",
      "Não nos responsabilizamos por serviços de alvenaria ou de terceiros (pedreiro, gesseiro, marceneiro etc.), devendo os vãos estar devidamente adequados, respeitando prumo e nível.",
      "Em caso de material de acabamento fora do escopo acima para correção de defeito de alvenaria, será cobrado à parte.",
      "Não existe possibilidade de cancelamento ou mudança de projeto sem custo adicional.",
      "Em caso de impedimento de fabricação das esquadrias ou atraso de alvenaria arrematada, o contratante efetuará o pagamento como combinado na proposta.",
      "Em caso de força maior, ação do tempo, ou impedimento de trabalho por falta de espaço ou atraso de outra demanda no mesmo local, o prazo poderá ser alterado.",
      "Em caso de alteração de valores no decorrer do andamento, os valores serão reajustados.",
      "Nos valores estão incluídos transporte, alimentação, acomodação, insumos para instalação e mão de obra.",
      "Confirmando o pedido, a contratante tem ciência de que concorda com os termos e modelos desta proposta.",
    ].join("\n"),
  },
  {
    chave: "proposta.termos.forma_pagamento",
    titulo: "Termos: forma de pagamento (cabeçalho)",
    categoria: "PROPOSTA_TERMOS",
    conteudo: "FORMA DE PAGAMENTO\nVALOR TOTAL {{nomeOpcao}} {{total}}",
  },
  {
    chave: "proposta.termos.prazo_entrega",
    titulo: "Termos: prazo de entrega",
    categoria: "PROPOSTA_TERMOS",
    conteudo: "PRAZO DE ENTREGA (APÓS MEDIÇÃO EXATA PARA PRODUÇÃO)",
  },
  {
    chave: "proposta.termos.validade",
    titulo: "Termos: validade da proposta",
    categoria: "PROPOSTA_TERMOS",
    conteudo: "Até alteração dos fornecedores",
  },
  {
    chave: "proposta.termos.assinatura",
    titulo: "Termos: assinatura",
    categoria: "PROPOSTA_TERMOS",
    conteudo: "Att, {{consultorNome}} — {{consultorCargo}}",
  },
  {
    chave: "proposta.rodape",
    titulo: "Rodapé de todas as páginas da proposta",
    categoria: "PROPOSTA_TERMOS",
    conteudo: "{{endereco}} — CNPJ {{cnpj}} — Tel: {{telefone}} — E-mail: {{email}}",
  },
  {
    chave: "whatsapp.confirmacao_visita",
    titulo: "WhatsApp: confirmação de visita técnica",
    categoria: "WHATSAPP",
    conteudo:
      "Olá, {{cliente}}! Aqui é da {{nomeFantasia}}. Confirmamos a visita técnica (sem custo) em {{dataVisita}}, às {{horaVisita}}, no endereço {{enderecoObra}}. Qualquer imprevisto, é só avisar por aqui.",
  },
  {
    chave: "whatsapp.lembrete_visita",
    titulo: "WhatsApp: lembrete de visita (24 h antes)",
    categoria: "WHATSAPP",
    conteudo:
      "Olá, {{cliente}}! Lembrando da nossa visita técnica amanhã, {{dataVisita}}, às {{horaVisita}}. Podemos manter o horário?",
  },
  {
    chave: "whatsapp.envio_proposta",
    titulo: "WhatsApp: envio de proposta",
    categoria: "WHATSAPP",
    conteudo:
      "Olá, {{cliente}}! Segue a proposta {{numeroProposta}} da {{nomeFantasia}}. Qualquer dúvida sobre medidas, linhas ou prazos, estou à disposição.",
  },
  {
    chave: "whatsapp.follow_up",
    titulo: "WhatsApp: acompanhamento de proposta",
    categoria: "WHATSAPP",
    conteudo:
      "Olá, {{cliente}}! Tudo bem? Passando para saber se você conseguiu avaliar a proposta {{numeroProposta}}. Posso ajudar com alguma dúvida ou ajuste?",
  },
  {
    chave: "whatsapp.cobranca",
    titulo: "WhatsApp: cobrança de parcela",
    categoria: "WHATSAPP",
    conteudo:
      "Olá, {{cliente}}! Aqui é da {{nomeFantasia}}. Identificamos a parcela de {{valorParcela}} com vencimento em {{vencimento}} referente à obra {{obra}}. Pode nos confirmar a previsão de pagamento?",
  },
  {
    chave: "whatsapp.pedido_avaliacao_google",
    titulo: "WhatsApp: pedido de avaliação no Google",
    categoria: "WHATSAPP",
    conteudo:
      "Olá, {{cliente}}! Foi um prazer entregar sua obra. Se você ficou satisfeito, sua avaliação no Google nos ajuda muito: {{linkAvaliacao}}. Obrigado pela confiança!",
  },
  {
    chave: "whatsapp.confirmacao_instalacao",
    titulo: "WhatsApp: confirmação de instalação",
    categoria: "WHATSAPP",
    conteudo:
      "Olá, {{cliente}}! Nossa equipe fará a instalação em {{dataInstalacao}}, no endereço {{enderecoObra}}. Por favor, garanta o acesso ao local no horário combinado.",
  },
];

// ---------- Feriados nacionais ----------

const NOMES_MESES_FIXOS: { mes: number; dia: number; nome: string }[] = [
  { mes: 1, dia: 1, nome: "Confraternização Universal" },
  { mes: 4, dia: 21, nome: "Tiradentes" },
  { mes: 5, dia: 1, nome: "Dia do Trabalhador" },
  { mes: 9, dia: 7, nome: "Independência do Brasil" },
  { mes: 10, dia: 12, nome: "Nossa Senhora Aparecida" },
  { mes: 11, dia: 2, nome: "Finados" },
  { mes: 11, dia: 15, nome: "Proclamação da República" },
  { mes: 11, dia: 20, nome: "Dia da Consciência Negra" },
  { mes: 12, dia: 25, nome: "Natal" },
];

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), em UTC. */
export function domingoDePascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function somarDias(data: Date, dias: number): Date {
  return new Date(data.getTime() + dias * 86_400_000);
}

export type FeriadoSeed = { data: Date; nome: string; tipo: "FERIADO" | "OUTRO" };

/**
 * Feriados nacionais (e Carnaval como ponto facultativo, tipo OUTRO, que não desconta dias úteis).
 * Feriados municipais de Macaé NÃO são inventados: ficam para o gestor cadastrar (docs/PENDENCIAS.md).
 */
export function feriadosNacionais(anoInicial: number, anoFinal: number): FeriadoSeed[] {
  const lista: FeriadoSeed[] = [];
  for (let ano = anoInicial; ano <= anoFinal; ano++) {
    for (const f of NOMES_MESES_FIXOS) {
      lista.push({ data: new Date(Date.UTC(ano, f.mes - 1, f.dia)), nome: f.nome, tipo: "FERIADO" });
    }
    const pascoa = domingoDePascoa(ano);
    lista.push({ data: somarDias(pascoa, -2), nome: "Sexta-feira Santa", tipo: "FERIADO" });
    lista.push({ data: somarDias(pascoa, -48), nome: "Carnaval (segunda-feira, ponto facultativo)", tipo: "OUTRO" });
    lista.push({ data: somarDias(pascoa, -47), nome: "Carnaval (terça-feira, ponto facultativo)", tipo: "OUTRO" });
  }
  return lista;
}
