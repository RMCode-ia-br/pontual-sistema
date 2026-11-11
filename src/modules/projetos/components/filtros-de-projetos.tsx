import { FiltroSelect } from "@/components/lista/filtros-da-lista";
import { ROTULO_STATUS_PROJETO, TODOS_OS_STATUS } from "@/lib/dominio/funil";
import { ORIGENS, ROTULO_ORIGEM } from "@/modules/clientes/schemas";

import type { FiltrosProjetos } from "../queries";
import { PORTES, ROTULO_PORTE, ROTULO_TEMPERATURA, TEMPERATURAS } from "../schemas";

const estiloData =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

/** Os filtros de projetos, iguais no funil e na lista (no funil, a fase não se aplica: o quadro mostra todas). */
export function FiltrosDeProjetos({ filtros, usuarios, comFase }: { filtros: FiltrosProjetos; usuarios: { id: string; nome: string }[]; comFase: boolean }) {
  return (
    <>
      {comFase ? (
        <FiltroSelect
          nome="status"
          rotulo="Fase"
          valor={filtros.status}
          opcoes={[{ valor: "abertos", rotulo: "Em aberto (funil)" }, ...TODOS_OS_STATUS.map((s) => ({ valor: s, rotulo: ROTULO_STATUS_PROJETO[s] }))]}
        />
      ) : null}
      <FiltroSelect nome="responsavel" rotulo="Responsável" valor={filtros.responsavelId} opcoes={usuarios.map((u) => ({ valor: u.id, rotulo: u.nome }))} />
      <FiltroSelect nome="origem" rotulo="Origem" valor={filtros.origem} opcoes={ORIGENS.map((o) => ({ valor: o, rotulo: ROTULO_ORIGEM[o] }))} />
      <FiltroSelect nome="porte" rotulo="Porte" valor={filtros.porte} opcoes={PORTES.map((p) => ({ valor: p, rotulo: ROTULO_PORTE[p] }))} />
      <FiltroSelect nome="temperatura" rotulo="Temperatura" valor={filtros.temperatura} opcoes={TEMPERATURAS.map((t) => ({ valor: t, rotulo: ROTULO_TEMPERATURA[t] }))} />
      <FiltroSelect nome="semRetorno" rotulo="Acompanhamento" valor={filtros.semRetorno ? "1" : undefined} opcoes={[{ valor: "1", rotulo: "Sem retorno" }]} />
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">Criados a partir de</span>
        <input type="date" name="de" defaultValue={filtros.de ?? ""} className={estiloData} />
      </label>
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">Criados até</span>
        <input type="date" name="ate" defaultValue={filtros.ate ?? ""} className={estiloData} />
      </label>
    </>
  );
}

export function haFiltroDeProjeto(busca: string, filtros: FiltrosProjetos, comFase: boolean): boolean {
  return !!(busca || (comFase && filtros.status) || filtros.responsavelId || filtros.origem || filtros.porte || filtros.temperatura || filtros.semRetorno || filtros.clienteId || filtros.de || filtros.ate);
}

/** Parâmetros atuais da lista, no formato da URL (sem o que é padrão). */
export function parametrosDosFiltros(filtros: FiltrosProjetos) {
  return {
    status: filtros.status,
    responsavel: filtros.responsavelId,
    origem: filtros.origem,
    porte: filtros.porte,
    temperatura: filtros.temperatura,
    semRetorno: filtros.semRetorno ? "1" : undefined,
    cliente: filtros.clienteId,
    de: filtros.de,
    ate: filtros.ate,
  };
}
