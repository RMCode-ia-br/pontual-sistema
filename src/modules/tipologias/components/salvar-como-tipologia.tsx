"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AreaTexto, Selecao } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { salvarDesenhoComoTipologiaAcao } from "../actions/desenho";
import { ROTULO_TIPO_DESENHO, TIPOS_DESENHO } from "../schemas";

type Props = {
  itemId: string;
  /** Tipo de desenho pré-selecionado: o do item de origem. */
  tipoDesenhoInicial: (typeof TIPOS_DESENHO)[number];
  /** Modelo da descrição pré-preenchido (o da tipologia de origem ou, sem ela, o texto do item); a pessoa pode editar. */
  modeloInicial: string;
  /** Avisa o diálogo do item se há uma criação em andamento (o diálogo não fecha enquanto isso). */
  aoOcupar?: (ocupado: boolean) => void;
};

/**
 * "Salvar este desenho como nova tipologia": painel dentro do diálogo do item (só para item com imagem própria). A tipologia
 * nasce com o MESMO arquivo do desenho e marcada para revisar; composição e preços ficam em branco (o servidor não inventa nada).
 */
export function SalvarComoTipologia({ itemId, tipoDesenhoInicial, modeloInicial, aoOcupar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<(typeof TIPOS_DESENHO)[number]>(tipoDesenhoInicial);
  const [modelo, setModelo] = useState(modeloInicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [errosCampo, setErrosCampo] = useState<Record<string, string>>({});
  const [criada, setCriada] = useState<{ id: string; nome: string } | null>(null);
  const trava = useRef(false); // duplo clique: o estado só muda no próximo desenho da tela

  function abrir() {
    // Sempre começa do que o item tem agora (o tipo e o modelo podem ter mudado desde a última vez).
    setTipo(tipoDesenhoInicial);
    setModelo(modeloInicial);
    setErro(null);
    setErrosCampo({});
    setAberto(true);
  }

  async function criar() {
    if (trava.current) return;
    trava.current = true;
    setEnviando(true);
    aoOcupar?.(true);
    setErro(null);
    setErrosCampo({});
    try {
      const r = await salvarDesenhoComoTipologiaAcao({ itemId, nome, tipoDesenho: tipo, templateDescricao: modelo });
      if (!r.ok) {
        setErro(r.erro);
        setErrosCampo(r.campos ?? {});
        return;
      }
      if (r.dados) setCriada({ id: r.dados.tipologiaId, nome: nome.trim() });
      toast.success(r.mensagem ?? "Tipologia criada.");
    } catch {
      setErro("Não foi possível criar a tipologia agora. Tente de novo.");
    } finally {
      trava.current = false;
      setEnviando(false);
      aoOcupar?.(false);
    }
  }

  if (criada) {
    return (
      <div role="status" className="grid gap-1 rounded-lg border p-3 text-sm" data-testid="tipologia-criada">
        <p>
          Tipologia <strong>{criada.nome}</strong> criada com este desenho. Falta cadastrar a composição de custo e a tabela de preços.
        </p>
        <p>
          <Link href={`/tipologias/${criada.id}`} className="text-primary underline" data-testid="link-tipologia-criada">
            Abrir a tipologia criada
          </Link>
        </p>
      </div>
    );
  }

  if (!aberto) {
    return (
      <div>
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-8" onClick={abrir}>
          Salvar este desenho como nova tipologia
        </Button>
      </div>
    );
  }

  return (
    <fieldset className="grid gap-3 rounded-lg border p-3" data-testid="salvar-como-tipologia" disabled={enviando}>
      <legend className="px-1 text-sm font-medium">Salvar este desenho como nova tipologia</legend>
      <label className="grid gap-1 text-sm">
        Nome da tipologia
        <Input value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} aria-label="Nome da nova tipologia" aria-invalid={!!errosCampo.nome} />
        {errosCampo.nome ? <span className="text-destructive text-xs">{errosCampo.nome}</span> : null}
      </label>
      <label className="grid gap-1 text-sm">
        Tipo de desenho (usado quando a tipologia não tiver imagem)
        <Selecao
          value={tipo}
          onChange={(e) => setTipo(e.target.value as (typeof TIPOS_DESENHO)[number])}
          aria-label="Tipo de desenho da nova tipologia"
        >
          {TIPOS_DESENHO.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_DESENHO[t]}
            </option>
          ))}
        </Selecao>
      </label>
      <label className="grid gap-1 text-sm">
        Modelo da descrição
        <AreaTexto value={modelo} rows={3} maxLength={1000} onChange={(e) => setModelo(e.target.value)} aria-label="Modelo da descrição da nova tipologia" aria-invalid={!!errosCampo.templateDescricao} />
        {errosCampo.templateDescricao ? <span className="text-destructive text-xs">{errosCampo.templateDescricao}</span> : null}
      </label>
      <p className="text-muted-foreground text-xs" data-testid="aviso-sem-preco">
        A composição de custo e a tabela de preços ficam em branco: você completa depois, no cadastro da tipologia. Até lá, o item que usar essa tipologia fica com preço manual. O desenho é o mesmo arquivo deste item, e este item continua com ele.
      </p>
      {erro ? (
        <p role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11 sm:min-h-8" disabled={enviando || nome.trim() === ""} onClick={() => void criar()}>
          {enviando ? "Criando…" : "Criar tipologia"}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11 sm:min-h-8" disabled={enviando} onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </fieldset>
  );
}
