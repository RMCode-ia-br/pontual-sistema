"use server";

import { falha, falhaDeValidacao, formDataParaObjeto, type ResultadoAcao } from "@/lib/acoes";
import { exigirSessao } from "@/lib/auth/sessao";
import { can } from "@/lib/permissoes";

import { rodarEstoque } from "../rodar";
import { ajusteDeSucataSchema, baixaDePerfilSchema, descartarRetalhoSchema, usarRetalhoSchema, vendaDeSucataSchema } from "../schemas";
import { ajustarSucata, baixarPerfilParaObra, descartarRetalho, usarRetalhoEmObra, venderSucata } from "../servico-retalhos";

/** Baixa de perfil para uma obra: barras inteiras, ou uma barra cortada (a sobra vira retalho ou sucata). */
export async function baixarPerfil(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "movimentoEstoque")) return falha("Sem permissão.");
  const dados = baixaDePerfilSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  const d = dados.data;
  return rodarEstoque("estoque.baixa-perfil", async (tx, ip) => {
    const r = await baixarPerfilParaObra(tx, { ...d, barras: d.barras, usadoMm: d.usadoMm, local: d.local }, { usuario: sessao, ip });
    const s = r.sobra;
    const aviso = !s || s.destino === "NENHUMA" ? "" : s.destino === "RETALHO" ? ` Sobra de ${s.comprimentoMm} mm guardada como retalho.` : ` Sobra de ${s.comprimentoMm} mm foi para a sucata.`;
    return { mensagem: `Baixa registrada.${aviso}` };
  });
}

export async function usarRetalho(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "retalho")) return falha("Sem permissão.");
  const dados = usarRetalhoSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarEstoque("estoque.retalho.usar", async (tx, ip) => {
    await usarRetalhoEmObra(tx, dados.data, { usuario: sessao, ip });
    return { mensagem: "Retalho usado na obra (o custo já foi contado na obra de origem)." };
  });
}

export async function descartarRetalhoAcao(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "editar", "retalho")) return falha("Sem permissão.");
  const dados = descartarRetalhoSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarEstoque("estoque.retalho.descartar", async (tx, ip) => {
    await descartarRetalho(tx, dados.data, { usuario: sessao, ip });
    return { mensagem: dados.data.virarSucata ? "Retalho descartado e enviado para a sucata." : "Retalho descartado." };
  });
}

export async function venderSucataAcao(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "sucata")) return falha("Sem permissão.");
  const dados = vendaDeSucataSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  const d = dados.data;
  return rodarEstoque("estoque.sucata.vender", async (tx, ip) => {
    const r = await venderSucata(tx, { data: d.data, pesoMilesimosKg: d.peso, valorCentavos: d.valor, contaFinanceiraId: d.contaFinanceiraId, categoriaId: d.categoriaId, observacao: d.observacao }, { usuario: sessao, ip });
    return { mensagem: r.lancamentoId ? "Venda registrada e lançada no financeiro." : "Venda registrada (sem lançamento no financeiro)." };
  });
}

export async function ajustarSucataAcao(_anterior: ResultadoAcao | null, formData: FormData): Promise<ResultadoAcao> {
  const sessao = await exigirSessao();
  if (!can(sessao, "criar", "sucata")) return falha("Sem permissão.");
  const dados = ajusteDeSucataSchema.safeParse(formDataParaObjeto(formData));
  if (!dados.success) return falhaDeValidacao(dados.error);
  return rodarEstoque("estoque.sucata.ajustar", async (tx, ip) => {
    await ajustarSucata(tx, { data: dados.data.data, pesoMilesimosKg: dados.data.peso, observacao: dados.data.observacao }, { usuario: sessao, ip });
    return { mensagem: "Ajuste da sucata registrado." };
  });
}
