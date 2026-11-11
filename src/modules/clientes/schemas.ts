import { z } from "zod";

import {
  campoCaixa,
  campoCep,
  campoCnpj,
  campoCpf,
  campoEmail,
  campoIdObrigatorio,
  campoIdOpcional,
  campoTelefone,
  campoTexto,
  campoTextoOpcional,
  campoUf,
} from "@/lib/validadores/campos";

export const ORIGENS = [
  "GOOGLE",
  "INDICACAO_CLIENTE",
  "ARQUITETO_PARCEIRO",
  "INSTAGRAM",
  "WHATSAPP",
  "SITE",
  "PLACA_NA_OBRA",
  "CLIENTE_ANTIGO",
  "OUTRO",
] as const;

export const ROTULO_ORIGEM: Record<(typeof ORIGENS)[number], string> = {
  GOOGLE: "Google",
  INDICACAO_CLIENTE: "Indicação de cliente",
  ARQUITETO_PARCEIRO: "Arquiteto parceiro",
  INSTAGRAM: "Instagram",
  WHATSAPP: "WhatsApp",
  SITE: "Site",
  PLACA_NA_OBRA: "Placa na obra",
  CLIENTE_ANTIGO: "Cliente antigo",
  OUTRO: "Outro",
};

const origemSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .pipe(z.enum(ORIGENS, { message: "Escolha uma origem da lista." }).optional())
  .optional();

const clienteBase = z.object({
  tipoPessoa: z.enum(["PF", "PJ"], { message: "Escolha pessoa física ou jurídica." }),
  nome: campoTexto("o nome", 160),
  nomeFantasia: campoTextoOpcional(160),
  documento: z.string().trim().max(24, "Documento grande demais."),
  telefone: campoTelefone("Telefone"),
  whatsapp: campoTelefone("WhatsApp"),
  email: campoEmail(),
  clienteFinal: campoCaixa,
  arquiteto: campoCaixa,
  construtora: campoCaixa,
  empresa: campoCaixa,
  origem: origemSchema,
  origemDetalhe: campoTextoOpcional(160),
  indicadoPorId: campoIdOpcional,
  observacoes: campoTextoOpcional(4000),
  /** "1" quando a pessoa já viu o aviso de duplicidade e quer cadastrar assim mesmo. */
  confirmarDuplicado: z.string().optional(),
});

const clienteEdicaoBase = clienteBase.extend({ id: campoIdObrigatorio("Cliente inválido.") });

/** CPF para pessoa física, CNPJ para pessoa jurídica; guardado só com dígitos. */
function verificarDocumento(tipo: unknown, documento: unknown): { valor?: string; erro?: string } {
  if (typeof documento !== "string") return {};
  const rotulo = tipo === "PJ" ? "CNPJ" : "CPF";
  const lido = (tipo === "PJ" ? campoCnpj(rotulo) : campoCpf(rotulo)).safeParse(documento);
  return lido.success ? { valor: lido.data } : { erro: lido.error.issues[0]?.message ?? "Documento inválido." };
}

type EntradaBruta = Record<string, string>;

/**
 * Valida o formulário de cliente. O CPF/CNPJ depende do tipo de pessoa, então é conferido à parte,
 * mas os erros saem JUNTOS com os dos outros campos (a pessoa corrige tudo de uma vez).
 */
function lerComDocumento<S extends z.ZodType<{ documento: string; confirmarDuplicado?: string }>>(schema: S, entrada: EntradaBruta) {
  const base = schema.safeParse(entrada);
  const documento = verificarDocumento(entrada.tipoPessoa, entrada.documento);
  const problemas = [
    ...(base.success ? [] : base.error.issues),
    ...(documento.erro ? [{ code: "custom" as const, path: ["documento"], message: documento.erro, input: entrada.documento }] : []),
  ];
  if (!base.success || documento.erro) return { success: false as const, error: new z.ZodError(problemas) };
  const { documento: _bruto, confirmarDuplicado, ...resto } = base.data;
  return { success: true as const, data: { ...resto, cpfCnpj: documento.valor, confirmarDuplicado: confirmarDuplicado === "1" } };
}

