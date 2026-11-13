"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Selecao } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chaveDoMes, dataValida, rotuloDoPeriodo, somarMeses, type Periodo, type TipoDePeriodo } from "@/lib/periodo";

const PARAMETROS_DO_PERIODO = ["mes", "periodo", "de", "ate", "pagina"];

/**
 * Escolha do período do painel e dos relatórios. O padrão é o mês atual; as setas andam de mês em mês e a lista traz os
 * períodos prontos e as datas livres. Tudo vai para a URL (`mes`, `periodo` ou `de`/`ate`), preservando os outros filtros,
 * então o link da página já reproduz o que está na tela e a lista de destino de cada número usa o mesmo período.
 */
type Props = { periodo: Periodo; tipo: TipoDePeriodo; hoje: string };

function SeletorInterno({ periodo, tipo, hoje }: Props) {
  const router = useRouter();
  const caminho = usePathname();
  const parametros = useSearchParams();
  const [datas, setDatas] = useState({ de: periodo.de, ate: periodo.ate });
  const [escolhendoDatas, setEscolhendoDatas] = useState(tipo === "livre");

  function ir(novos: Record<string, string>) {
    const p = new URLSearchParams(parametros.toString());
    for (const chave of PARAMETROS_DO_PERIODO) p.delete(chave);
    for (const [chave, valor] of Object.entries(novos)) p.set(chave, valor);
    const texto = p.toString();
    router.push(texto ? `${caminho}?${texto}` : caminho);
  }

  const ehMes = tipo === "mes";
  const mesAtual = chaveDoMes(hoje);
  const anterior = chaveDoMes(somarMeses(periodo.de, -1));
  const seguinte = chaveDoMes(somarMeses(periodo.de, 1));
  const valorDaLista = escolhendoDatas ? "livre" : ehMes ? "mes" : tipo;
  const datasOk = dataValida(datas.de) && dataValida(datas.ate) && datas.de <= datas.ate;

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3 print:hidden" role="group" aria-label="Período">
      {ehMes && !escolhendoDatas ? (
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" aria-label="Mês anterior" onClick={() => ir({ mes: anterior })}>
            <ChevronLeft aria-hidden />
          </Button>
          <p className="min-w-40 px-2 text-center text-base font-medium first-letter:uppercase" aria-live="polite">
            {rotuloDoPeriodo(periodo)}
          </p>
          <Button type="button" variant="outline" size="icon" aria-label="Mês seguinte" disabled={seguinte > mesAtual} onClick={() => ir({ mes: seguinte })}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
      ) : (
        <p className="py-2 text-base font-medium" aria-live="polite">
          {rotuloDoPeriodo(periodo)}
        </p>
      )}

      <div className="grid gap-1">
        <label htmlFor="periodo-pronto" className="text-muted-foreground text-xs">
          Período
        </label>
        <Selecao
          id="periodo-pronto"
          value={valorDaLista}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "livre") {
              setEscolhendoDatas(true);
              return;
            }
            setEscolhendoDatas(false);
            if (v === "mes") ir({ mes: mesAtual });
            else ir({ periodo: v });
          }}
        >
          <option value="mes">Por mês</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="90d">Últimos 90 dias</option>
          <option value="12m">Últimos 12 meses</option>
          <option value="ano">Este ano</option>
          <option value="livre">Escolher as datas</option>
        </Selecao>
      </div>

      {escolhendoDatas ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (datasOk) ir({ de: datas.de, ate: datas.ate });
          }}
        >
          <div className="grid gap-1">
            <label htmlFor="periodo-de" className="text-muted-foreground text-xs">
              De
            </label>
            <Input id="periodo-de" type="date" value={datas.de} onChange={(e) => setDatas((d) => ({ ...d, de: e.target.value }))} />
          </div>
          <div className="grid gap-1">
            <label htmlFor="periodo-ate" className="text-muted-foreground text-xs">
              Até
            </label>
            <Input id="periodo-ate" type="date" value={datas.ate} onChange={(e) => setDatas((d) => ({ ...d, ate: e.target.value }))} />
          </div>
          <Button type="submit" disabled={!datasOk}>
            Aplicar
          </Button>
        </form>
      ) : null}
    </div>
  );
}

/** O período vem da URL: ao navegar (setas do mês, botão voltar) o seletor é remontado e as datas do formulário acompanham. */
export function SeletorDePeriodo(props: Props) {
  return <SeletorInterno key={`${props.periodo.de}|${props.periodo.ate}|${props.tipo}`} {...props} />;
}
