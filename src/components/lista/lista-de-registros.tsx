"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ResultadoAcao } from "@/lib/acoes";
import { hrefDaLista } from "@/lib/listas/parametros";
import { cn } from "@/lib/utils";

/** Conteúdo de uma célula, em formato simples (vem do servidor, então precisa ser serializável). */
export type Celula =
  | string
  | null
  | {
      texto: string;
      /** Segunda linha, mais discreta (ex.: nome fantasia, e-mail). */
      sub?: string;
      /** Etiquetas (ex.: marcações do cliente). */
      marcas?: { texto: string; variante?: "default" | "secondary" | "outline" | "destructive" }[];
      /** Alinha à direita (valores em dinheiro e números). */
      direita?: boolean;
    };

export type ColunaLista = {
  id: string;
  rotulo: string;
  /** Nome da ordenação no servidor; sem isso a coluna não é ordenável. */
  ordenavel?: string;
  /** Fica escondida até a pessoa ligá-la em "Colunas". */
  escondidaPorPadrao?: boolean;
  /** Não aparece nos cartões do celular (a primeira coluna sempre é o título). */
  soNaTabela?: boolean;
};

export type LinhaLista = {
  id: string;
  /** Para onde vai o clique no nome. */
  href: string;
  /** Esmaecida (cadastro inativo). */
  inativa?: boolean;
  celulas: Record<string, Celula>;
};

export type AcaoEmLote = {
  rotulo: string;
  executar: (ids: string[]) => Promise<ResultadoAcao>;
  /** Pede confirmação antes (obrigatório em ações que tiram da lista). */
  confirmar?: { titulo: string; descricao: string; botao: string };
};

type Props = {
  /** Identifica a lista para lembrar as colunas escolhidas neste navegador. */
  tela: string;
  /** Endereço da lista (ex.: "/clientes") e os parâmetros atuais, para montar os links de ordenação. */
  base: string;
  atuais: Record<string, string | number | undefined>;
  ordem: string;
  direcao: "asc" | "desc";
  colunas: ColunaLista[];
  linhas: LinhaLista[];
  acoes?: AcaoEmLote[];
};

function textoDaCelula(celula: Celula): string {
  if (celula === null || celula === undefined) return "";
  return typeof celula === "string" ? celula : celula.texto;
}

/** Tem algo para mostrar? (uma célula só com etiquetas conta). */
function temConteudo(celula: Celula): boolean {
  if (celula === null || celula === undefined) return false;
  if (typeof celula === "string") return celula !== "";
  return celula.texto !== "" || !!celula.sub || !!celula.marcas?.length;
}

function ConteudoDaCelula({ celula, href }: { celula: Celula; /** Se informado, o texto principal vira link (o resto da célula fica fora do link). */ href?: string }) {
  if (celula === null || celula === undefined || celula === "") return <span className="text-muted-foreground">—</span>;
  const comLink = (texto: string) =>
    href ? (
      <Link href={href} className="text-foreground font-medium hover:underline">
        {texto}
      </Link>
    ) : (
      texto
    );
  if (typeof celula === "string") return <>{comLink(celula)}</>;
  return (
    <div className={cn("min-w-0", celula.direita && "text-right")}>
      {celula.texto ? <p className="truncate">{comLink(celula.texto)}</p> : null}
      {celula.sub ? <p className="text-muted-foreground truncate text-xs">{celula.sub}</p> : null}
      {celula.marcas?.length ? (
        <p className="flex flex-wrap gap-1">
          {celula.marcas.map((m) => (
            <Badge key={m.texto} variant={m.variante ?? "secondary"}>
              {m.texto}
            </Badge>
          ))}
        </p>
      ) : null}
    </div>
  );
}

const EVENTO_COLUNAS = "pontual:colunas";

