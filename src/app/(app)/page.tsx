import { CheckCircle2, ClipboardList, Handshake, History, ListChecks, PackageX, TriangleAlert, UserPlus, UserRound, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { formatarDataCalendario } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { resumoDeCadastros } from "@/modules/cadastros/resumo";
import { DIAS_CUSTO_DESATUALIZADO } from "@/modules/produtos/queries";
import { MESES_SEM_CONTATO } from "@/modules/clientes/queries";
import { listarTarefas, resumoDeTarefas } from "@/modules/tarefas/queries";
import { resumoComercial } from "@/modules/comercial/resumo";
import { ROTULO_STATUS_PROJETO } from "@/lib/dominio/funil";
import { formatarDataHora, formatarMoeda } from "@/lib/formatadores";
import { ROTULO_ORIGEM } from "@/modules/clientes/schemas";

export const metadata: Metadata = { title: "Painel" };

type Cartao = {
  titulo: string;
  valor: number;
  href: string;
  icone: typeof ClipboardList;
  /** Como o número é calculado (a especificação exige mostrar a definição de cada indicador). */
  definicao: string;
  alerta?: boolean;
};

export default async function PaginaPainel() {
  const usuario = await exigirSessao();
  const [resumo, proximas, cadastros, comercial] = await Promise.all([resumoDeTarefas(usuario.id), listarTarefas({ status: "abertas" }), resumoDeCadastros(), resumoComercial()]);

  const cartoes: Cartao[] = [
    {
      titulo: "Tarefas abertas",
      valor: resumo.abertas,
      href: "/tarefas?status=abertas",
      icone: ClipboardList,
      definicao: "Tarefas que ainda não foram concluídas.",
    },
    {
      titulo: "Tarefas vencidas",
      valor: resumo.vencidas,
      href: "/tarefas?status=abertas",
      icone: TriangleAlert,
      definicao: "Tarefas abertas cujo vencimento é anterior a hoje.",
      alerta: resumo.vencidas > 0,
    },
    {
      titulo: "Minhas tarefas",
      valor: resumo.minhasAbertas,
      href: "/tarefas?status=abertas&quem=minhas",
      icone: UserRound,
      definicao: "Tarefas abertas em que você é o responsável.",
    },
    {
      titulo: "Concluídas na semana",
      valor: resumo.concluidasNos7Dias,
      href: "/tarefas?status=concluidas",
      icone: CheckCircle2,
      definicao: "Tarefas concluídas nos últimos 7 dias.",
    },
  ];

  const cartoesDeCadastros: Cartao[] = [
    { titulo: "Clientes ativos", valor: cadastros.clientesAtivos, href: "/clientes", icone: Users, definicao: "Clientes cadastrados e ativos (fora da lixeira)." },
    { titulo: "Novos clientes no mês", valor: cadastros.clientesNovosNoMes, href: "/clientes?ordem=criadoEm&direcao=desc", icone: UserPlus, definicao: "Clientes ativos cadastrados desde o dia 1º do mês atual." },
    { titulo: "Parceiros", valor: cadastros.parceiros, href: "/parceiros", icone: Handshake, definicao: "Clientes ativos marcados como arquiteto/designer ou construtora." },
    {
      titulo: "Sem contato há 12 meses",
      valor: cadastros.clientesSemContato,
      href: "/clientes?parado=1",
      icone: History,
      definicao: `Clientes ativos cadastrados há mais de ${MESES_SEM_CONTATO} meses, sem nenhum registro de ligação, WhatsApp, visita, e-mail ou anotação no período. Boa lista para reativar.`,
    },
    {
      titulo: "Produtos sem custo",
      valor: cadastros.produtosSemCusto,
      href: "/produtos?custo=sem",
      icone: PackageX,
      definicao: "Produtos ativos com o custo ainda não informado (o sistema nunca inventa preço).",
      alerta: cadastros.produtosSemCusto > 0,
    },
    {
      titulo: "Custos desatualizados",
      valor: cadastros.produtosComCustoAntigo,
      href: "/produtos?custo=antigo",
      icone: TriangleAlert,
      definicao: `Produtos ativos cujo custo não é atualizado há mais de ${DIAS_CUSTO_DESATUALIZADO} dias.`,
      alerta: cadastros.produtosComCustoAntigo > 0,
    },
  ];

  const cartaoJsx = (c: Cartao) => {
    const Icone = c.icone;
    return (
      <Link
        key={c.titulo}
        href={c.href}
        title={`Como é calculado: ${c.definicao}`}
        className={cn("hover:bg-accent rounded-xl border p-4 transition-colors", c.alerta && "border-destructive/40 bg-destructive/5")}
      >
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Icone className={cn("size-4", c.alerta && "text-destructive")} aria-hidden />
          {c.titulo}
        </p>
        <p className={cn("mt-2 text-3xl font-semibold tabular-nums", c.alerta && "text-destructive")}>{c.valor}</p>
        <p className="text-muted-foreground mt-1 text-xs">{c.definicao}</p>
      </Link>
    );
  };

  return (
    <>
      <CabecalhoPagina titulo={`Olá, ${usuario.nome}`} descricao="Um resumo do que precisa de atenção. Obras e financeiro chegam nas próximas etapas." />

      <section aria-label="Resumo de tarefas" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cartoes.map((c) => {
          const Icone = c.icone;
          return (
            <Link
              key={c.titulo}
              href={c.href}
              title={`Como é calculado: ${c.definicao}`}
              className={cn("hover:bg-accent rounded-xl border p-4 transition-colors", c.alerta && "border-destructive/40 bg-destructive/5")}
            >
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Icone className={cn("size-4", c.alerta && "text-destructive")} aria-hidden />
                {c.titulo}
              </p>
              <p className={cn("mt-2 text-3xl font-semibold tabular-nums", c.alerta && "text-destructive")}>{c.valor}</p>
              <p className="text-muted-foreground mt-1 text-xs">{c.definicao}</p>
            </Link>
          );
        })}
      </section>

      <section aria-labelledby="titulo-funil" className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="titulo-funil" className="text-lg font-medium">
            Funil comercial
          </h2>
          <Link href="/funil" className="text-primary text-sm hover:underline">
            Abrir o funil
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {comercial.funil.map((f) => (
            <Link key={f.status} href={`/projetos?status=${f.status}`} title="Como é calculado: projetos nessa fase hoje e a soma dos valores estimados (campo opcional do projeto)." className="hover:bg-accent rounded-xl border p-4 transition-colors">
              <p className="text-muted-foreground text-sm">{ROTULO_STATUS_PROJETO[f.status]}</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{f.quantidade}</p>
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">{f.valorCentavos > 0 ? formatarMoeda(f.valorCentavos) : "Sem valor estimado"}</p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="titulo-atencao" className="mt-8">
        <h2 id="titulo-atencao" className="mb-3 text-lg font-medium">
          Atenção hoje
        </h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border p-4">
            <h3 className="mb-2 text-sm font-medium">Visitas de hoje e de amanhã</h3>
            {comercial.visitas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma visita marcada para hoje ou amanhã.</p>
            ) : (
              <ul className="grid gap-2">
                {comercial.visitas.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <Link href={`/agenda/${v.id}`} className="min-w-0 hover:underline">
                      <span className="font-medium">{v.clienteNome ?? v.projetoTitulo ?? "Visita"}</span>
                      <span className="text-muted-foreground block text-xs">
                        {v.dia === "hoje" ? "Hoje" : "Amanhã"} · {formatarDataHora(v.inicio).slice(11)}
                        {v.local ? ` · ${v.local}` : ""}
                      </span>
                    </Link>
                    <Link href={`/agenda/${v.id}`} className="text-primary text-xs hover:underline">
                      Enviar lembrete
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link href="/projetos?semRetorno=1" title="Como é calculado: projetos em Proposta enviada ou Negociação parados além do prazo de 'sem retorno' definido em Configurações." className={cn("hover:bg-accent rounded-xl border p-4 transition-colors", comercial.semRetorno > 0 && "border-destructive/40 bg-destructive/5")}>
            <p className="text-muted-foreground text-sm">Propostas sem retorno</p>
            <p className={cn("mt-2 text-3xl font-semibold tabular-nums", comercial.semRetorno > 0 && "text-destructive")}>{comercial.semRetorno}</p>
            <p className="text-muted-foreground mt-1 text-xs">Parados além do prazo configurado. Toque para ver a lista e cobrar o cliente.</p>
          </Link>
        </div>
      </section>

      <section aria-labelledby="titulo-origem" className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="titulo-origem" className="text-lg font-medium">
            Origem dos clientes e motivos de perda (mês)
          </h2>
          <Link href="/relatorios/funil" className="text-primary text-sm hover:underline">
            Ver relatório
          </Link>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border p-4">
            <h3 className="mb-2 text-sm font-medium">Projetos criados no mês, por origem</h3>
            {comercial.origensDoMes.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum projeto criado neste mês.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {comercial.origensDoMes.map((o) => (
                  <li key={o.origem ?? "sem"} className="flex justify-between gap-2">
                    <span>{o.origem ? (ROTULO_ORIGEM[o.origem as keyof typeof ROTULO_ORIGEM] ?? o.origem) : "Não informada"}</span>
                    <span className="tabular-nums">{o.quantidade}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border p-4">
            <h3 className="mb-2 text-sm font-medium">Projetos perdidos no mês, por motivo</h3>
            {comercial.perdasDoMes.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum projeto perdido neste mês.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {comercial.perdasDoMes.map((p) => (
                  <li key={p.nome} className="flex justify-between gap-2">
                    <span>{p.nome}</span>
                    <span className="tabular-nums">{p.quantidade}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="titulo-cadastros" className="mt-8">
        <h2 id="titulo-cadastros" className="mb-3 text-lg font-medium">
          Cadastros
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{cartoesDeCadastros.map(cartaoJsx)}</div>
      </section>

      <section aria-labelledby="titulo-proximas" className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="titulo-proximas" className="text-lg font-medium">
            Próximas tarefas
          </h2>
          <Link href="/tarefas" className="text-primary text-sm hover:underline">
            Ver todas
          </Link>
        </div>
        {proximas.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-10 text-center">
            <ListChecks className="text-muted-foreground mb-2 size-6" aria-hidden />
            <p className="font-medium">Nenhuma tarefa aberta</p>
            <p className="text-muted-foreground mt-1 text-sm">Anote o que precisa ser feito em Tarefas ou pelo botão “Novo”.</p>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {proximas.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 p-3">
                <Link href={`/tarefas/${t.id}`} className="min-w-0 truncate text-sm font-medium hover:underline">
                  {t.titulo}
                </Link>
                <span className={cn("shrink-0 text-xs tabular-nums", t.vencida ? "text-destructive font-medium" : "text-muted-foreground")}>
                  {t.vencimento ? `${t.vencida ? "Venceu em" : "Vence em"} ${formatarDataCalendario(t.vencimento)}` : "Sem vencimento"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-sm">
        <Link href="/primeiros-passos" className="text-primary hover:underline">
          Veja o que falta configurar nos Primeiros passos →
        </Link>
      </p>
    </>
  );
}
