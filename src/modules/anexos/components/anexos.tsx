"use client";

import { Download, File as IconeArquivo, FileImage, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
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
import { Button } from "@/components/ui/button";
import { formatarDataHora } from "@/lib/formatadores";
import { TIPOS_PERMITIDOS, validarArquivo, type EntidadeComAnexo } from "@/lib/storage/regras";

import { concluirUploadAnexo, excluirAnexo, iniciarUploadAnexo, urlDeDownloadAnexo } from "../actions";
import type { AnexoItem } from "../queries";

const LADO_MAXIMO_IMAGEM_PX = 1600;
const TAMANHO_MAXIMO_ANTES_DE_COMPRIMIR_BYTES = 60 * 1024 * 1024;

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Imagens são reduzidas no navegador (lado maior ~1600 px) antes do envio; outros tipos seguem como estão. */
export async function prepararArquivo(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith("image/") || arquivo.type === "image/gif") return arquivo;
  try {
    const { default: comprimir } = await import("browser-image-compression");
    const reduzido = await comprimir(arquivo, {
      maxWidthOrHeight: LADO_MAXIMO_IMAGEM_PX,
      maxSizeMB: 2,
      useWebWorker: true,
      initialQuality: 0.85,
    });
    // Mantém o nome original e nunca devolve algo maior que o original.
    return reduzido.size < arquivo.size ? new File([reduzido], arquivo.name, { type: reduzido.type || arquivo.type }) : arquivo;
  } catch {
    return arquivo;
  }
}

/**
 * Envia um arquivo ao bucket privado: valida, pede a URL assinada ao servidor, envia direto ao
 * Storage (não passa por Server Action) e registra o anexo. Devolve o ID do anexo ou lança Error.
 */
export async function enviarAnexo(entidadeTipo: EntidadeComAnexo, entidadeId: string, original: File, categoria?: string): Promise<string> {
  // Foto de celular novo passa dos 10 MB antes de comprimir: o limite vale para o arquivo FINAL.
  // Aqui só se barra o tipo e o absurdo (acima de 60 MB nem vale tentar comprimir).
  const tipoOk = validarArquivo(original.type, 1);
  if (!tipoOk.valido) throw new Error(tipoOk.motivo);
  if (original.size > TAMANHO_MAXIMO_ANTES_DE_COMPRIMIR_BYTES) throw new Error("O arquivo é grande demais (acima de 60 MB).");

  const arquivo = await prepararArquivo(original);
  const final = validarArquivo(arquivo.type, arquivo.size);
  if (!final.valido) throw new Error(final.motivo);

  const preparo = await iniciarUploadAnexo({ entidadeTipo, entidadeId, nome: arquivo.name, mime: arquivo.type, tamanhoBytes: arquivo.size });
  if (!preparo.ok || !preparo.dados) throw new Error(preparo.ok ? "Não foi possível preparar o envio." : preparo.erro);

  // Mesmo formato que o SDK do Supabase usa para URLs assinadas de upload.
  const corpo = new FormData();
  corpo.append("cacheControl", "3600");
  corpo.append("", arquivo);
  const resposta = await fetch(preparo.dados.url, { method: "PUT", body: corpo, headers: { "x-upsert": "false" } });
  if (!resposta.ok) throw new Error("O envio do arquivo falhou. Verifique a conexão e tente de novo.");

  const conclusao = await concluirUploadAnexo({
    entidadeTipo,
    entidadeId,
    caminho: preparo.dados.caminho,
    nome: arquivo.name,
    mime: arquivo.type,
    tamanhoBytes: arquivo.size,
    categoria,
  });
  if (!conclusao.ok || !conclusao.dados) throw new Error(conclusao.ok ? "Não foi possível registrar o arquivo." : conclusao.erro);
  return conclusao.dados.id;
}

type Props = {
  entidadeTipo: EntidadeComAnexo;
  entidadeId: string;
  anexos: AnexoItem[];
  titulo?: string;
};

export function Anexos({ entidadeTipo, entidadeId, anexos, titulo = "Anexos" }: Props) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [excluindo, setExcluindo] = useState<AnexoItem | null>(null);
  const [pendente, iniciar] = useTransition();

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (arquivos.length === 0) return;
    setEnviando(true);
    let enviados = 0;
    for (const arquivo of arquivos) {
      try {
        await enviarAnexo(entidadeTipo, entidadeId, arquivo);
        enviados++;
      } catch (erro) {
        toast.error(`${arquivo.name}: ${erro instanceof Error ? erro.message : "falha no envio."}`);
      }
    }
    setEnviando(false);
    if (enviados > 0) {
      toast.success(enviados === 1 ? "Arquivo enviado." : `${enviados} arquivos enviados.`);
      router.refresh();
    }
  }

  async function baixar(anexo: AnexoItem) {
    const r = await urlDeDownloadAnexo(anexo.id);
    if (r.ok && r.dados) window.open(r.dados.url, "_blank", "noopener,noreferrer");
    else toast.error(r.ok ? "Não foi possível baixar." : r.erro);
  }

  function confirmarExclusao() {
    const alvo = excluindo;
    if (!alvo) return;
    iniciar(async () => {
      const r = await excluirAnexo(alvo.id);
      setExcluindo(null);
      if (r.ok) {
        toast.success("Arquivo removido.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  return (
    <section aria-labelledby={`anexos-${entidadeId}`} className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id={`anexos-${entidadeId}`} className="font-medium">
          {titulo}
        </h2>
        <Button type="button" variant="outline" onClick={() => entrada.current?.click()} disabled={enviando}>
          {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
          {enviando ? "Enviando..." : "Enviar arquivo"}
        </Button>
        <input
          ref={entrada}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="Escolher arquivos para enviar"
          accept={Object.keys(TIPOS_PERMITIDOS).join(",")}
          onChange={aoEscolher}
          data-testid="entrada-anexo"
        />
      </div>

      {anexos.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
          Nenhum arquivo ainda. Envie fotos, PDFs ou documentos (até 10 MB cada).
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {anexos.map((a) => {
            const Icone = a.mime.startsWith("image/") ? FileImage : a.mime === "application/pdf" ? FileText : IconeArquivo;
            return (
              <li key={a.id} className="flex items-center gap-3 p-3">
                <Icone className="text-muted-foreground size-5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.nome}</p>
                  <p className="text-muted-foreground text-xs">
                    {tamanhoLegivel(a.tamanhoBytes)} · {formatarDataHora(a.criadoEm)}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => baixar(a)} aria-label={`Baixar ${a.nome}`}>
                  <Download aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => setExcluindo(a)} aria-label={`Remover ${a.nome}`}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={!!excluindo} onOpenChange={(aberto) => !aberto && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{excluindo?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>O arquivo deixa de aparecer aqui. O histórico da alteração fica registrado na auditoria.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendente}
              onClick={(e) => {
                e.preventDefault();
                confirmarExclusao();
              }}
            >
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