/** Colunas escondidas, lembradas neste navegador. O armazenamento pode estar bloqueado: nunca quebra a tela. */
function useColunasEscondidas(chave: string, padrao: string[]): [string[], (proximo: string[]) => void] {
  const assinar = useCallback((aoMudar: () => void) => {
    window.addEventListener("storage", aoMudar);
    window.addEventListener(EVENTO_COLUNAS, aoMudar);
    return () => {
      window.removeEventListener("storage", aoMudar);
      window.removeEventListener(EVENTO_COLUNAS, aoMudar);
    };
  }, []);
  const ler = useCallback(() => {
    try {
      return window.localStorage.getItem(chave);
    } catch {
      return null;
    }
  }, [chave]);
  // No servidor (e na primeira renderização) vale o padrão; depois entra o que a pessoa escolheu.
  const salvo = useSyncExternalStore(assinar, ler, () => null);
  const escondidas = useMemo(() => {
    if (!salvo) return padrao;
    try {
      const lista: unknown = JSON.parse(salvo);
      return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : padrao;
    } catch {
      return padrao;
    }
  }, [salvo, padrao]);
  const gravar = useCallback(
    (proximo: string[]) => {
      try {
        window.localStorage.setItem(chave, JSON.stringify(proximo));
      } catch {
        /* sem armazenamento: vale só nesta visita */
      }
      window.dispatchEvent(new Event(EVENTO_COLUNAS));
    },
    [chave],
  );
  return [escondidas, gravar];
}

