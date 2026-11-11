/**
 * O que cada tipo de importação aceita: campos, nomes alternativos de coluna (para o mapeamento
 * automático) e uma explicação curta de cada coluna (mostrada no passo de mapeamento e no modelo).
 * Código puro: roda no navegador e no servidor.
 */
import type { CampoImportavel } from "@/lib/dominio/mapeamento";

export const TIPOS_DE_IMPORTACAO = ["CLIENTES", "FORNECEDORES", "PRODUTOS"] as const;
export type TipoDeImportacao = (typeof TIPOS_DE_IMPORTACAO)[number];

export const ROTULO_TIPO: Record<TipoDeImportacao, string> = {
  CLIENTES: "Clientes",
  FORNECEDORES: "Fornecedores",
  PRODUTOS: "Produtos e insumos",
};

export type CampoDeImportacao = CampoImportavel & {
  /** Como preencher a coluna (aparece ao lado do campo). */
  ajuda: string;
};

const CLIENTES: CampoDeImportacao[] = [
  { chave: "nome", rotulo: "Nome", obrigatorio: true, sinonimos: ["nome completo", "razão social", "razao social", "cliente"], ajuda: "Nome da pessoa ou razão social da empresa." },
  { chave: "documento", rotulo: "CPF/CNPJ", sinonimos: ["cpf", "cnpj", "cpf cnpj", "documento"], ajuda: "11 números (CPF) ou 14 (CNPJ), com ou sem pontos. Define se é pessoa física ou jurídica." },
  { chave: "nomeFantasia", rotulo: "Nome fantasia", sinonimos: ["fantasia", "apelido"], ajuda: "Opcional." },
  { chave: "telefone", rotulo: "Telefone", sinonimos: ["fone", "celular", "tel"], ajuda: "Com DDD. Ex.: (22) 99999-9999." },
  { chave: "whatsapp", rotulo: "WhatsApp", sinonimos: ["zap"], ajuda: "Com DDD." },
  { chave: "email", rotulo: "E-mail", sinonimos: ["e mail", "email"], ajuda: "Um endereço só." },
  { chave: "origem", rotulo: "Origem", sinonimos: ["como conheceu"], ajuda: "Google, Indicação de cliente, Arquiteto parceiro, Instagram, WhatsApp, Site, Placa na obra, Cliente antigo ou Outro." },
  { chave: "arquiteto", rotulo: "É arquiteto/designer", sinonimos: ["arquiteto"], ajuda: "Sim ou Não." },
  { chave: "construtora", rotulo: "É construtora", sinonimos: [], ajuda: "Sim ou Não." },
  { chave: "observacoes", rotulo: "Observações", sinonimos: ["obs", "anotações", "anotacoes"], ajuda: "Texto livre." },
];

const FORNECEDORES: CampoDeImportacao[] = [
  { chave: "razaoSocial", rotulo: "Razão social", obrigatorio: true, sinonimos: ["nome", "fornecedor", "empresa"], ajuda: "Nome do fornecedor." },
  { chave: "nomeFantasia", rotulo: "Nome fantasia", sinonimos: ["fantasia"], ajuda: "Opcional." },
  { chave: "cnpj", rotulo: "CNPJ", sinonimos: ["documento"], ajuda: "14 números, com ou sem pontos. Não pode repetir." },
  { chave: "categorias", rotulo: "O que fornece", sinonimos: ["categoria", "categorias", "ramo"], ajuda: "Categorias de produto já cadastradas, separadas por vírgula. Ex.: Perfis, Ferragens e acessórios." },
  { chave: "vendedorNome", rotulo: "Vendedor", sinonimos: ["contato", "vendedor ou contato"], ajuda: "Nome de quem atende a Pontual." },
  { chave: "telefone", rotulo: "Telefone", sinonimos: ["fone", "celular", "whatsapp"], ajuda: "Com DDD." },
  { chave: "email", rotulo: "E-mail", sinonimos: ["e mail"], ajuda: "Um endereço só." },
  { chave: "condicoesPagamento", rotulo: "Condições de pagamento", sinonimos: ["pagamento", "condicoes"], ajuda: "Texto livre. Ex.: 28 dias, boleto." },
  { chave: "prazoEntregaDias", rotulo: "Prazo de entrega (dias)", sinonimos: ["prazo", "prazo de entrega"], ajuda: "Número inteiro de dias." },
  { chave: "observacoes", rotulo: "Observações", sinonimos: ["obs"], ajuda: "Texto livre." },
];

const PRODUTOS: CampoDeImportacao[] = [
  { chave: "codigo", rotulo: "Código", obrigatorio: true, sinonimos: ["cod", "sku", "referência", "referencia", "ref"], ajuda: "Único por produto (sem diferenciar maiúsculas)." },
  { chave: "descricao", rotulo: "Descrição", obrigatorio: true, sinonimos: ["produto", "nome", "item"], ajuda: "O que é o produto." },
  { chave: "unidade", rotulo: "Unidade", sinonimos: ["un", "unid", "medida"], ajuda: "UN, M, M2 (ou m²), KG, BARRA, L, PAR ou CJ. Vazio = UN." },
  { chave: "categoria", rotulo: "Categoria", sinonimos: ["grupo", "familia", "família"], ajuda: "Categoria de produto já cadastrada (Cadastros → Catálogos)." },
  { chave: "fornecedor", rotulo: "Fornecedor", sinonimos: ["fornecedor principal", "marca"], ajuda: "Razão social ou nome fantasia de um fornecedor já cadastrado." },
  { chave: "linha", rotulo: "Linha de alumínio", sinonimos: ["linha"], ajuda: "Linha já cadastrada. Só para perfis." },
  { chave: "acabamento", rotulo: "Acabamento", sinonimos: ["cor"], ajuda: "Acabamento já cadastrado. Só para perfis." },
  { chave: "custo", rotulo: "Custo unitário (R$)", sinonimos: ["custo", "preço de custo", "preco de custo", "preço", "preco", "valor"], ajuda: "Em reais, com vírgula. Vazio = custo ainda não informado." },
  { chave: "comprimentoBarraMm", rotulo: "Comprimento da barra (mm)", sinonimos: ["comprimento", "barra"], ajuda: "Só para perfis. Vazio e unidade BARRA = 6.000 mm." },
  { chave: "pesoKgPorMetro", rotulo: "Peso por metro (kg/m)", sinonimos: ["peso", "kg m", "peso metro"], ajuda: "Só para perfis." },
  { chave: "estoqueMinimo", rotulo: "Estoque mínimo", sinonimos: ["minimo", "mínimo"], ajuda: "Vazio = sem alerta." },
  { chave: "localizacao", rotulo: "Localização", sinonimos: ["local", "prateleira"], ajuda: "Onde fica guardado." },
];

export const CAMPOS_POR_TIPO: Record<TipoDeImportacao, CampoDeImportacao[]> = { CLIENTES, FORNECEDORES, PRODUTOS };

export const ROTULO_DUPLICADAS: Record<"IGNORAR" | "ATUALIZAR", string> = {
  IGNORAR: "Ignorar as repetidas (não mexe no que já existe)",
  ATUALIZAR: "Atualizar o que já existe (pelo código do produto)",
};

/** Só produtos podem ser atualizados pela planilha (o código é uma chave segura); nos outros, repetido é sempre ignorado. */
export const PERMITE_ATUALIZAR: Record<TipoDeImportacao, boolean> = { CLIENTES: false, FORNECEDORES: false, PRODUTOS: true };
