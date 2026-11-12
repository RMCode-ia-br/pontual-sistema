// Dados iniciais da Fase 0 (spec seção 13). Sem clientes fictícios e sem valores de negócio inventados.

import type { GrupoDre } from "../src/generated/prisma/client";
import { expandirRegras, type DefinicaoDeFeriado } from "../src/lib/dominio/regras-feriado";

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

/**
 * Fornecedores da spec (seção 13): só nome, e categoria apenas onde o nome já a diz.
 * O resto o Marcelo completa na tela (contato, condições, prazo). Ver docs/PENDENCIAS.md.
 */
export const FORNECEDORES: { razaoSocial: string; categorias: string[] }[] = [
  { razaoSocial: "Alubold", categorias: [] },
  { razaoSocial: "Pontimac", categorias: [] },
  { razaoSocial: "Dafel", categorias: [] },
  { razaoSocial: "Nova Opção", categorias: [] },
  { razaoSocial: "Klinke", categorias: [] },
  { razaoSocial: "AL Ferragens", categorias: ["Ferragens e acessórios"] },
  { razaoSocial: "Viminas", categorias: [] },
  { razaoSocial: "Simas", categorias: [] },
  { razaoSocial: "Sandro Acessórios", categorias: ["Ferragens e acessórios"] },
  { razaoSocial: "Blindex", categorias: ["Vidros"] },
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

/**
 * `grupo` é o grupo do DRE (lista fixa); `grupoDre` é o texto antigo, mantido só por compatibilidade.
 * As três últimas (tarifas e maquininha, frete, instalação terceirizada) foram sugeridas na Fase 5 e são editáveis.
 */
export const CATEGORIAS_FINANCEIRAS: { tipo: "RECEITA" | "DESPESA"; nome: string; grupoDre: string; grupo: GrupoDre }[] = [
  { tipo: "RECEITA", nome: "Venda de esquadrias", grupoDre: "Receitas operacionais", grupo: "RECEITAS_OPERACIONAIS" },
  { tipo: "RECEITA", nome: "Venda de vidros e boxes", grupoDre: "Receitas operacionais", grupo: "RECEITAS_OPERACIONAIS" },
  { tipo: "RECEITA", nome: "Assistência e visitas", grupoDre: "Receitas operacionais", grupo: "RECEITAS_OPERACIONAIS" },
  { tipo: "RECEITA", nome: "Venda de sucata", grupoDre: "Outras receitas", grupo: "OUTRAS_RECEITAS" },
  { tipo: "RECEITA", nome: "Outras receitas", grupoDre: "Outras receitas", grupo: "OUTRAS_RECEITAS" },
  { tipo: "DESPESA", nome: "Perfis de alumínio", grupoDre: "Custos diretos", grupo: "CUSTOS_DIRETOS" },
  { tipo: "DESPESA", nome: "Vidros", grupoDre: "Custos diretos", grupo: "CUSTOS_DIRETOS" },
  { tipo: "DESPESA", nome: "Ferragens e acessórios", grupoDre: "Custos diretos", grupo: "CUSTOS_DIRETOS" },
  { tipo: "DESPESA", nome: "Mão de obra e salários", grupoDre: "Custos diretos", grupo: "CUSTOS_DIRETOS" },
  { tipo: "DESPESA", nome: "Impostos (DAS)", grupoDre: "Impostos", grupo: "IMPOSTOS" },
  { tipo: "DESPESA", nome: "Aluguel", grupoDre: "Despesas fixas", grupo: "DESPESAS_FIXAS" },
  { tipo: "DESPESA", nome: "Energia, água e internet", grupoDre: "Despesas fixas", grupo: "DESPESAS_FIXAS" },
  { tipo: "DESPESA", nome: "Combustível e transporte", grupoDre: "Despesas operacionais", grupo: "DESPESAS_OPERACIONAIS" },
  { tipo: "DESPESA", nome: "Manutenção", grupoDre: "Despesas operacionais", grupo: "DESPESAS_OPERACIONAIS" },
  { tipo: "DESPESA", nome: "Marketing", grupoDre: "Despesas comerciais", grupo: "DESPESAS_COMERCIAIS" },
  { tipo: "DESPESA", nome: "Contador", grupoDre: "Despesas administrativas", grupo: "DESPESAS_ADMINISTRATIVAS" },
  { tipo: "DESPESA", nome: "Ferramentas e equipamentos", grupoDre: "Despesas operacionais", grupo: "DESPESAS_OPERACIONAIS" },
  { tipo: "DESPESA", nome: "Pró-labore", grupoDre: "Despesas administrativas", grupo: "DESPESAS_ADMINISTRATIVAS" },
  { tipo: "DESPESA", nome: "Outras despesas", grupoDre: "Despesas administrativas", grupo: "DESPESAS_ADMINISTRATIVAS" },
  { tipo: "DESPESA", nome: "Tarifas bancárias e maquininha", grupoDre: "Despesas financeiras", grupo: "DESPESAS_FINANCEIRAS" },
  { tipo: "DESPESA", nome: "Frete", grupoDre: "Custos diretos", grupo: "CUSTOS_DIRETOS" },
  { tipo: "DESPESA", nome: "Instalação terceirizada", grupoDre: "Custos diretos", grupo: "CUSTOS_DIRETOS" },
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
  {
    // Galeria de obras / kit de postagem (spec 7.8). NUNCA usar nome, telefone ou endereço do cliente aqui:
    // só tipo de serviço, linha, cidade e UF (os dados do cliente nem chegam ao preenchimento do texto).
    chave: "portfolio.legenda",
    titulo: "Galeria: legenda sugerida da postagem (revisar texto)",
    categoria: "OUTRO",
    conteudo: "{{tipoServico}} em alumínio linha {{linha}}, entregues em {{cidade}}/{{regiao}}. Pontualidade, qualidade e entrega em cada obra.",
  },
];

// ---------- Feriados (nacionais, estadual RJ e municipais de Macaé) ----------

/**
 * Regras que se repetem todo ano. Os nomes NÃO podem mudar depois de semeados: a unicidade do banco é
 * (data, nome) e um nome novo duplicaria a data. Carnaval é ponto facultativo (OUTRO: aviso, não desconta
 * dia útil). Férias coletivas NÃO entram aqui (ainda não definidas): o gestor as cadastra em Configurações.
 */
export const DEFINICOES_DE_FERIADO: readonly DefinicaoDeFeriado[] = [
  // Nacionais fixos
  { nome: "Confraternização Universal", tipo: "FERIADO", regra: { tipo: "FIXA", mes: 1, dia: 1 } },
  { nome: "Tiradentes", tipo: "FERIADO", regra: { tipo: "FIXA", mes: 4, dia: 21 } },
  { nome: "Dia do Trabalhador", tipo: "FERIADO", regra: { tipo: "FIXA", mes: 5, dia: 1 } },
  { nome: "Independência do Brasil", tipo: "FERIADO", regra: { tipo: "FIXA", mes: 9, dia: 7 } },
  { nome: "Nossa Senhora Aparecida", tipo: "FERIADO", regra: { tipo: "FIXA", mes: 10, dia: 12 } },
  { nome: "Finados", tipo: "FERIADO", regra: { tipo: "FIXA", mes: 11, dia: 2 } },
  { nome: "Proclamação da República", tipo: "FERIADO", regra: { tipo: "FIXA", mes: 11, dia: 15 } },
  { nome: "Dia da Consciência Negra", tipo: "FERIADO", regra: { tipo: "FIXA", mes: 11, dia: 20 } },
  { nome: "Natal", tipo: "FERIADO", regra: { tipo: "FIXA", mes: 12, dia: 25 } },
  // Móveis (dependem da Páscoa)
  { nome: "Carnaval (segunda-feira, ponto facultativo)", tipo: "OUTRO", regra: { tipo: "PASCOA", deslocamento: -48 } },
  { nome: "Carnaval (terça-feira, ponto facultativo)", tipo: "OUTRO", regra: { tipo: "PASCOA", deslocamento: -47 } },
  { nome: "Sexta-feira Santa", tipo: "FERIADO", regra: { tipo: "PASCOA", deslocamento: -2 } },
  { nome: "Corpus Christi", tipo: "FERIADO", regra: { tipo: "PASCOA", deslocamento: 60 } },
  // Estadual (RJ)
  { nome: "Dia de São Jorge (estadual RJ)", tipo: "FERIADO", regra: { tipo: "FIXA", mes: 4, dia: 23 } },
  // Municipais de Macaé (informados pelo dono em 2026-11-12)
  {
    nome: "São João Batista, padroeiro de Macaé (Lei Municipal 513/1975)",
    tipo: "FERIADO",
    regra: { tipo: "FIXA", mes: 6, dia: 24 },
  },
  { nome: "Aniversário de emancipação de Macaé", tipo: "FERIADO", regra: { tipo: "FIXA", mes: 7, dia: 29 } },
  // Regra, não data fixa: a 3ª segunda-feira de outubro muda a cada ano.
  {
    nome: "Dia do Comerciário (Macaé, 3ª segunda-feira de outubro)",
    tipo: "FERIADO",
    regra: { tipo: "NESIMO_DIA_DA_SEMANA", mes: 10, ordem: 3, diaSemana: 1 },
  },
];

export type FeriadoSeed = { data: Date; nome: string; tipo: "FERIADO" | "OUTRO" };

/** Linhas de `Feriado` para o intervalo de anos (uma por data; o banco guarda datas, não regras). */
export function feriadosDoSeed(anoInicial: number, anoFinal: number): FeriadoSeed[] {
  return expandirRegras(DEFINICOES_DE_FERIADO, anoInicial, anoFinal).map((f) => ({
    data: new Date(`${f.data}T00:00:00Z`),
    nome: f.nome,
    tipo: f.tipo,
  }));
}