export function ListaDeRegistros({ tela, base, atuais, ordem, direcao, colunas, linhas, acoes = [] }: Props) {
  const router = useRouter();
  const padraoEscondidas = useMemo(() => colunas.filter((c) => c.escondidaPorPadrao).map((c) => c.id), [colunas]);
  const [escondidas, gravarEscondidas] = useColunasEscondidas(`colunas:${tela}`, padraoEscondidas);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  // Trocar de página ou de filtro troca as linhas: a seleção anterior não vale mais (ajuste durante a renderização).
  const [linhasVistas, setLinhasVistas] = useState(linhas);
  if (linhasVistas !== linhas) {
    setLinhasVistas(linhas);
    setSelecionadas(new Set());
  }
  const [aConfirmar, setAConfirmar] = useState<AcaoEmLote | null>(null);
  const [pendente, iniciar] = useTransition();

  function alternarColuna(id: string) {
    gravarEscondidas(escondidas.includes(id) ? escondidas.filter((x) => x !== id) : [...escondidas, id]);
  }

  const visiveis = colunas.filter((c, i) => i === 0 || !escondidas.includes(c.id));
  const todasMarcadas = linhas.length > 0 && selecionadas.size === linhas.length;
  const comAcoes = acoes.length > 0;

  function alternarLinha(id: string) {
    setSelecionadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function executar(acao: AcaoEmLote) {
    const ids = Array.from(selecionadas);
    iniciar(async () => {
      const r = await acao.executar(ids);
      setAConfirmar(null);
      if (r.ok) {
        toast.success(r.mensagem ?? "Pronto.");
        setSelecionadas(new Set());
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  function pedirAcao(acao: AcaoEmLote) {
    if (acao.confirmar) setAConfirmar(acao);
    else executar(acao);
  }

  function cabecalhoOrdenavel(coluna: ColunaLista) {
    if (!coluna.ordenavel) return coluna.rotulo;
    const ativa = ordem === coluna.ordenavel;
    const proxima = ativa && direcao === "asc" ? "desc" : "asc";
    const Icone = !ativa ? ChevronsUpDown : direcao === "asc" ? ArrowUp : ArrowDown;
    return (
      <Link
        href={hrefDaLista(base, atuais, { ordem: coluna.ordenavel, direcao: proxima, pagina: 1 })}
        className="hover:text-foreground inline-flex items-center gap-1"
        aria-label={`Ordenar por ${coluna.rotulo}${ativa ? (direcao === "asc" ? ", crescente" : ", decrescente") : ""}`}
      >
        {coluna.rotulo}
        <Icone className={cn("size-3.5", !ativa && "opacity-40")} aria-hidden />
      </Link>
    );
  }

  const [principal, ...demais] = colunas;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          {comAcoes && selecionadas.size > 0 ? (
            <>
              <span className="text-sm font-medium">
                {selecionadas.size} {selecionadas.size === 1 ? "selecionado" : "selecionados"}
              </span>
              {acoes.map((a) => (
                <Button key={a.rotulo} type="button" variant="outline" size="sm" disabled={pendente} onClick={() => pedirAcao(a)}>
                  {a.rotulo}
                </Button>
              ))}
            </>
          ) : comAcoes ? (
            <span className="text-muted-foreground text-xs">Marque os itens da lista para agir em vários de uma vez.</span>
          ) : null}
        </div>
        <Popover>
          <PopoverTrigger render={<Button type="button" variant="outline" size="sm" className="hidden md:inline-flex" />}>
            <Columns3 aria-hidden /> Colunas
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56">
            <p className="text-muted-foreground text-xs">Escolha o que aparece na tabela.</p>
            <ul className="grid gap-1">
              <li className="text-muted-foreground flex items-center gap-2 text-sm">
                <input type="checkbox" checked disabled className="accent-primary size-4" aria-label={`${principal.rotulo} (sempre visível)`} />
                {principal.rotulo}
              </li>
              {demais.map((c) => (
                <li key={c.id}>
                  <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-primary size-4"
                      checked={!escondidas.includes(c.id)}
                      onChange={() => alternarColuna(c.id)}
                    />
                    {c.rotulo}
                  </label>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>

      {/* Computador: tabela */}
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
            <tr>
              {comAcoes ? (
                <th scope="col" className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    className="accent-primary size-4"
                    aria-label="Marcar todos desta página"
                    checked={todasMarcadas}
                    onChange={() => setSelecionadas(todasMarcadas ? new Set() : new Set(linhas.map((l) => l.id)))}
                  />
                </th>
              ) : null}
              {visiveis.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className="px-3 py-2 font-medium"
                  aria-sort={c.ordenavel && ordem === c.ordenavel ? (direcao === "asc" ? "ascending" : "descending") : undefined}
                >
                  {cabecalhoOrdenavel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {linhas.map((l) => (
              <tr key={l.id} className={cn("hover:bg-muted/30", l.inativa && "text-muted-foreground")}>
                {comAcoes ? (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="accent-primary size-4"
                      aria-label={`Marcar ${textoDaCelula(l.celulas[principal.id])}`}
                      checked={selecionadas.has(l.id)}
                      onChange={() => alternarLinha(l.id)}
                    />
                  </td>
                ) : null}
                {visiveis.map((c, i) => (
                  <td key={c.id} className="max-w-72 px-3 py-2 align-top">
                    <ConteudoDaCelula celula={l.celulas[c.id] ?? null} href={i === 0 ? l.href : undefined} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Celular: cartões */}
      <ul className="grid gap-2 md:hidden">
        {linhas.map((l) => (
          <li key={l.id} className={cn("rounded-xl border p-3", l.inativa && "text-muted-foreground")}>
            <div className="flex items-start gap-3">
              {comAcoes ? (
                <input
                  type="checkbox"
                  className="accent-primary mt-1 size-5 shrink-0"
                  aria-label={`Marcar ${textoDaCelula(l.celulas[principal.id])}`}
                  checked={selecionadas.has(l.id)}
                  onChange={() => alternarLinha(l.id)}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <ConteudoDaCelula celula={l.celulas[principal.id] ?? null} href={l.href} />
                <dl className="mt-1.5 grid gap-1 text-sm">
                  {demais
                    .filter((c) => !c.soNaTabela && temConteudo(l.celulas[c.id] ?? null))
                    .map((c) => (
                      <div key={c.id} className="flex gap-2">
                        <dt className="text-muted-foreground shrink-0 text-xs leading-5">{c.rotulo}:</dt>
                        <dd className="min-w-0">
                          <ConteudoDaCelula celula={l.celulas[c.id] ?? null} />
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <AlertDialog open={!!aConfirmar} onOpenChange={(aberto) => !aberto && setAConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{aConfirmar?.confirmar?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{aConfirmar?.confirmar?.descricao}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendente}
              onClick={(e) => {
                e.preventDefault();
                if (aConfirmar) executar(aConfirmar);
              }}
            >
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} {aConfirmar?.confirmar?.botao}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
