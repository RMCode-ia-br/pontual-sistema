"use client";

import { ImagePlus, Loader2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { conferirArquivoNoNavegador, escolherImagem, MENSAGEM_COLAGEM_SEM_IMAGEM, MENSAGEM_FORMATO_NAO_ACEITO } from "@/lib/imagem/colagem";

import { concluirUploadDesenho, iniciarUploadDesenho, removerDesenhoDoItemAcao } from "../actions/desenho";
import type { ItemSer } from "../tipos";

type Props = {
  propostaId: string;
  /** null = item novo, ainda não salvo (o desenho precisa de um item que já exista). */
  itemId: string | null;
  desenhoInicial: ItemSer["desenho"];
  /** Desenho automático da tipologia (o que a proposta usa enquanto não houver imagem). */
  automatico: ReactNode;
  /** Avisa o formulário do item qual é a imagem atual (para a prévia ao lado), sem passar função do servidor. */
  aoMudar: (previaUrl: string | null, personalizado: boolean) => void;
};

type Atual = { anexoId: string; previaUrl: string | null };

/**
 * Desenho personalizado do item: cola (Ctrl+V), arrasta ou escolhe PNG/JPG. Cada troca é gravada NA HORA no servidor
 * (não espera o botão Salvar do item) e só vira o desenho atual quando o servidor confirma: se o envio ou a conclusão
 * falhar, o desenho anterior continua valendo.
 */
export function DesenhoPersonalizado({ propostaId, itemId, desenhoInicial, automatico, aoMudar }: Props) {
  const router = useRouter();
  const [atual, setAtual] = useState<Atual | null>(desenhoInicial ? { anexoId: desenhoInicial.anexoId, previaUrl: desenhoInicial.url } : null);
  const [enviando, setEnviando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const ocupado = useRef(false);
  const blobs = useRef<string[]>([]);
  /** Se já há um desenho personalizado salvo (o ouvinte de colar não enxerga o estado novo, por isso a ref). */
  const temAnterior = useRef(!!desenhoInicial);

  // Libera as prévias locais ao fechar o diálogo.
  useEffect(() => {
    const lista = blobs.current;
    return () => lista.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  async function enviar(arquivo: File) {
    if (!itemId || ocupado.current) return;
    setErro(null);
    const problema = conferirArquivoNoNavegador(arquivo);
    if (problema) {
      setErro(problema);
      return;
    }
    ocupado.current = true;
    setEnviando(true);
    try {
      const inicio = await iniciarUploadDesenho({ propostaId, itemId, mime: arquivo.type, tamanhoBytes: arquivo.size });
      if (!inicio.ok || !inicio.dados) {
        setErro(inicio.ok ? "Não foi possível preparar o envio." : inicio.erro);
        return;
      }
      // Mesmo formato que o SDK do Supabase usa para URLs assinadas de upload.
      const corpo = new FormData();
      corpo.append("cacheControl", "3600");
      corpo.append("", arquivo);
      const resposta = await fetch(inicio.dados.url, { method: "PUT", body: corpo, headers: { "x-upsert": "false" } });
      if (!resposta.ok) {
        setErro(`O envio da imagem falhou. Confira a conexão e tente de novo.${temAnterior.current ? " O desenho anterior foi mantido." : ""}`);
        return;
      }
      const fim = await concluirUploadDesenho({ propostaId, itemId, caminho: inicio.dados.caminho });
      if (!fim.ok || !fim.dados) {
        setErro(`${fim.ok ? "Não foi possível salvar o desenho." : fim.erro}${temAnterior.current ? " O desenho anterior foi mantido." : ""}`);
        return;
      }
      const previa = URL.createObjectURL(arquivo);
      blobs.current.push(previa);
      setAtual({ anexoId: fim.dados.anexoId, previaUrl: previa });
      temAnterior.current = true;
      aoMudar(previa, true);
      toast.success(fim.mensagem ?? "Desenho personalizado salvo.");
      router.refresh();
    } catch {
      setErro("Não foi possível enviar a imagem. Confira a conexão e tente de novo.");
    } finally {
      ocupado.current = false;
      setEnviando(false);
    }
  }

  async function voltarAoAutomatico() {
    if (!itemId || ocupado.current) return;
    ocupado.current = true;
    setErro(null);
    setRemovendo(true);
    try {
      const r = await removerDesenhoDoItemAcao({ propostaId, itemId });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setAtual(null);
      temAnterior.current = false;
      aoMudar(null, false);
      toast.success(r.mensagem ?? "Voltou ao desenho automático.");
      router.refresh();
    } catch {
      setErro("Não foi possível voltar ao desenho automático. Tente de novo.");
    } finally {
      ocupado.current = false;
      setRemovendo(false);
    }
  }

  /** Recebe arquivos colados ou soltos e manda o primeiro PNG/JPG. */
  function receber(arquivos: File[], dentroDaArea: boolean): boolean {
    const escolha = escolherImagem(arquivos);
    if (escolha.tipo === "imagem") {
      void enviar(arquivos[escolha.indice]);
      return true;
    }
    if (escolha.tipo === "formato-nao-aceito") {
      setErro(MENSAGEM_FORMATO_NAO_ACEITO);
      return true;
    }
    // Sem imagem: só reclama se a pessoa colou DENTRO da área (texto colado nos outros campos segue normal).
    if (dentroDaArea) {
      setErro(MENSAGEM_COLAGEM_SEM_IMAGEM);
      return true;
    }
    return false;
  }

  // Ctrl+V com o diálogo aberto: imagem colada vira o desenho, em qualquer campo; texto colado não é tocado.
  useEffect(() => {
    if (!itemId) return;
    function aoColar(e: ClipboardEvent) {
      const dentro = !!area.current?.contains(e.target as Node);
      const arquivos = Array.from(e.clipboardData?.files ?? []);
      if (arquivos.length === 0 && !dentro) return;
      if (receber(arquivos, dentro)) e.preventDefault();
    }
    document.addEventListener("paste", aoColar);
    return () => document.removeEventListener("paste", aoColar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  function aoSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    receber(Array.from(e.dataTransfer.files), true);
  }

  if (!itemId) {
    return (
      <fieldset className="grid gap-1 rounded-lg border border-dashed p-3">
        <legend className="px-1 text-sm font-medium">Desenho personalizado</legend>
        <p className="text-muted-foreground text-sm">Salve o item para adicionar um desenho personalizado. Até lá, a proposta usa o desenho automático da tipologia.</p>
      </fieldset>
    );
  }

  const ocupadoAgora = enviando || removendo;
  return (
    <fieldset className="grid gap-3 rounded-lg border p-3" data-testid="desenho-personalizado">
      <legend className="px-1 text-sm font-medium">Desenho personalizado</legend>
      <div className="grid gap-3 sm:grid-cols-[11rem_1fr] sm:items-start">
        <div className="flex h-36 items-center justify-center overflow-hidden rounded-md border" aria-label={atual ? "Desenho personalizado deste item" : "Desenho automático deste item"}>
          {atual ? (
            atual.previaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage (ou prévia local)
              <img src={atual.previaUrl} alt="Desenho personalizado do item" className="size-full bg-white object-contain" data-testid="previa-desenho" />
            ) : (
              <p className="text-muted-foreground p-2 text-center text-xs">Prévia indisponível agora. O desenho está salvo.</p>
            )
          ) : (
            <div className="w-32" aria-hidden>
              {automatico}
            </div>
          )}
        </div>

        <div
          ref={area}
          tabIndex={0}
          role="group"
          aria-label="Colar ou escolher imagem do desenho"
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={aoSoltar}
          className={`grid gap-2 rounded-md border border-dashed p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${arrastando ? "border-primary bg-primary/5" : ""}`}
        >
          <p className="text-muted-foreground">Você pode copiar o desenho do Word e colar aqui com Ctrl+V. Também dá para arrastar a imagem para cá. Aceitamos PNG e JPG de até 8 MB.</p>
          <p className="text-muted-foreground text-xs">O desenho é salvo na hora, sem esperar o botão Salvar do item. Nenhuma cota é desenhada sobre a imagem.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-8" disabled={ocupadoAgora} onClick={() => entrada.current?.click()}>
              {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
              {atual ? "Trocar imagem" : "Colar ou escolher imagem"}
            </Button>
            {atual ? (
              <Button type="button" variant="ghost" className="min-h-11 sm:min-h-8" disabled={ocupadoAgora} onClick={() => void voltarAoAutomatico()}>
                {removendo ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />}
                Voltar ao desenho automático
              </Button>
            ) : null}
          </div>
          <input
            ref={entrada}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            tabIndex={-1}
            data-testid="entrada-desenho"
            aria-label="Escolher arquivo de imagem do desenho"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              e.target.value = ""; // permite escolher o mesmo arquivo de novo
              if (arquivo) void enviar(arquivo);
            }}
          />
          {enviando ? (
            <p role="status" className="text-sm">
              Enviando…
            </p>
          ) : null}
          {erro ? (
            <p role="alert" className="text-destructive text-sm">
              {erro}
            </p>
          ) : null}
        </div>
      </div>
    </fieldset>
  );
}
