"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Campo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { buscarFornecedoresParaCampo, cadastrarFornecedorRapido, type FornecedorParaEscolha } from "../actions-rapido";

type Props = {
  id: string;
  name: string;
  inicial?: FornecedorParaEscolha | null;
  aoMudar?: (escolhido: FornecedorParaEscolha | null) => void;
};

/**
 * Escolhe um fornecedor digitando parte do nome; se não existe, "+ Cadastrar" cria na hora (só nome e telefone) e já seleciona.
 * Não usa <form> (pode ficar dentro do formulário da compra): o diálogo salva por botão.
 */
export function CampoFornecedor({ id, name, inicial = null, aoMudar }: Props) {
  const [escolhido, setEscolhido] = useState(inicial);
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<{ termo: string; opcoes: FornecedorParaEscolha[] } | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  const termoAtual = texto.trim();
  const buscou = resultado?.termo === termoAtual;
  const opcoes = buscou ? resultado.opcoes : [];

  useEffect(() => {
    const termo = texto.trim();
    if (termo.length < 2) return;
    let cancelado = false;
    const espera = setTimeout(async () => {
      const r = await buscarFornecedoresParaCampo(termo);
      if (!cancelado) setResultado({ termo, opcoes: r.ok && r.dados ? r.dados : [] });
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [texto]);

  function escolher(f: FornecedorParaEscolha) {
    setEscolhido(f);
    setTexto("");
    setResultado(null);
    aoMudar?.(f);
  }

  if (escolhido) {
    return (
      <div className="flex items-center gap-2">
        <input type="hidden" name={name} value={escolhido.id} />
        <span id={id} className="bg-muted flex min-h-9 flex-1 items-center rounded-lg px-3 text-sm">
          {escolhido.nome}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Trocar o fornecedor"
          onClick={() => {
            setEscolhido(null);
            aoMudar?.(null);
          }}
        >
          <X aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value="" />
      <Input
        id={id}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Digite parte do nome do fornecedor"
        autoComplete="off"
        className="h-9"
        role="combobox"
        aria-expanded={termoAtual.length >= 2}
        aria-controls={`${id}-lista`}
      />
      {termoAtual.length >= 2 ? (
        <ul id={`${id}-lista`} role="listbox" className="bg-popover absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border p-1 shadow-md">
          {opcoes.map((o) => (
            <li key={o.id} role="option" aria-selected="false">
              <button type="button" className="hover:bg-muted flex min-h-9 w-full items-center rounded-md px-2 text-left text-sm" onClick={() => escolher(o)}>
                {o.nome}
              </button>
            </li>
          ))}
          <li role="option" aria-selected="false">
            <button type="button" className="text-primary hover:bg-muted flex min-h-9 w-full items-center gap-1 rounded-md px-2 text-left text-sm font-medium" onClick={() => setCadastrando(true)}>
              <Plus className="size-4" aria-hidden /> Cadastrar “{termoAtual}”
            </button>
          </li>
        </ul>
      ) : null}
      {cadastrando ? <DialogoDeFornecedor nomeInicial={termoAtual} aoFechar={() => setCadastrando(false)} aoCadastrar={(f) => { setCadastrando(false); escolher(f); }} /> : null}
    </div>
  );
}

function DialogoDeFornecedor({ nomeInicial, aoFechar, aoCadastrar }: { nomeInicial: string; aoFechar: () => void; aoCadastrar: (f: FornecedorParaEscolha) => void }) {
  const [nome, setNome] = useState(nomeInicial);
  const [telefone, setTelefone] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [geral, setGeral] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function salvar() {
    setErros({});
    setGeral(null);
    iniciar(async () => {
      const r = await cadastrarFornecedorRapido({ razaoSocial: nome, telefone });
      if (r.ok && r.dados) {
        toast.success(r.mensagem ?? "Fornecedor cadastrado.");
        aoCadastrar(r.dados);
      } else if (!r.ok) {
        setErros(r.campos ?? {});
        setGeral(r.erro);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(a) => !a && !pendente && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastrar fornecedor</DialogTitle>
          <DialogDescription>Só o nome e o telefone por agora. O CNPJ, as condições de pagamento e o resto você completa depois em Fornecedores.</DialogDescription>
        </DialogHeader>
        <div
          className="grid gap-4"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !pendente) {
              e.preventDefault();
              salvar();
            }
          }}
        >
          <Campo id="forn-rapido-nome" rotulo="Nome ou razão social" erro={erros.razaoSocial} obrigatorio>
            <Input id="forn-rapido-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={160} autoFocus autoComplete="off" />
          </Campo>
          <Campo id="forn-rapido-tel" rotulo="Telefone (opcional)" erro={erros.telefone}>
            <Input id="forn-rapido-tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" maxLength={20} autoComplete="off" />
          </Campo>
          {geral && Object.keys(erros).length === 0 ? (
            <p role="alert" className="text-destructive text-sm">
              {geral}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={pendente}>
            Cancelar
          </Button>
          <Button type="button" onClick={salvar} disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Cadastrar fornecedor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
