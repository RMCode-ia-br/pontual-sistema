"use client";

import { ImagePlus, Loader2, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ROTULO_DO_TAMANHO, TAMANHOS_DO_DESENHO, type TamanhoDoDesenho } from "@/lib/dominio/desenho-item";
import { conferirArquivoNoNavegador, DICA_DO_DESENHO, escolherImagem, MENSAGEM_COLAGEM_SEM_IMAGEM, MENSAGEM_FORMATO_NAO_ACEITO, ORIENTACAO_DO_WORD } from "@/lib/imagem/colagem";

import { removerDesenhoDoItemAcao } from "../actions/desenho";
import type { ItemSer } from "../tipos";
import { enviarDesenhoDoItem } from "./desenho-envio";

type Props = {
  propostaId: string;
  /** Id do item (pode passar a existir depois de salvar um item novo). null = item novo ainda não salvo. */
  itemId: string | null;
  desenhoInicial: ItemSer["desenho"];
  /** Desenho automático da tipologia (o que a proposta usa enquanto não houver imagem). */
  automatico: ReactNode;
  tamanho: TamanhoDoDesenho;
  aoMudarTamanho: (t: TamanhoDoDesenho) => void;
  /** Item novo: a imagem escolhida fica aqui (no cliente) até o item ser salvo; aí o formulário a envia. */
  pendente: File | null;
  aoEscolherPendente: (arquivo: File | null) => void;
  /** Mensagem de "o item foi salvo, mas o desenho não foi enviado" (o item NUNCA se perde). */
  avisoDeFalha: string | null;
  /** O formulário está enviando a imagem pendente (logo depois de salvar o item). */
  enviandoPendente: boolean;
  /** A imagem pendente foi enviada com sucesso (pelo "Tentar de novo"): o formulário limpa pendência e aviso. */
  aoEnviado: () => void;
  /** Avisa o formulário se há um envio em andamento (o diálogo não fecha enquanto isso). */
  aoOcupar: (ocupado: boolean) => void;
  /** Avisa o formulário qual é a imagem atual (para a prévia ao lado), sem passar função do servidor. */
  aoMudar: (previaUrl: string | null, personalizado: boolean) => void;
};

type Atual = { anexoId: string; previaUrl: string | null };

/**
 * Desenho personalizado do item: cola (Ctrl+V), arrasta ou escolhe PNG/JPG.
 * - Item JÁ salvo: cada troca é gravada na hora no servidor e só vira o desenho atual quando o servidor confirma (se falhar,
 *   o desenho anterior continua valendo).
 * - Item NOVO: a imagem fica no cliente com prévia local (revogada ao sair) e é enviada automaticamente ao salvar o item.
 */
