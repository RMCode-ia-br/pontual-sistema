"use client";

import { AlertTriangle, Clock, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { AreaTexto, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { vinculoExigido } from "@/lib/dominio/agenda";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { useProtecaoDeSaida } from "@/lib/hooks/usar-protecao-de-saida";
import { CampoCliente } from "@/modules/clientes/components/campo-cliente";
import { listarEnderecosDoCliente, type EnderecoParaEscolha } from "@/modules/projetos/actions/consultas";

import { sugerirHorarios, type HorarioLivre, type ProjetoParaEscolha } from "../actions/consultas";
import { criarEvento, editarEvento } from "../actions/eventos";
import { OPCOES_LEMBRETE, ROTULO_TIPO_EVENTO, TIPOS_EVENTO, type TipoEvento } from "../schemas";
import { CampoProjeto } from "./campo-projeto";

export type EventoParaForm = {
  id: string;
  tipo: TipoEvento;
  titulo: string | null;
  /** `aaaa-mm-ddTHH:mm` no horário de São Paulo. */
  inicio: string;
  duracaoMin: number;
  responsavelId: string | null;
  equipeId: string | null;
  clienteId: string | null;
  clienteNome: string | null;
  projeto: { id: string; rotulo: string } | null;
  enderecoId: string | null;
  local: string | null;
  lembreteMin: number | null;
  observacoes: string | null;
};

type Props = {
  evento?: EventoParaForm;
  usuarios: { id: string; nome: string }[];
  equipes: { id: string; nome: string }[];
  usuarioAtualId: string;
  duracaoPadraoMin: number;
  /** Horário sugerido ao abrir "novo" (clicou num dia ou horário da agenda). */
  inicioInicial?: string;
  tipoInicial?: TipoEvento;
  projetoInicial?: ProjetoParaEscolha | null;
  /** Equipe já escolhida ao abrir "novo" (vem da etapa da obra no calendário de instalação). */
  equipeInicial?: string;
  /** Etapa da obra que este compromisso cumpre (vai oculta no envio; só vale na criação). */
  etapaInicial?: { id: string; nome: string } | null;
};

export function FormEvento({ evento, usuarios, equipes, usuarioAtualId, duracaoPadraoMin, inicioInicial, tipoInicial, projetoInicial = null, equipeInicial, etapaInicial = null }: Props) {
  const router = useRouter();
  const editando = !!evento;
  const formulario = useRef<HTMLFormElement>(null);
  const confirmado = useRef(false);
  const [sujo, setSujo] = useState(false);
  useProtecaoDeSaida(sujo);

  const [tipo, setTipo] = useState<TipoEvento>(evento?.tipo ?? tipoInicial ?? "VISITA_TECNICA");
  const [inicio, setInicio] = useState(evento?.inicio ?? inicioInicial ?? "");
  const [duracao, setDuracao] = useState(String(evento?.duracaoMin ?? duracaoPadraoMin));
  const [responsavelId, setResponsavelId] = useState(evento ? (evento.responsavelId ?? "") : usuarioAtualId);
  const [equipeId, setEquipeId] = useState(evento?.equipeId ?? equipeInicial ?? "");
  const [projeto, setProjeto] = useState<{ id: string; clienteId: string } | null>(
    evento?.projeto ? { id: evento.projeto.id, clienteId: evento.clienteId ?? "" } : projetoInicial ? { id: projetoInicial.id, clienteId: projetoInicial.clienteId } : null,
  );
  const [clienteId, setClienteId] = useState(evento?.clienteId ?? projetoInicial?.clienteId ?? "");
  const [enderecos, setEnderecos] = useState<EnderecoParaEscolha[]>([]);
  const [enderecoId, setEnderecoId] = useState(evento?.enderecoId ?? projetoInicial?.enderecoObraId ?? "");
  const [livres, setLivres] = useState<{ chave: string; horarios: HorarioLivre[] } | null>(null);
  const [buscandoHorarios, iniciarBusca] = useTransition();

  const exigido = vinculoExigido(tipo);

  // Os endereços oferecidos são os do cliente (o do projeto escolhido, ou o cliente solto da reunião/assistência).
  useEffect(() => {
    if (!clienteId) return;
    let cancelado = false;
    void listarEnderecosDoCliente(clienteId).then((r) => {
      if (!cancelado) setEnderecos(r.ok && r.dados ? r.dados : []);
    });
    return () => {
      cancelado = true;
    };
  }, [clienteId]);

  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<{ id: string }>(
    (formData) => {
      formData.set("confirmarAvisos", confirmado.current ? "1" : "");
      confirmado.current = false;
      return editando ? editarEvento(null, formData) : criarEvento(null, formData);
    },
    (r) => {
      if (r.ok && r.dados) {
        setSujo(false);
        toast.success(r.mensagem ?? "Salvo.");
        const dia = inicio.slice(0, 10);
        setTimeout(() => router.push(editando ? `/agenda/${r.dados!.id}` : `/agenda?vista=semana&data=${dia}`), 0);
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const avisos = erros._avisos ? erros._avisos.split("\n") : [];

  function verHorariosLivres() {
    const data = inicio.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      toast.message("Escolha primeiro a data do compromisso.");
      return;
    }
    iniciarBusca(async () => {
      const r = await sugerirHorarios({ data, duracaoMin: Number(duracao) || duracaoPadraoMin, responsavelId: responsavelId || undefined, equipeId: equipeId || undefined });
      setLivres({ chave: data, horarios: r.ok && r.dados ? r.dados : [] });
    });
  }

  return (
    <form
      ref={formulario}
      onSubmit={aoEnviar}
      onChange={() => {
        setSujo(true);
        setLivres(null);
      }}
      className="grid gap-5"
    >
      {evento ? <input type="hidden" name="id" value={evento.id} /> : null}
      {!evento && etapaInicial ? <input type="hidden" name="etapaProjetoId" value={etapaInicial.id} /> : null}
      {!evento && etapaInicial ? (
        <p className="bg-muted/50 rounded-lg p-3 text-sm" role="note">
          Este compromisso cumpre a etapa <strong>{etapaInicial.nome}</strong> da obra.
        </p>
      ) : null}

      {avisos.length > 0 ? (
        <div role="alert" className="grid gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden /> Atenção antes de agendar
          </p>
          <ul className="grid list-disc gap-1 pl-5">
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                confirmado.current = true;
                formulario.current?.requestSubmit();
              }}
            >
              {editando ? "Salvar assim mesmo" : "Agendar assim mesmo"}
            </Button>
            <span className="text-muted-foreground self-center text-xs">ou ajuste o horário/responsável acima.</span>
          </div>
        </div>
      ) : null}

      <section aria-labelledby="sec-compromisso" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-compromisso" className="font-medium sm:col-span-2">
          Compromisso
        </h2>
        <Campo id="tipo" rotulo="Tipo" erro={erros.tipo} obrigatorio>
          <Selecao id="tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoEvento)} {...ariaDoCampo("tipo", erros.tipo)}>
            {TIPOS_EVENTO.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_EVENTO[t]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="titulo" rotulo="Título (opcional)" erro={erros.titulo} dica="Sem título, a agenda mostra o tipo e o nome do cliente.">
          <Input id="titulo" name="titulo" maxLength={160} defaultValue={evento?.titulo ?? ""} autoComplete="off" {...ariaDoCampo("titulo", erros.titulo)} />
        </Campo>

        <Campo id="projetoId" rotulo={exigido === "projeto" ? "Projeto" : "Projeto (opcional)"} erro={erros.projetoId} obrigatorio={exigido === "projeto"} className="sm:col-span-2">
          <CampoProjeto
            id="projetoId"
            name="projetoId"
            inicial={evento?.projeto ?? (projetoInicial ? { id: projetoInicial.id, rotulo: projetoInicial.rotulo } : null)}
            aoMudar={(p) => {
              setSujo(true);
              setProjeto(p ? { id: p.id, clienteId: p.clienteId } : null);
              setClienteId(p?.clienteId ?? "");
              setEnderecoId(p?.enderecoObraId ?? "");
            }}
          />
        </Campo>
        {!projeto && exigido !== "projeto" ? (
          <Campo id="clienteId" rotulo="Cliente" erro={erros.clienteId} className="sm:col-span-2">
            <CampoCliente
              id="clienteId"
              name="clienteId"
              inicial={evento?.clienteId && evento.clienteNome ? { id: evento.clienteId, nome: evento.clienteNome } : null}
              aoMudar={(c) => {
                setSujo(true);
                setClienteId(c?.id ?? "");
                setEnderecoId("");
              }}
            />
          </Campo>
        ) : null}
      </section>

      <section aria-labelledby="sec-quando" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-quando" className="font-medium sm:col-span-2">
          Quando e quem
        </h2>
        <Campo id="inicio" rotulo="Data e hora" erro={erros.inicio} obrigatorio>
          <Input id="inicio" name="inicio" type="datetime-local" required value={inicio} onChange={(e) => setInicio(e.target.value)} {...ariaDoCampo("inicio", erros.inicio)} />
        </Campo>
        <Campo id="duracaoMin" rotulo="Duração (minutos)" erro={erros.duracaoMin} obrigatorio>
          <Input id="duracaoMin" name="duracaoMin" required inputMode="numeric" maxLength={4} value={duracao} onChange={(e) => setDuracao(e.target.value.replace(/\D/g, ""))} {...ariaDoCampo("duracaoMin", erros.duracaoMin)} />
        </Campo>
        <Campo id="responsavelId" rotulo="Responsável" erro={erros.responsavelId}>
          <Selecao id="responsavelId" name="responsavelId" value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} {...ariaDoCampo("responsavelId", erros.responsavelId)}>
            <option value="">Sem responsável</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="equipeId" rotulo="Equipe (opcional)" erro={erros.equipeId}>
          <Selecao id="equipeId" name="equipeId" value={equipeId} onChange={(e) => setEquipeId(e.target.value)} {...ariaDoCampo("equipeId", erros.equipeId)}>
            <option value="">Nenhuma</option>
            {equipes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.nome}
              </option>
            ))}
          </Selecao>
        </Campo>

        <div className="grid gap-2 sm:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={verHorariosLivres} disabled={buscandoHorarios}>
              {buscandoHorarios ? <Loader2 className="animate-spin" aria-hidden /> : <Clock aria-hidden />} Ver horários livres
            </Button>
            <span className="text-muted-foreground text-xs">Dentro do expediente, sem tocar em outros compromissos do responsável ou da equipe.</span>
          </div>
          {livres ? (
            livres.horarios.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum horário livre nesse dia. Tente outra data ou outro responsável.</p>
            ) : (
              <ul className="flex flex-wrap gap-2" aria-label="Horários livres">
                {livres.horarios.map((h) => (
                  <li key={h.valor}>
                    <Button
                      type="button"
                      size="sm"
                      variant={h.valor === inicio ? "default" : "secondary"}
                      onClick={() => {
                        setInicio(h.valor);
                        setSujo(true);
                      }}
                    >
                      {h.rotulo}
                    </Button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      </section>

      <section aria-labelledby="sec-onde" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-onde" className="font-medium sm:col-span-2">
          Onde e lembrete
        </h2>
        <Campo id="enderecoId" rotulo="Endereço do cliente" erro={erros.enderecoId} dica={clienteId && enderecos.length === 0 ? "Esse cliente ainda não tem endereço cadastrado." : undefined}>
          <Selecao id="enderecoId" name="enderecoId" value={enderecoId} onChange={(e) => setEnderecoId(e.target.value)} disabled={!clienteId} {...ariaDoCampo("enderecoId", erros.enderecoId)}>
            <option value="">{clienteId ? "Nenhum" : "Escolha o projeto ou o cliente"}</option>
            {(clienteId ? enderecos : []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="local" rotulo="Local (opcional)" erro={erros.local} dica="Sem texto aqui, vale o endereço escolhido ao lado.">
          <Input id="local" name="local" maxLength={300} defaultValue={evento?.local ?? ""} autoComplete="off" {...ariaDoCampo("local", erros.local)} />
        </Campo>
        <Campo id="lembreteMin" rotulo="Lembrete" erro={erros.lembreteMin} dica="Aparece no calendário assinado (.ics).">
          <Selecao id="lembreteMin" name="lembreteMin" defaultValue={evento ? String(evento.lembreteMin ?? "") : tipo === "VISITA_TECNICA" ? "1440" : ""} {...ariaDoCampo("lembreteMin", erros.lembreteMin)}>
            {OPCOES_LEMBRETE.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="observacoes" rotulo="Observações (opcional)" erro={erros.observacoes} className="sm:col-span-2">
          <AreaTexto id="observacoes" name="observacoes" maxLength={2000} rows={3} defaultValue={evento?.observacoes ?? ""} {...ariaDoCampo("observacoes", erros.observacoes)} />
        </Campo>
      </section>

      {estado && !estado.ok && Object.keys(erros).length === 0 ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.erro}
        </p>
      ) : null}

      <div className="bg-background/95 sticky bottom-14 z-10 -mx-1 flex flex-wrap gap-2 border-t px-1 py-3 backdrop-blur md:bottom-0">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {editando ? "Salvar alterações" : "Agendar"}
        </Button>
        <Link href={editando ? `/agenda/${evento.id}` : "/agenda"} className="inline-flex h-8 items-center px-3 text-sm hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
