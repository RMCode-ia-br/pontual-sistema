import { Download, ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Selecao } from "@/components/formulario";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { exigirSessao } from "@/lib/auth/sessao";
import { formatarDataHora } from "@/lib/formatadores";
import { buscarAuditoria, lerFiltrosAuditoria, opcoesDeFiltro, POR_PAGINA, type FiltrosAuditoria } from "@/modules/auditoria/queries";

export const metadata: Metadata = { title: "Auditoria" };

const ROTULO_ACAO: Record<string, string> = {
  CRIAR: "Criou",
  ATUALIZAR: "Alterou",
  EXCLUIR: "Excluiu",
  ATIVAR: "Ativou",
  DESATIVAR: "Desativou",
  TROCAR_SENHA: "Trocou a senha",
  REDEFINIR_SENHA: "Redefiniu a senha",
  EXPORTAR: "Exportou",
  REORDENAR: "Reordenou",
  RESTAURAR: "Restaurou",
  CONCLUIR: "Concluiu",
  REABRIR: "Reabriu",
};

function consulta(f: FiltrosAuditoria, pagina?: number): string {
  const p = new URLSearchParams();
  if (f.entidade) p.set("entidade", f.entidade);
  if (f.acao) p.set("acao", f.acao);
  if (f.usuarioId) p.set("usuarioId", f.usuarioId);
  if (f.de) p.set("de", f.de);
  if (f.ate) p.set("ate", f.ate);
  if (pagina && pagina > 1) p.set("pagina", String(pagina));
  const texto = p.toString();
  return texto ? `?${texto}` : "";
}

export default async function PaginaAuditoria({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSessao();
  const filtros = lerFiltrosAuditoria(await searchParams);
  const [{ linhas, total }, opcoes] = await Promise.all([buscarAuditoria(filtros), opcoesDeFiltro()]);
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const temFiltro = !!(filtros.entidade || filtros.acao || filtros.usuarioId || filtros.de || filtros.ate);

  return (
    <>
      <CabecalhoPagina
        titulo="Auditoria"
        descricao="Quem fez o quê e quando. Senhas nunca aparecem aqui."
        acoes={
          <a
            href={`/api/exportar/auditoria${consulta(filtros)}`}
            className="border-border hover:bg-muted inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium"
          >
            <Download className="size-4" aria-hidden /> Exportar CSV
          </a>
        }
      />

      <form method="get" className="mb-6 grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Filtros da auditoria">
        <div className="grid gap-1.5">
          <Label htmlFor="entidade">Entidade</Label>
          <Selecao id="entidade" name="entidade" defaultValue={filtros.entidade ?? ""}>
            <option value="">Todas</option>
            {opcoes.entidades.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Selecao>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="acao">Ação</Label>
          <Selecao id="acao" name="acao" defaultValue={filtros.acao ?? ""}>
            <option value="">Todas</option>
            {opcoes.acoes.map((a) => (
              <option key={a} value={a}>
                {ROTULO_ACAO[a] ?? a}
              </option>
            ))}
          </Selecao>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="usuarioId">Usuário</Label>
          <Selecao id="usuarioId" name="usuarioId" defaultValue={filtros.usuarioId ?? ""}>
            <option value="">Todos</option>
            {opcoes.usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Selecao>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="de">De</Label>
          <Input id="de" name="de" type="date" defaultValue={filtros.de ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ate">Até</Label>
          <Input id="ate" name="ate" type="date" defaultValue={filtros.ate ?? ""} />
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
          <Button type="submit">Filtrar</Button>
          {temFiltro ? (
            <Link href="/configuracoes/auditoria" className="border-border hover:bg-muted inline-flex h-8 items-center rounded-lg border px-3 text-sm">
              Limpar filtros
            </Link>
          ) : null}
        </div>
      </form>

      {linhas.length === 0 ? (
        <EstadoVazio
          icone={ScrollText}
          titulo={temFiltro ? "Nada encontrado com esses filtros" : "Ainda não há registros"}
          descricao={temFiltro ? "Tente ampliar o período ou limpar os filtros." : "As alterações feitas no sistema passam a aparecer aqui."}
        />
      ) : (
        <>
          <p className="text-muted-foreground mb-2 text-sm">
            {total} {total === 1 ? "registro" : "registros"} · página {filtros.pagina} de {totalPaginas}
          </p>
          <ul className="divide-y rounded-xl border">
            {linhas.map((l) => (
              <li key={l.id} className="p-4">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">{l.usuarioNome ?? "Sistema"}</span>
                  <span>{(ROTULO_ACAO[l.acao] ?? l.acao).toLowerCase()}</span>
                  <span className="font-medium">{l.entidade}</span>
                  <span className="text-muted-foreground font-mono text-xs">{l.entidadeId.slice(0, 12)}</span>
                  <span className="text-muted-foreground ml-auto text-xs tabular-nums">{formatarDataHora(l.criadoEm)}</span>
                </p>
                {l.antes || l.depois ? (
                  <details className="mt-2">
                    <summary className="text-primary cursor-pointer text-xs">Ver alterações</summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {l.antes ? (
                        <div>
                          <p className="text-muted-foreground mb-1 text-xs font-medium">Antes</p>
                          <pre className="bg-muted overflow-x-auto rounded-lg p-2 text-xs">{JSON.stringify(l.antes, null, 2)}</pre>
                        </div>
                      ) : null}
                      {l.depois ? (
                        <div>
                          <p className="text-muted-foreground mb-1 text-xs font-medium">Depois</p>
                          <pre className="bg-muted overflow-x-auto rounded-lg p-2 text-xs">{JSON.stringify(l.depois, null, 2)}</pre>
                        </div>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>

          <nav aria-label="Paginação" className="mt-4 flex items-center justify-between">
            {filtros.pagina > 1 ? (
              <Link href={`/configuracoes/auditoria${consulta(filtros, filtros.pagina - 1)}`} className="border-border hover:bg-muted inline-flex h-9 items-center rounded-lg border px-3 text-sm">
                ← Anterior
              </Link>
            ) : (
              <span />
            )}
            {filtros.pagina < totalPaginas ? (
              <Link href={`/configuracoes/auditoria${consulta(filtros, filtros.pagina + 1)}`} className="border-border hover:bg-muted inline-flex h-9 items-center rounded-lg border px-3 text-sm">
                Próxima →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </>
      )}
    </>
  );
}