export function DesenhoPersonalizado({ propostaId, itemId, desenhoInicial, automatico, tamanho, aoMudarTamanho, pendente, aoEscolherPendente, avisoDeFalha, enviandoPendente, aoEnviado, aoOcupar, aoMudar }: Props) {
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

  // Libera as prévias locais ao sair (fechar o diálogo).
  useEffect(() => {
    const lista = blobs.current;
    return () => lista.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  // Prévia local da imagem pendente (URL de objeto): criada ao escolher e revogada ao trocar, tirar ou sair.
  const previaPendente = useMemo(() => (pendente ? URL.createObjectURL(pendente) : null), [pendente]);
  useEffect(() => {
    return () => {
      if (previaPendente) URL.revokeObjectURL(previaPendente);
    };
  }, [previaPendente]);

  // O formulário mostra a imagem de cima na coluna ao lado: pendente > salva.
  useEffect(() => {
    if (previaPendente) aoMudar(previaPendente, true);
  }, [previaPendente, aoMudar]);

  useEffect(() => {
    if (!pendente && !atual) aoMudar(null, false);
  }, [pendente, atual, aoMudar]);

  const emAndamento = enviando || removendo || enviandoPendente;
  useEffect(() => {
    aoOcupar(enviando || removendo);
  }, [enviando, removendo, aoOcupar]);

  async function enviar(arquivo: File) {
    if (!itemId || ocupado.current) return;
    ocupado.current = true;
    setErro(null);
    setEnviando(true);
    try {
      const r = await enviarDesenhoDoItem({ propostaId, itemId, arquivo, temAnterior: temAnterior.current });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      const previa = URL.createObjectURL(arquivo);
      blobs.current.push(previa);
      setAtual({ anexoId: r.anexoId, previaUrl: previa });
      temAnterior.current = true;
      aoMudar(previa, true);
      aoEnviado();
      toast.success(r.mensagem);
      router.refresh();
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

  /** Imagem escolhida: item novo guarda no cliente (valida na hora); item salvo envia na hora. */
  function tratarArquivo(arquivo: File) {
    setErro(null);
    const problema = conferirArquivoNoNavegador(arquivo);
    if (problema) {
      setErro(problema);
      return;
    }
    if (!itemId) {
      aoEscolherPendente(arquivo);
      return;
    }
    void enviar(arquivo);
  }

  /** Recebe arquivos colados ou soltos e trata o primeiro PNG/JPG. Devolve true se a colagem foi "nossa". */
  function receber(arquivos: File[], dentroDaArea: boolean): boolean {
    const escolha = escolherImagem(arquivos);
    if (escolha.tipo === "imagem") {
      tratarArquivo(arquivos[escolha.indice]);
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
  // O ouvinte usa sempre a versão mais recente de `receber` (o estado muda: item salvo, imagem pendente...).
  const receberAtual = useRef(receber);
  useEffect(() => {
    receberAtual.current = receber;
  });
  useEffect(() => {
    function aoColar(e: ClipboardEvent) {
      const dentro = !!area.current?.contains(e.target as Node);
      const arquivos = Array.from(e.clipboardData?.files ?? []);
      if (arquivos.length === 0 && !dentro) return;
      if (receberAtual.current(arquivos, dentro)) e.preventDefault();
    }
    document.addEventListener("paste", aoColar);
    return () => document.removeEventListener("paste", aoColar);
  }, []);

  function aoSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    receber(Array.from(e.dataTransfer.files), true);
  }

  const temImagem = !!pendente || !!atual;
  const imagemParaMostrar = pendente ? previaPendente : atual?.previaUrl ?? null;
  const salvaMasSemEnviar = !!pendente && !!itemId; // o item foi salvo, mas a imagem não subiu

  return (
    <fieldset className="grid gap-3 rounded-lg border p-3" data-testid="desenho-personalizado">
      <legend className="px-1 text-sm font-medium">Desenho personalizado</legend>
      <div className="grid gap-3 sm:grid-cols-[11rem_1fr] sm:items-start">
        <div className="flex h-36 items-center justify-center overflow-hidden rounded-md border" aria-label={temImagem ? "Desenho personalizado deste item" : "Desenho automático deste item"}>
          {temImagem ? (
            imagemParaMostrar ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage (ou prévia local)
              <img src={imagemParaMostrar} alt="Desenho personalizado do item" className="size-full bg-white object-contain" data-testid="previa-desenho" />
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
          <p className="text-muted-foreground">
            {DICA_DO_DESENHO} Aceitamos PNG e JPG de até 8 MB.
          </p>
          <p className="text-muted-foreground text-xs">{ORIENTACAO_DO_WORD}</p>
          <p className="text-muted-foreground text-xs">
            {itemId ? "O desenho é salvo na hora, sem esperar o botão Salvar do item." : "A imagem fica aqui e é enviada quando você salvar o item."} Nenhuma cota é desenhada sobre a imagem.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-8" disabled={emAndamento} onClick={() => entrada.current?.click()}>
              {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
              {temImagem ? "Trocar imagem" : "Colar ou escolher imagem"}
            </Button>
            {pendente && !itemId ? (
              <Button type="button" variant="ghost" className="min-h-11 sm:min-h-8" onClick={() => aoEscolherPendente(null)}>
                <X aria-hidden />
                Tirar imagem
              </Button>
            ) : null}
            {atual && !pendente ? (
              <Button type="button" variant="ghost" className="min-h-11 sm:min-h-8" disabled={emAndamento} onClick={() => void voltarAoAutomatico()}>
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
              if (arquivo) tratarArquivo(arquivo);
            }}
          />
          {pendente && !itemId ? (
            <p role="status" className="text-sm" data-testid="desenho-pendente">
              Imagem escolhida: {pendente.name || "imagem colada"}. Ela será enviada quando você salvar o item.
            </p>
          ) : null}
          {enviando || enviandoPendente ? (
            <p role="status" className="text-sm">
              Enviando…
            </p>
          ) : null}
          {salvaMasSemEnviar && avisoDeFalha && !enviando ? (
            <div role="alert" className="text-destructive grid gap-2 text-sm" data-testid="desenho-nao-enviado">
              <p>{avisoDeFalha}</p>
              <div>
                <Button type="button" variant="outline" className="min-h-11 sm:min-h-8" disabled={emAndamento} onClick={() => pendente && void enviar(pendente)}>
                  Tentar enviar de novo
                </Button>
              </div>
            </div>
          ) : null}
          {erro ? (
            <p role="alert" className="text-destructive text-sm">
              {erro}
            </p>
          ) : null}
        </div>
      </div>

      {temImagem ? (
        <fieldset className="grid gap-1" data-testid="tamanho-do-desenho">
          <legend className="text-sm font-medium">Tamanho do desenho no PDF</legend>
          <div className="flex flex-wrap gap-4">
            {TAMANHOS_DO_DESENHO.map((t) => (
              <label key={t} className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
                <input type="radio" name="tamanho-do-desenho" value={t} checked={tamanho === t} onChange={() => aoMudarTamanho(t)} />
                {ROTULO_DO_TAMANHO[t]}
              </label>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            Normal fica ao lado do texto, como o desenho automático. Grande ocupa mais espaço: o item pode ir inteiro para a página seguinte. O tamanho vale quando você salvar o item.
          </p>
        </fieldset>
      ) : null}
    </fieldset>
  );
}
