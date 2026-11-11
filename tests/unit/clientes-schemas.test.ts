import { describe, expect, it } from "vitest";

import { contatoSchema, editarEnderecoSchema, enderecoSchema, interacaoSchema, lerCliente, lerClienteEditado, resumoDoEndereco } from "@/modules/clientes/schemas";

const clienteSchema = { safeParse: lerCliente };

const CPF_VALIDO = "529.982.247-25";
const CNPJ_VALIDO = "11.222.333/0001-81";

const base = { tipoPessoa: "PF", nome: "Maria da Silva", documento: "" };

describe("clienteSchema", () => {
  it("aceita só o nome (o resto é opcional) e marcações ausentes viram falso", () => {
    const r = clienteSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cpfCnpj).toBeUndefined();
      expect(r.data).toMatchObject({ clienteFinal: false, arquiteto: false, construtora: false, empresa: false, confirmarDuplicado: false });
    }
  });

  it("guarda CPF e CNPJ só com dígitos, conforme o tipo de pessoa", () => {
    const pf = clienteSchema.safeParse({ ...base, documento: CPF_VALIDO });
    expect(pf.success && pf.data.cpfCnpj).toBe("52998224725");
    const pj = clienteSchema.safeParse({ ...base, tipoPessoa: "PJ", documento: CNPJ_VALIDO });
    expect(pj.success && pj.data.cpfCnpj).toBe("11222333000181");
  });

  it("recusa CPF onde cabe CNPJ e vice-versa, e documento inválido", () => {
    const trocado = clienteSchema.safeParse({ ...base, tipoPessoa: "PJ", documento: CPF_VALIDO });
    expect(trocado.success).toBe(false);
    if (!trocado.success) expect(trocado.error.issues[0]).toMatchObject({ path: ["documento"], message: expect.stringContaining("CNPJ") });
    expect(clienteSchema.safeParse({ ...base, documento: "111.111.111-11" }).success).toBe(false);
    expect(clienteSchema.safeParse({ ...base, documento: "123" }).success).toBe(false);
  });

  it("devolve os erros de documento e de telefone JUNTOS, para corrigir tudo de uma vez", () => {
    const r = clienteSchema.safeParse({ ...base, documento: "111.111.111-11", telefone: "123" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path.join("."))).toEqual(expect.arrayContaining(["documento", "telefone"]));
  });

  it("a edição exige o id e o devolve nos dados", () => {
    expect(lerClienteEditado({ ...base }).success).toBe(false);
    const r = lerClienteEditado({ ...base, id: "c1" });
    expect(r.success && r.data.id).toBe("c1");
  });

  it("normaliza telefone para E.164 e e-mail para minúsculas; recusa inválidos", () => {
    const r = clienteSchema.safeParse({ ...base, telefone: "(22) 99958-3288", whatsapp: "22 2762-1234", email: "Ana@Exemplo.COM" });
    expect(r.success && r.data.telefone).toBe("+5522999583288");
    expect(r.success && r.data.whatsapp).toBe("+552227621234");
    expect(r.success && r.data.email).toBe("ana@exemplo.com");
    const ruim = clienteSchema.safeParse({ ...base, telefone: "12345", email: "sem-arroba" });
    expect(ruim.success).toBe(false);
    if (!ruim.success) {
      const caminhos = ruim.error.issues.map((i) => i.path.join("."));
      expect(caminhos).toEqual(expect.arrayContaining(["telefone", "email"]));
    }
  });

  it("exige o nome com pelo menos 2 caracteres e respeita o limite", () => {
    expect(clienteSchema.safeParse({ ...base, nome: " x " }).success).toBe(false);
    expect(clienteSchema.safeParse({ ...base, nome: "x".repeat(161) }).success).toBe(false);
  });

  it("origem vazia vira ausente; origem fora da lista é recusada", () => {
    const vazia = clienteSchema.safeParse({ ...base, origem: "" });
    expect(vazia.success && vazia.data.origem).toBeUndefined();
    expect(clienteSchema.safeParse({ ...base, origem: "INSTAGRAM" }).success).toBe(true);
    expect(clienteSchema.safeParse({ ...base, origem: "QUALQUER_COISA" }).success).toBe(false);
  });

  it("tipo de pessoa desconhecido é recusado e a confirmação de duplicidade só vale com '1'", () => {
    expect(clienteSchema.safeParse({ ...base, tipoPessoa: "XX" }).success).toBe(false);
    const sim = clienteSchema.safeParse({ ...base, confirmarDuplicado: "1" });
    expect(sim.success && sim.data.confirmarDuplicado).toBe(true);
    const nao = clienteSchema.safeParse({ ...base, confirmarDuplicado: "sim" });
    expect(nao.success && nao.data.confirmarDuplicado).toBe(false);
  });
});

