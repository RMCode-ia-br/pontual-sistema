import { describe, expect, it } from "vitest";

import { linkWhatsApp, preencherModelo, primeiroNome, variaveisDoModelo } from "@/lib/dominio/modelos-texto";

describe("modelos de texto", () => {
  it("lista as variáveis sem repetir", () => {
    expect(variaveisDoModelo("Olá, {{cliente}}! {{ cliente }} e {{nomeFantasia}}.")).toEqual(["cliente", "nomeFantasia"]);
    expect(variaveisDoModelo("sem variáveis")).toEqual([]);
  });

  it("preenche as variáveis conhecidas", () => {
    expect(preencherModelo("Olá, {{cliente}}! Aqui é da {{nomeFantasia}}.", { cliente: "Ana", nomeFantasia: "Pontual" })).toEqual({
      texto: "Olá, Ana! Aqui é da Pontual.",
      faltando: [],
    });
  });

  it("não apaga em silêncio a variável sem valor: deixa no texto e avisa", () => {
    const r = preencherModelo("Proposta {{numeroProposta}} para {{cliente}}", { cliente: "Ana", numeroProposta: "  " });
    expect(r.texto).toBe("Proposta {{numeroProposta}} para Ana");
    expect(r.faltando).toEqual(["numeroProposta"]);
  });

  it("não executa nada nos valores (só troca texto)", () => {
    expect(preencherModelo("{{a}}", { a: "{{b}} $& $1" }).texto).toBe("{{b}} $& $1");
  });

  it("monta o link do WhatsApp com ou sem 55 e codifica a mensagem", () => {
    expect(linkWhatsApp("+5522999583288")).toBe("https://wa.me/5522999583288");
    expect(linkWhatsApp("(22) 99958-3288", "Olá & tudo bem?")).toBe("https://wa.me/5522999583288?text=Ol%C3%A1%20%26%20tudo%20bem%3F");
    expect(linkWhatsApp("123")).toBeNull();
  });

  it("primeiro nome", () => {
    expect(primeiroNome("  Maria da Silva ")).toBe("Maria");
    expect(primeiroNome("")).toBe("");
  });
});
