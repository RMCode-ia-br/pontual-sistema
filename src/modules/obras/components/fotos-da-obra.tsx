"use client";

import { Camera, ImageOff, Loader2, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmarAcao } from "@/components/confirmar-acao";
import { AreaTexto, CaixaMarcacao, Campo, Selecao } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CATEGORIA_FOTO_DE_OBRA, MOMENTOS_DA_FOTO, ROTULO_MOMENTO, type MomentoDaFoto } from "@/lib/dominio/portfolio";
import { formatarDataHora } from "@/lib/formatadores";
import { excluirAnexo } from "@/modules/anexos/actions";
import { enviarAnexo } from "@/modules/anexos/components/anexos";

import { atualizarFoto, definirAutorizacaoDoCliente } from "../actions/fotos";
import type { FotoDaObra } from "../queries-fotos";

type Props = { projetoId: string; fotos: FotoDaObra[]; autorizaPortfolio: boolean };

/** Fotos antes, durante e depois da obra. As marcadas "No portfólio" alimentam a Galeria de obras (se o cliente autoriza). */
export function FotosDaObra({ projetoId, fotos, autorizaPortfolio }: Props) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [momentoNovo, setMomentoNovo] = useState<MomentoDaFoto>("DURANTE");
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState<FotoDaObra | null>(null);
  const [excluindo, setExcluindo] = useState<FotoDaObra | null>(null);
  const [pendente, iniciar] = useTransition();

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (arquivos.length === 0) return;
    setEnviando(true);
    let enviadas = 0;
    for (const arquivo of arquivos) {
      try {
        await enviarAnexo("Projeto", projetoId, arquivo, CATEGORIA_FOTO_DE_OBRA, { momento: momentoNovo, usarNoPortfolio: true });
        enviadas++;
      } catch (erro) {
        toast.error(`${arquivo.name}: ${erro instanceof Error ? erro.message : "falha no envio."}`);
      }
    }
    setEnviando(false);
    if (enviadas > 0) {
      toast.success(enviadas === 1 ? "Foto enviada." : `${enviadas} fotos enviadas.`);
      router.refresh();
    }
  }

  function mudar(foto: FotoDaObra, parte: { momento?: MomentoDaFoto; usarNoPortfolio?: boolean }) {
    iniciar(async () => {
      const r = await atualizarFoto({ anexoId: foto.id, ...parte });
      if (r.ok) router.refresh();
      else toast.error(r.erro);
    });
  }

  function mudarAutorizacao(autoriza: boolean) {
    iniciar(async () => {
      const r = await definirAutorizacaoDoCliente({ projetoId, autoriza });
      if (r.ok) {
        toast.success(r.mensagem ?? "Salvo.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  function remover() {
    const alvo = excluindo;
    if (!alvo) return;
    iniciar(async () => {
      const r = await excluirAnexo(alvo.id);
      setExcluindo(null);
      if (r.ok) {
        toast.success("Foto removida.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  return (
    <section aria-labelledby="titulo-fotos" className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="titulo-fotos" className="font-medium">
            Fotos da obra
          </h2>
          <p className="text-muted-foreground text-sm">Registre antes, durante e depois. As marcadas “No portfólio” vão para a Galeria de obras.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Momento das próximas fotos</span>
            <Selecao value={momentoNovo} onChange={(e) => setMomentoNovo(e.target.value as MomentoDaFoto)} className="h-9">
              {MOMENTOS_DA_FOTO.map((m) => (
                <option key={m} value={m}>
                  {ROTULO_MOMENTO[m]}
                </option>
              ))}
            </Selecao>
          </label>
          <Button type="button" onClick={() => entrada.current?.click()} disabled={enviando}>
            {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
            {enviando ? "Enviando..." : "Enviar fotos"}
          </Button>
          <input ref={entrada} type="file" multiple accept="image/*" className="sr-only" tabIndex={-1} aria-label="Escolher fotos da obra para enviar" onChange={aoEscolher} data-testid="entrada-foto" />
        </div>
      </div>

      <div className="rounded-xl border p-3">
        <CaixaMarcacao
          id="autoriza-portfolio"
          rotulo="O cliente autoriza usar as fotos desta obra no portfólio (site e Instagram)"
          checked={autorizaPortfolio}
          disabled={pendente}
          onChange={(e) => mudarAutorizacao(e.target.checked)}
        />
        {autorizaPortfolio ? null : <p className="text-muted-foreground mt-1 text-sm">Sem a autorização, as fotos desta obra não aparecem na Galeria de obras nem entram no kit de postagem.</p>}
      </div>

      {fotos.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">Nenhuma foto ainda. Envie as fotos do antes, do andamento e do depois da obra (até 10 MB cada; elas são reduzidas antes de enviar).</p>
      ) : (
        MOMENTOS_DA_FOTO.map((momento) => {
          const doMomento = fotos.filter((f) => f.momento === momento);
          if (doMomento.length === 0) return null;
          return (
            <div key={momento} className="grid gap-2" role="group" aria-label={`Fotos: ${ROTULO_MOMENTO[momento]}`}>
              <h3 className="text-sm font-medium">
                {ROTULO_MOMENTO[momento]} <span className="text-muted-foreground font-normal">({doMomento.length})</span>
              </h3>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {doMomento.map((f) => (
                  <li key={f.id} className="grid content-start gap-2 rounded-xl border p-2">
                    <a href={f.url ?? undefined} target="_blank" rel="noopener noreferrer" aria-label={`Abrir a foto ${f.nome}`} className="bg-muted block aspect-4/3 overflow-hidden rounded-lg">
                      {f.url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage
                        <img src={f.url} alt={f.descricao ?? `Foto ${ROTULO_MOMENTO[momento].toLowerCase()} da obra`} loading="lazy" className="size-full object-cover" />
                      ) : (
                        <span className="text-muted-foreground flex size-full flex-col items-center justify-center gap-1 text-xs">
                          <ImageOff className="size-5" aria-hidden /> Imagem indisponível
                        </span>
                      )}
                    </a>
                    <p className="text-muted-foreground line-clamp-2 text-xs">{f.descricao ?? formatarDataHora(f.criadoEm)}</p>
                    <Selecao value={f.momento ?? ""} disabled={pendente} onChange={(e) => mudar(f, { momento: e.target.value as MomentoDaFoto })} aria-label={`Momento da foto ${f.nome}`} className="h-8 text-xs">
                      {MOMENTOS_DA_FOTO.map((m) => (
                        <option key={m} value={m}>
                          {ROTULO_MOMENTO[m]}
                        </option>
                      ))}
                    </Selecao>
                    <CaixaMarcacao id={`portfolio-${f.id}`} rotulo="No portfólio" checked={f.usarNoPortfolio} disabled={pendente} onChange={(e) => mudar(f, { usarNoPortfolio: e.target.checked })} className="min-h-7 text-xs" />
                    <div className="flex gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(f)} aria-label={`Descrição da foto ${f.nome}`}>
                        <Pencil aria-hidden /> Descrição
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setExcluindo(f)} aria-label={`Remover a foto ${f.nome}`}>
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}

      {editando ? <DialogoDeDescricao key={editando.id} foto={editando} aoFechar={() => setEditando(null)} /> : null}
      <ConfirmarAcao
        aberto={!!excluindo}
        aoFechar={() => setExcluindo(null)}
        titulo="Remover a foto?"
        descricao="Ela deixa de aparecer na obra e na galeria. O histórico fica registrado na auditoria."
        botao="Remover"
        pendente={pendente}
        aoConfirmar={remover}
      />
    </section>
  );
}

function DialogoDeDescricao({ foto, aoFechar }: { foto: FotoDaObra; aoFechar: () => void }) {
  const router = useRouter();
  const [texto, setTexto] = useState(foto.descricao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await atualizarFoto({ anexoId: foto.id, descricao: texto.trim() || null });
      if (r.ok) {
        toast.success("Descrição salva.");
        aoFechar();
        router.refresh();
      } else setErro(r.erro);
    });
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !pendente && aoFechar()}>
      <DialogContent>
        <form onSubmit={salvar} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Descrição da foto</DialogTitle>
            <DialogDescription>Uma frase curta para identificar a foto. Não coloque nome, telefone nem endereço do cliente: a descrição pode ser usada em postagens.</DialogDescription>
          </DialogHeader>
          <Campo id="descricao-foto" rotulo="Descrição (opcional)">
            <AreaTexto id="descricao-foto" rows={3} maxLength={300} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </Campo>
          {erro ? (
            <p role="alert" className="text-destructive text-sm">
              {erro}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
