import { CheckCircle2, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { exigirSessao } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  bytesLegiveis,
  LIMITE_ARQUIVOS_BYTES,
  LIMITE_BANCO_BYTES,
  nivelDeUso,
  percentualDeUso,
  type NivelDeUso,
} from "@/modules/backup/uso";

export const metadata: Metadata = { title: "Backup e saúde" };

const COR: Record<NivelDeUso, string> = { normal: "bg-primary", atencao: "bg-amber-500", critico: "bg-destructive" };
const TEXTO: Record<NivelDeUso, string> = {
  normal: "Tudo certo.",
  atencao: "Atenção: passou de 70% do limite do plano gratuito.",
  critico: "Crítico: passou de 90%. Avise a RM Code para ampliar o plano.",
};

function Medidor({ titulo, usado, limite, nota }: { titulo: string; usado: number; limite: number; nota?: string }) {
  const nivel = nivelDeUso(usado, limite);
  const pct = percentualDeUso(usado, limite);
  return (
    <section className="rounded-xl border p-4" aria-label={titulo}>
      <h2 className="font-medium">{titulo}</h2>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {bytesLegiveis(usado)} <span className="text-muted-foreground text-sm font-normal">de {bytesLegiveis(limite)}</span>
      </p>
      <div
        className="bg-muted mt-3 h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${titulo}: ${pct}% do limite`}
      >
        <div className={cn("h-full rounded-full", COR[nivel])} style={{ width: `${pct}%` }} />
      </div>
      <p className={cn("mt-2 flex items-center gap-1.5 text-sm", nivel !== "normal" && "font-medium")}>
        {nivel === "normal" ? <CheckCircle2 className="text-primary size-4" aria-hidden /> : <TriangleAlert className="size-4 text-amber-600" aria-hidden />}
        {pct}% usado. {TEXTO[nivel]}
      </p>
      {nota ? <p className="text-muted-foreground mt-1 text-xs">{nota}</p> : null}
    </section>
  );
}

export default async function PaginaBackup() {
  await exigirSessao();

  const [banco, arquivos] = await Promise.all([
    prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`,
    prisma.anexo.aggregate({ where: { deletadoEm: null }, _sum: { tamanhoBytes: true }, _count: true }),
  ]);

  const bytesBanco = Number(banco[0]?.bytes ?? 0);
  const bytesArquivos = arquivos._sum.tamanhoBytes ?? 0;

  return (
    <>
      <CabecalhoPagina titulo="Backup e saúde" descricao="Quanto do plano gratuito já foi usado e como os backups funcionam." />

      <div className="grid gap-4 md:grid-cols-2">
        <Medidor titulo="Banco de dados" usado={bytesBanco} limite={LIMITE_BANCO_BYTES} />
        <Medidor
          titulo="Arquivos enviados"
          usado={bytesArquivos}
          limite={LIMITE_ARQUIVOS_BYTES}
          nota={`${arquivos._count} ${arquivos._count === 1 ? "arquivo registrado" : "arquivos registrados"} pelo sistema.`}
        />
      </div>

      <section className="mt-6 grid gap-3 rounded-xl border p-4 text-sm" aria-labelledby="titulo-backup">
        <h2 id="titulo-backup" className="font-medium">
          Backups
        </h2>
        <p>
          O plano gratuito do Supabase <strong>não faz backup automático</strong> e pausa o projeto após 1 semana sem uso. Por isso o sistema
          tem um backup diário criptografado (GitHub Actions) e um endereço de verificação de saúde para um monitor externo.
        </p>
        <ul className="text-muted-foreground list-disc pl-5">
          <li>
            <strong className="text-foreground">Backup automático:</strong> fica no GitHub (aba Actions, “Backup do banco”). Só funciona depois
            de cadastrar os segredos descritos em <code>docs/OPERACAO.md</code>. Esta tela não consegue confirmar a data do último backup.
          </li>
          <li>
            <strong className="text-foreground">Verificação de saúde:</strong> <code>/api/health</code> responde “ok” quando o banco está
            acessível. Cadastre-o em um monitor gratuito (ex.: UptimeRobot) para ser avisado se o projeto pausar.
          </li>
          <li>
            <strong className="text-foreground">Exportação completa pelo sistema:</strong> chega na fase final do projeto.
          </li>
        </ul>
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          Antes de usar dados reais da Pontual, a RM Code deve migrar para um plano do Supabase com backup diário e sem pausa.
        </p>
      </section>
    </>
  );
}
