import { describe, expect, it } from "vitest";

import { linkDaMensagemDoModelo, linkWhatsApp, preencherModelo, primeiroNome, variaveisDoModelo } from "@/lib/dominio/modelos-texto";

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

describe("link da mensagem de um modelo (lembrete de visita no painel)", () => {
  const modelo = "Olá, {{cliente}}! Lembrando da visita amanhã, {{dataVisita}}, às {{horaVisita}}.";
  const valores = { cliente: "Ana", dataVisita: "18/11/2026", horaVisita: "09:30" };

  it("monta o link do WhatsApp com a mensagem preenchida e codificada", () => {
    const link = linkDaMensagemDoModelo(modelo, "(22) 99999-1111", valores)!;
    expect(link.startsWith("https://wa.me/5522999991111?text=")).toBe(true);
    expect(decodeURIComponent(link.split("?text=")[1])).toBe("Olá, Ana! Lembrando da visita amanhã, 18/11/2026, às 09:30.");
  });

  it("não devolve link quando falta o modelo, o telefone ou um valor (nunca manda {{variável}} sobrando)", () => {
    expect(linkDaMensagemDoModelo(null, "(22) 99999-1111", valores)).toBeNull();
    expect(linkDaMensagemDoModelo(modelo, null, valores)).toBeNull();
    expect(linkDaMensagemDoModelo(modelo, "(22) 99999-1111", { ...valores, horaVisita: undefined })).toBeNull();
    expect(linkDaMensagemDoModelo(modelo, "(22) 99999-1111", { ...valores, cliente: "  " })).toBeNull();
  });

  it("telefone inválido não gera link", () => {
    expect(linkDaMensagemDoModelo(modelo, "123", valores)).toBeNull();
    expect(linkDaMensagemDoModelo(modelo, "", valores)).toBeNull();
  });
});
