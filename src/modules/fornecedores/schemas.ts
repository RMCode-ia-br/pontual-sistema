import { z } from "zod";

import {
  campoCnpj,
  campoEmail,
  campoIdObrigatorio,
  campoInteiroOpcional,
  campoTelefone,
  campoTexto,
  campoTextoOpcional,
} from "@/lib/validadores/campos";

const fornecedorBase = z.object({
  razaoSocial: campoTexto("a razão social ou o nome", 160),
  nomeFantasia: campoTextoOpcional(160),
  cnpj: campoCnpj("CNPJ"),
  /** IDs das categorias de produto que o fornecedor atende (vários checkboxes de mesmo nome). */
  categoriaIds: z.array(campoIdObrigatorio("Categoria inválida.")).max(30, "Escolha no máximo 30 categorias.").default([]),
  vendedorNome: campoTextoOpcional(160),
  telefone: campoTelefone("Telefone"),
  email: campoEmail(),
  condicoesPagamento: campoTextoOpcional(300),
  prazoEntregaDias: campoInteiroOpcional("Prazo de entrega", 365),
  observacoes: campoTextoOpcional(4000),
});

export const fornecedorSchema = fornecedorBase;
export const editarFornecedorSchema = fornecedorBase.extend({ id: campoIdObrigatorio("Fornecedor inválido.") });

export const idsSchema = z.array(campoIdObrigatorio()).min(1, "Escolha ao menos um fornecedor.").max(200, "Escolha no máximo 200 de uma vez.");
