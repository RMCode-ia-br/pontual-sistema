import { describe, expect, it } from "vitest";

import {
  dataParaInput,
  formatarData,
  formatarDataCalendario,
  formatarDataHora,
  formatarMoeda,
  formatarTelefone,
  inputParaData,
  normalizarTelefone,
  parseMoedaParaCentavos,
} from "@/lib/formatadores";
import { sanitizarNomeArquivo, TAMANHO_MAXIMO_BYTES, validarArquivo } from "@/lib/storage/regras";
import { emailValido, formatarCnpj, formatarCpf, urlHttpValida, validarCnpj, validarCpf } from "@/lib/validadores";

const semEspacoEspecial = (s: string) => s.replace(/ /g, " ");

describe("moeda", () => {
  it("formata centavos em reais", () => {
    expect(semEspacoEspecial(formatarMoeda(123456))).toBe("R$ 1.234,56");
    expect(semEspacoEspecial(formatarMoeda(8972500))).toBe("R$ 89.725,00");
    expect(semEspacoEspecial(formatarMoeda(5))).toBe("R$ 0,05");
  });

  it("converte texto em centavos sem erro de ponto flutuante", () => {
    expect(parseMoedaParaCentavos("1.234,56")).toBe(123456);
    expect(parseMoedaParaCentavos("R$ 19.830,00")).toBe(1983000);
    expect(parseMoedaParaCentavos("0,1")).toBe(10);
    expect(parseMoedaParaCentavos("12")).toBe(1200);
    // 19,99 * 100 em float dá 1998.9999999999998: aqui tem que ser exato.
    expect(parseMoedaParaCentavos("19,99")).toBe(1999);
    expect(parseMoedaParaCentavos("0,29")).toBe(29);
  });

  it("rejeita valores inválidos e negativos", () => {
    for (const ruim of ["", "abc", "-5,00", "1,234", "1.23,45", "12,345", "1..000,00"]) {
      expect(parseMoedaParaCentavos(ruim), ruim).toBeNull();
    }
  });
});

describe("datas", () => {
  it("mostra a data no fuso de São Paulo, não em UTC", () => {
    // 02:00 UTC de 11/11 ainda é 23:00 de 10/11 em São Paulo.
    expect(formatarData(new Date("2026-11-11T02:00:00Z"))).toBe("10/11/2026");
    expect(formatarDataHora(new Date("2026-11-11T02:00:00Z"))).toBe("10/11/2026 23:00");
  });

  it("data de calendário (@db.Date) não volta um dia", () => {
    const natal = new Date("2026-12-25T00:00:00.000Z");
    expect(formatarDataCalendario(natal)).toBe("25/12/2026");
    // O erro clássico: formatar em São Paulo mostraria 24/12.
    expect(formatarData(natal)).toBe("24/12/2026");
  });

  it("converte entre <input type=date> e Date de calendário", () => {
    expect(inputParaData("2026-02-17")?.toISOString()).toBe("2026-02-17T00:00:00.000Z");
    expect(dataParaInput(inputParaData("2026-02-17"))).toBe("2026-02-17");
    expect(inputParaData("2026-02-30")).toBeNull();
    expect(inputParaData("17/02/2026")).toBeNull();
    expect(dataParaInput(null)).toBe("");
  });
});

describe("telefone", () => {
  it("normaliza para E.164 aceitando máscara e o 55", () => {
    expect(normalizarTelefone("(22) 99958-3288")).toBe("+5522999583288");
    expect(normalizarTelefone("22999583288")).toBe("+5522999583288");
    expect(normalizarTelefone("+55 22 99958-3288")).toBe("+5522999583288");
    expect(normalizarTelefone("(22) 2759-1234")).toBe("+552227591234");
  });

  it("rejeita números impossíveis", () => {
    for (const ruim of ["", "12345", "(22) 89958-3288", "0229995832", "999583288"]) {
      expect(normalizarTelefone(ruim), ruim).toBeNull();
    }
  });

  it("exibe com máscara", () => {
    expect(formatarTelefone("+5522999583288")).toBe("(22) 99958-3288");
    expect(formatarTelefone("+552227591234")).toBe("(22) 2759-1234");
    expect(formatarTelefone(null)).toBe("");
    expect(formatarTelefone("texto livre")).toBe("texto livre");
  });
});

describe("CPF e CNPJ", () => {
  it("valida o CNPJ da Pontual e rejeita dígito errado", () => {
    expect(validarCnpj("37.323.333/0001-61")).toBe(true);
    expect(validarCnpj("37.323.333/0001-62")).toBe(false);
    expect(validarCnpj("11111111111111")).toBe(false);
    expect(validarCnpj("123")).toBe(false);
  });

  it("valida CPF", () => {
    expect(validarCpf("529.982.247-25")).toBe(true);
    expect(validarCpf("529.982.247-26")).toBe(false);
    expect(validarCpf("111.111.111-11")).toBe(false);
  });

  it("formata", () => {
    expect(formatarCnpj("37323333000161")).toBe("37.323.333/0001-61");
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
  });
});

describe("e-mail e URL", () => {
  it("valida e-mail", () => {
    expect(emailValido("marcelo@pontualmacae.com.br")).toBe(true);
    expect(emailValido("sem-arroba.com")).toBe(false);
    expect(emailValido("a@b")).toBe(false);
  });

  it("só aceita http(s) (nunca javascript:)", () => {
    expect(urlHttpValida("https://pontualmacae.com.br")).toBe(true);
    expect(urlHttpValida("javascript:alert(1)")).toBe(false);
    expect(urlHttpValida("data:text/html,x")).toBe(false);
    expect(urlHttpValida("texto")).toBe(false);
  });
});

describe("regras de upload", () => {
  it("aceita imagem e PDF dentro do limite", () => {
    expect(validarArquivo("image/png", 1000)).toEqual({ valido: true, extensao: "png" });
    expect(validarArquivo("application/pdf", TAMANHO_MAXIMO_BYTES)).toEqual({ valido: true, extensao: "pdf" });
  });

  it("rejeita tipo perigoso, arquivo vazio e acima do limite", () => {
    expect(validarArquivo("text/html", 100)).toMatchObject({ valido: false });
    expect(validarArquivo("application/x-msdownload", 100)).toMatchObject({ valido: false });
    expect(validarArquivo("image/svg+xml", 100)).toMatchObject({ valido: false });
    expect(validarArquivo("image/png", 0)).toMatchObject({ valido: false });
    expect(validarArquivo("image/png", TAMANHO_MAXIMO_BYTES + 1)).toMatchObject({ valido: false });
  });

  it("sanitiza o nome do arquivo", () => {
    expect(sanitizarNomeArquivo("..\\..\\windows\\boom.png")).toBe("boom.png");
    expect(sanitizarNomeArquivo("../../etc/passwd")).toBe("passwd");
    expect(sanitizarNomeArquivo('a<b>:"c|?*.pdf')).toBe("abc.pdf");
    expect(sanitizarNomeArquivo("   ")).toBe("arquivo");
    expect(sanitizarNomeArquivo("x".repeat(300))).toHaveLength(120);
  });
});