export const lerCliente = (entrada: EntradaBruta) => lerComDocumento(clienteBase, entrada);
export const lerClienteEditado = (entrada: EntradaBruta) => lerComDocumento(clienteEdicaoBase, entrada);

const enderecoBase = z.object({
    clienteId: campoIdObrigatorio("Cliente inválido."),
    tipo: z.enum(["OBRA", "COBRANCA"], { message: "Escolha o tipo do endereço." }),
    apelido: campoTextoOpcional(80),
    logradouro: campoTextoOpcional(200),
    numero: campoTextoOpcional(20),
    complemento: campoTextoOpcional(120),
    bairro: campoTextoOpcional(120),
    cidade: campoTextoOpcional(120),
    uf: campoUf(),
    cep: campoCep(),
    condominio: campoCaixa,
    condominioNome: campoTextoOpcional(160),
    exigeAprovacaoFachada: campoCaixa,
    fachadaAprovada: campoCaixa,
    horariosPermitidos: campoTextoOpcional(200),
    sindicoNome: campoTextoOpcional(160),
    sindicoTelefone: campoTelefone("Telefone do síndico"),
});

const temLocal = (v: { apelido?: string; logradouro?: string; cep?: string }) => !!(v.apelido || v.logradouro || v.cep);
const avisoLocal = { path: ["logradouro"], message: "Informe ao menos o apelido, a rua ou o CEP." };

export const enderecoSchema = enderecoBase.refine(temLocal, avisoLocal);
export const editarEnderecoSchema = enderecoBase.extend({ id: campoIdObrigatorio("Endereço inválido.") }).refine(temLocal, avisoLocal);

const contatoBase = z.object({
  clienteId: campoIdObrigatorio("Cliente inválido."),
  nome: campoTexto("o nome do contato", 160),
  cargo: campoTextoOpcional(80),
  telefone: campoTelefone("Telefone"),
  whatsapp: campoTelefone("WhatsApp"),
  email: campoEmail(),
  observacoes: campoTextoOpcional(1000),
});

export const contatoSchema = contatoBase;
export const editarContatoSchema = contatoBase.extend({ id: campoIdObrigatorio("Contato inválido.") });

export const TIPOS_INTERACAO_MANUAL = ["NOTA", "LIGACAO", "WHATSAPP", "VISITA", "EMAIL"] as const;

export const ROTULO_INTERACAO: Record<string, string> = {
  NOTA: "Anotação",
  LIGACAO: "Ligação",
  WHATSAPP: "WhatsApp",
  VISITA: "Visita",
  EMAIL: "E-mail",
  SISTEMA: "Sistema",
};

export const interacaoSchema = z.object({
  clienteId: campoIdObrigatorio("Cliente inválido."),
  tipo: z.enum(TIPOS_INTERACAO_MANUAL, { message: "Escolha o tipo do registro." }),
  texto: z.string().trim().min(2, "Escreva o que aconteceu.").max(4000, "Use no máximo 4.000 caracteres."),
});

export const idsSchema = z.array(campoIdObrigatorio()).min(1, "Escolha ao menos um cliente.").max(200, "Escolha no máximo 200 de uma vez.");

export const cepSchema = z.string().trim().regex(/^\d{5}-?\d{3}$/, "CEP inválido.");
export const cnpjConsultaSchema = z.string().trim().min(14).max(24);

/** Endereço em uma linha para listas ("Rua X, 10 — Bairro, Cidade/UF"). */
export function resumoDoEndereco(e: {
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}): string {
  const rua = [e.logradouro, e.numero].filter(Boolean).join(", ");
  const local = [e.cidade, e.uf].filter(Boolean).join("/");
  return [rua, [e.bairro, local].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
}
