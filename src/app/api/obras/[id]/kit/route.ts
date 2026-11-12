import { strToU8, zipSync } from "fflate";
import { NextResponse, type NextRequest } from "next/server";

import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoParaApi } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { CATEGORIA_FOTO_DE_OBRA, MOMENTOS_DA_FOTO, nomeNoKit } from "@/lib/dominio/portfolio";
import { baixarObjeto } from "@/lib/storage";
import { legendaDaObra } from "@/modules/obras/queries-fotos";

export const dynamic = "force-dynamic";

const ID = /^[\w-]{1,64}$/;
const MAXIMO_DE_FOTOS = 20;
const STATUS_DE_OBRA = ["APROVADO", "EM_EXECUCAO", "CONCLUIDO"] as const;

/**
 * Kit de postagem: ZIP com as fotos escolhidas (nomes como "01-antes.jpg", sem nada do arquivo original) e a
 * legenda. Só serve fotos de obra marcadas para o portfólio, de obra cujo cliente autoriza o uso.
 */
export async function GET(requisicao: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Route Handlers checam a sessão por conta própria (não só o proxy).
  const usuario = await sessaoParaApi();
  if (!usuario) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  if (!ID.test(id)) return NextResponse.json({ erro: "Obra não encontrada." }, { status: 404 });

  const ids = [...new Set((requisicao.nextUrl.searchParams.get("fotos") ?? "").split(",").filter((x) => ID.test(x)))];
  if (ids.length === 0) return NextResponse.json({ erro: "Escolha ao menos uma foto." }, { status: 400 });
  if (ids.length > MAXIMO_DE_FOTOS) return NextResponse.json({ erro: `Escolha no máximo ${MAXIMO_DE_FOTOS} fotos.` }, { status: 400 });
  const legendaDigitada = (requisicao.nextUrl.searchParams.get("legenda") ?? "").trim().slice(0, 1500);

  const projeto = await prisma.projeto.findFirst({ where: { id, deletadoEm: null, status: { in: [...STATUS_DE_OBRA] } }, select: { id: true, codigo: true, autorizaPortfolio: true } });
  if (!projeto) return NextResponse.json({ erro: "Obra não encontrada." }, { status: 404 });
  if (!projeto.autorizaPortfolio) return NextResponse.json({ erro: "O cliente não autorizou o uso das fotos no portfólio." }, { status: 403 });

  const fotos = await prisma.anexo.findMany({
    where: { id: { in: ids }, entidadeTipo: "Projeto", entidadeId: id, categoria: CATEGORIA_FOTO_DE_OBRA, deletadoEm: null, usarNoPortfolio: true, mime: { startsWith: "image/" } },
    select: { id: true, caminho: true, mime: true, momento: true, criadoEm: true },
  });
  if (fotos.length !== ids.length) return NextResponse.json({ erro: "Alguma foto escolhida não está disponível para o portfólio." }, { status: 404 });

  // Antes, durante e depois, e dentro de cada momento da mais antiga para a mais nova.
  const ordem = (m: string | null) => (m ? MOMENTOS_DA_FOTO.indexOf(m as (typeof MOMENTOS_DA_FOTO)[number]) : MOMENTOS_DA_FOTO.length);
  fotos.sort((a, b) => ordem(a.momento) - ordem(b.momento) || a.criadoEm.getTime() - b.criadoEm.getTime());

  let conteudos: Uint8Array[];
  try {
    conteudos = await Promise.all(fotos.map((f) => baixarObjeto(f.caminho)));
  } catch {
    console.error(JSON.stringify({ evento: "obras.kit_falha_no_storage" }));
    return NextResponse.json({ erro: "Não foi possível buscar as fotos agora. Tente de novo." }, { status: 502 });
  }

  const legenda = legendaDigitada || (await legendaDaObra(id))?.texto || "";
  const arquivos: Record<string, [Uint8Array, { level: 0 }] | Uint8Array> = {};
  fotos.forEach((f, i) => {
    arquivos[nomeNoKit(i + 1, f.momento, f.mime)] = [conteudos[i], { level: 0 }]; // JPEG/PNG/WebP já vêm comprimidos
  });
  arquivos["legenda.txt"] = strToU8(`${legenda}\n`);
  const zip = zipSync(arquivos);

  await registrarAuditoria(prisma, { usuario, entidade: "Projeto", entidadeId: id, acao: "EXPORTAR_KIT", depois: { fotos: fotos.length } });

  return new NextResponse(zip as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="kit-postagem-${projeto.codigo}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
