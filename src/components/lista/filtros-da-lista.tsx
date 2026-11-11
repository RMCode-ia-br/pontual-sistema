import { Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  /** Endereço da lista; o formulário envia por GET, então os filtros ficam na URL (e funcionam sem JavaScript). */
  base: string;
  busca: string;
  placeholderBusca: string;
  /** Parâmetros que devem sobreviver ao filtrar (ex.: ordenação e tamanho da página). */
  mantidos?: Record<string, string | number | undefined>;
  /** Os selects de filtro da lista. */
  children?: React.ReactNode;
  /** Há algum filtro ativo? Mostra o botão "Limpar". */
  filtrado: boolean;
};

export function FiltrosDaLista({ base, busca, placeholderBusca, mantidos = {}, children, filtrado }: Props) {
  return (
    <form method="get" action={base} role="search" className="flex flex-wrap items-end gap-2">
      {Object.entries(mantidos).map(([nome, valor]) =>
        valor === undefined || valor === "" ? null : <input key={nome} type="hidden" name={nome} value={String(valor)} />,
      )}
      <label className="grid min-w-52 flex-1 gap-1 text-xs">
        <span className="text-muted-foreground">Buscar</span>
        <span className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden />
          <Input type="search" name="busca" defaultValue={busca} placeholder={placeholderBusca} maxLength={80} className="h-9 pl-8" autoComplete="off" />
        </span>
      </label>
      {children}
      <Button type="submit" variant="secondary" className="h-9">
        Filtrar
      </Button>
      {filtrado ? (
        <Link href={base} className="text-muted-foreground inline-flex h-9 items-center px-2 text-sm hover:underline">
          Limpar
        </Link>
      ) : null}
    </form>
  );
}

type FiltroSelectProps = {
  nome: string;
  rotulo: string;
  valor: string | undefined;
  opcoes: { valor: string; rotulo: string }[];
  /** Texto da opção que remove o filtro. */
  todos?: string;
};

/** Um filtro de lista (select nativo: acessível e ótimo no celular). */
export function FiltroSelect({ nome, rotulo, valor, opcoes, todos = "Todos" }: FiltroSelectProps) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="text-muted-foreground">{rotulo}</span>
      <select
        name={nome}
        defaultValue={valor ?? ""}
        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3"
      >
        <option value="">{todos}</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
  );
}