describe("enderecoSchema", () => {
  const ok = { clienteId: "c1", tipo: "OBRA", logradouro: "Rua A" };

  it("exige ao menos apelido, rua ou CEP", () => {
    expect(enderecoSchema.safeParse({ clienteId: "c1", tipo: "OBRA" }).success).toBe(false);
    expect(enderecoSchema.safeParse(ok).success).toBe(true);
    expect(enderecoSchema.safeParse({ clienteId: "c1", tipo: "OBRA", cep: "27940-050" }).success).toBe(true);
  });

  it("formata o CEP, valida a UF e recusa tipo desconhecido", () => {
    const r = enderecoSchema.safeParse({ ...ok, cep: "27940050", uf: "rj" });
    expect(r.success && r.data.cep).toBe("27940-050");
    expect(r.success && r.data.uf).toBe("RJ");
    expect(enderecoSchema.safeParse({ ...ok, uf: "XX" }).success).toBe(false);
    expect(enderecoSchema.safeParse({ ...ok, cep: "123" }).success).toBe(false);
    expect(enderecoSchema.safeParse({ ...ok, tipo: "OUTRO" }).success).toBe(false);
  });

  it("a edição exige o id do endereço", () => {
    expect(editarEnderecoSchema.safeParse(ok).success).toBe(false);
    expect(editarEnderecoSchema.safeParse({ ...ok, id: "e1" }).success).toBe(true);
  });

  it("caixas de condomínio viram verdadeiro só com 'on'", () => {
    const r = enderecoSchema.safeParse({ ...ok, condominio: "on", exigeAprovacaoFachada: "on" });
    expect(r.success && r.data.condominio).toBe(true);
    expect(r.success && r.data.fachadaAprovada).toBe(false);
  });

  it("resume o endereço em uma linha", () => {
    expect(resumoDoEndereco({ logradouro: "Rua A", numero: "10", bairro: "Centro", cidade: "Macaé", uf: "RJ" })).toBe("Rua A, 10 — Centro, Macaé/RJ");
    expect(resumoDoEndereco({ logradouro: null, numero: null, bairro: null, cidade: "Macaé", uf: "RJ" })).toBe("Macaé/RJ");
  });
});

describe("contatoSchema e interacaoSchema", () => {
  it("contato exige nome e valida os canais", () => {
    expect(contatoSchema.safeParse({ clienteId: "c1", nome: "" }).success).toBe(false);
    const r = contatoSchema.safeParse({ clienteId: "c1", nome: "João", telefone: "22999583288", email: "a@b.co" });
    expect(r.success && r.data.telefone).toBe("+5522999583288");
    expect(contatoSchema.safeParse({ clienteId: "c1", nome: "João", whatsapp: "1" }).success).toBe(false);
  });

  it("interação aceita só os tipos manuais e exige texto", () => {
    expect(interacaoSchema.safeParse({ clienteId: "c1", tipo: "NOTA", texto: "Pediu proposta." }).success).toBe(true);
    expect(interacaoSchema.safeParse({ clienteId: "c1", tipo: "SISTEMA", texto: "Evento forjado" }).success).toBe(false);
    expect(interacaoSchema.safeParse({ clienteId: "c1", tipo: "NOTA", texto: " " }).success).toBe(false);
    expect(interacaoSchema.safeParse({ clienteId: "c1", tipo: "NOTA", texto: "x".repeat(4001) }).success).toBe(false);
  });
});
