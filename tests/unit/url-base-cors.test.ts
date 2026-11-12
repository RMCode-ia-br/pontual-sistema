import { afterEach, describe, expect, it, vi } from "vitest";

import { cabecalhosCors, origensPermitidasDoSite } from "@/lib/cors";
import { montarUrlDoApp, normalizarOrigem, urlBaseDoApp } from "@/lib/url-base";

afterEach(() => vi.unstubAllEnvs());

describe("normalizarOrigem", () => {
  it("devolve só a origem, sem barra final nem caminho", () => {
    expect(normalizarOrigem("https://sistema.exemplo.com.br/")).toBe("https://sistema.exemplo.com.br");
    expect(normalizarOrigem(" https://exemplo.com.br/login?x=1 ")).toBe("https://exemplo.com.br");
  });
  it("rejeita vazio, texto solto e protocolos que não são http(s)", () => {
    expect(normalizarOrigem("")).toBeNull();
    expect(normalizarOrigem(undefined)).toBeNull();
    expect(normalizarOrigem("sistema.exemplo.com.br")).toBeNull();
    expect(normalizarOrigem("javascript:alert(1)")).toBeNull();
  });
});

describe("urlBaseDoApp / montarUrlDoApp", () => {
  it("prefere NEXT_PUBLIC_APP_URL e cai para AUTH_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://um.exemplo.com.br/");
    vi.stubEnv("AUTH_URL", "https://dois.exemplo.com.br");
    expect(urlBaseDoApp()).toBe("https://um.exemplo.com.br");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(urlBaseDoApp()).toBe("https://dois.exemplo.com.br");
  });
  it("monta o endereço completo com ou sem a barra inicial", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://sistema.exemplo.com.br");
    expect(montarUrlDoApp("/api/public/agenda/abc")).toBe("https://sistema.exemplo.com.br/api/public/agenda/abc");
    expect(montarUrlDoApp("api/health")).toBe("https://sistema.exemplo.com.br/api/health");
  });
  it("sem variável e sem navegador, devolve só o caminho", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("AUTH_URL", "");
    expect(urlBaseDoApp()).toBeNull();
    expect(montarUrlDoApp("/x")).toBe("/x");
  });
});

describe("CORS do site (SITE_ALLOWED_ORIGINS)", () => {
  it("lê a lista do ambiente, normaliza e ignora entradas inválidas e repetidas", () => {
    vi.stubEnv("SITE_ALLOWED_ORIGINS", "https://site.exemplo.com.br/, https://site.exemplo.com.br, lixo, https://www.site.exemplo.com.br");
    expect(origensPermitidasDoSite()).toEqual(["https://site.exemplo.com.br", "https://www.site.exemplo.com.br"]);
  });
  it("libera só a origem listada, nunca '*'", () => {
    vi.stubEnv("SITE_ALLOWED_ORIGINS", "https://site.exemplo.com.br");
    const ok = cabecalhosCors("https://site.exemplo.com.br");
    expect(ok["Access-Control-Allow-Origin"]).toBe("https://site.exemplo.com.br");
    expect(ok.Vary).toBe("Origin");
    const outra = cabecalhosCors("https://sistema.exemplo.com.br");
    expect(outra["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(cabecalhosCors(null)["Access-Control-Allow-Origin"]).toBeUndefined();
  });
  it("sem variável preenchida, ninguém é liberado", () => {
    vi.stubEnv("SITE_ALLOWED_ORIGINS", "");
    expect(origensPermitidasDoSite()).toEqual([]);
    expect(cabecalhosCors("https://site.exemplo.com.br")["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});
