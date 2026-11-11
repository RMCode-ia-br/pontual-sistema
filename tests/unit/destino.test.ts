import { describe, expect, it } from "vitest";

import { destinoSeguro } from "@/lib/auth/destino";

const c = (...codigos: number[]) => String.fromCharCode(...codigos);

describe("destino seguro após o login (anti redirecionamento aberto)", () => {
  it("aceita caminhos internos e preserva consulta e âncora", () => {
    expect(destinoSeguro("/")).toBe("/");
    expect(destinoSeguro("/tarefas")).toBe("/tarefas");
    expect(destinoSeguro("/tarefas?status=abertas&quem=minhas")).toBe("/tarefas?status=abertas&quem=minhas");
    expect(destinoSeguro("/configuracoes/auditoria?entidade=Tarefa#fim")).toBe("/configuracoes/auditoria?entidade=Tarefa#fim");
  });

  it("sem destino usa o padrão", () => {
    expect(destinoSeguro(undefined)).toBe("/");
    expect(destinoSeguro(null)).toBe("/");
    expect(destinoSeguro("")).toBe("/");
    expect(destinoSeguro("", "/tarefas")).toBe("/tarefas");
  });

  it("recusa endereços externos e esquemas", () => {
    for (const ruim of ["https://evil.com", "http://evil.com/x", "//evil.com", "javascript:alert(1)", "evil.com", "data:text/html,x", "mailto:a@b.c"]) {
      expect(destinoSeguro(ruim), ruim).toBe("/");
    }
  });

  it("recusa o truque do TAB/CR/LF (o navegador os remove e vira //evil.com)", () => {
    expect(destinoSeguro(`/${c(9)}/evil.com`)).toBe("/");
    expect(destinoSeguro(`/${c(13)}/evil.com`)).toBe("/");
    expect(destinoSeguro(`/${c(10)}/evil.com`)).toBe("/");
    expect(destinoSeguro(`/${c(0)}/evil.com`)).toBe("/");
    expect(destinoSeguro(`/tarefas${c(10)}`)).toBe("/");
  });

  it("recusa barra invertida (alguns navegadores a tratam como barra)", () => {
    expect(destinoSeguro(`/${c(92)}evil.com`)).toBe("/");
    expect(destinoSeguro(`/${c(92)}/evil.com`)).toBe("/");
    expect(destinoSeguro(`/tarefas${c(92)}x`)).toBe("/");
  });

  it("recusa destino gigante", () => {
    expect(destinoSeguro(`/${"a".repeat(600)}`)).toBe("/");
  });
});
