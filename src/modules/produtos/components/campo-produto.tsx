"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { CaixaMarcacao, Campo, Selecao } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { buscarProdutosParaCampo, cadastrarProdutoRapido, opcoesDoCadastroRapidoDeProduto, type ProdutoParaEscolha } from "../actions/rapido";
import { ROTULO_UNIDADE, UNIDADES } from "../schemas";

type Props = {
  id: string;
  name: string;
  inicial?: ProdutoParaEscolha | null;
  aoMudar?: (escolhido: ProdutoParaEscolha | null) => void;
};

/**
 * Escolhe um produto digitando parte do código ou da descrição; se não existe, "+ Cadastrar" cria na hora (custo vazio) e já
 * seleciona. Não usa <form> (fica dentro do formulário da compra e do pedido de vidro): o diálogo salva por botão.
 */
export function CampoProduto({ id, name, inicial = null, aoMudar }: Props) {
  const [escolhido, setEscolhido] = useState(inicial);
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<{ termo: string; opcoes: ProdutoParaEscolha[] } | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  const termoAtual = texto.trim();
  const buscou = resultado?.termo === termoAtual;
  const opcoes = buscou ? resultado.opcoes : [];

  useEffect(() => {
    const termo = texto.trim();
    if (termo.length < 2) return;
    let cancelado = false;
    const espera = setTimeout(async () => {
      const r = await buscarProdutosParaCampo(termo);
      if (!cancelado) setResultado({ termo, opcoes: r.ok && r.dados ? r.dados : [] });
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [texto]);

  function escolher(p: ProdutoParaEscolha) {
    setEscolhido(p);
    setTexto("");
    setResultado(null);
    aoMudar?.(p);
  }

  if (escolhido) {
    return (
      <div className="flex items-center gap-2">
        <input type="hidden" name={name} value={escolhido.id} />
        <span id={id} className="bg-muted flex min-h-9 flex-1 items-center rounded-lg px-3 text-sm">
          {escolhido.rotulo}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Trocar o produto"
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
        placeholder="Digite parte do código ou da descrição"
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
                {o.rotulo}
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
      {cadastrando ? (
        <DialogoDeProduto
          descricaoInicial={termoAtual}
          aoFechar={() => setCadastrando(false)}
          aoCadastrar={(p) => {
            setCadastrando(false);
            escolher(p);
          }}
        />
      ) : null}
    </div>
  );
}

type Opcoes = { categorias: { id: string; nome: string }[]; linhas: { id: string; nome: string }[]; acabamentos: { id: string; nome: string }[] };

function DialogoDeProduto({ descricaoInicial, aoFechar, aoCadastrar }: { descricaoInicial: string; aoFechar: () => void; aoCadastrar: (p: ProdutoParaEscolha) => void }) {
  const [opcoes, setOpcoes] = useState<Opcoes | null>(null);
  const [descricao, setDescricao] = useState(descricaoInicial);
  const [unidade, setUnidade] = useState<string>("UN");
  const [categoriaId, setCategoriaId] = useState("");
  const [codigo, setCodigo] = useState("");
  const [perfil, setPerfil] = useState(false);
  const [acabamentoId, setAcabamentoId] = useState("");
  const [linhaId, setLinhaId] = useState("");
  const [peso, setPeso] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [geral, setGeral] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    let cancelado = false;
    void opcoesDoCadastroRapidoDeProduto().then((r) => {
      if (!cancelado && r.ok && r.dados) setOpcoes(r.dados);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  function salvar() {
    setErros({});
    setGeral(null);
    iniciar(async () => {
      const r = await cadastrarProdutoRapido({
        descricao,
        unidade,
        categoriaId,
        codigo,
        perfil: perfil ? "on" : "",
        acabamentoId: perfil ? acabamentoId : "",
        linhaId: perfil ? linhaId : "",
        pesoKgPorMetro: perfil ? peso : "",
        comprimentoBarraMm: perfil ? comprimento : "",
      });
      if (r.ok && r.dados) {
        toast.success(r.mensagem ?? "Produto cadastrado.");
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
          <DialogTitle>Cadastrar produto</DialogTitle>
          <DialogDescription>O produto nasce sem custo (“sem custo”): o primeiro custo vem da compra recebida{perfil ? " ou do preço do kg" : ""}. O resto você completa depois em Produtos.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
          <Campo id="prod-rapido-desc" rotulo="Descrição" erro={erros.descricao} obrigatorio>
            <Input id="prod-rapido-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} autoFocus autoComplete="off" />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="prod-rapido-un" rotulo="Unidade" erro={erros.unidade} obrigatorio>
              <Selecao id="prod-rapido-un" value={unidade} onChange={(e) => setUnidade(e.target.value)}>
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {ROTULO_UNIDADE[u]}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo id="prod-rapido-cat" rotulo="Categoria (opcional)" erro={erros.categoriaId}>
              <Selecao id="prod-rapido-cat" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">Sem categoria</option>
                {opcoes?.categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
          </div>
          <Campo id="prod-rapido-cod" rotulo="Código (opcional)" erro={erros.codigo} dica="Vazio: o sistema gera (P-0001, P-0002…).">
            <Input id="prod-rapido-cod" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={40} autoComplete="off" />
          </Campo>
          <CaixaMarcacao id="prod-rapido-perfil" rotulo="Perfil de alumínio comprado por kg" checked={perfil} onChange={(e) => setPerfil(e.target.checked)} />
          {perfil ? (
            <div className="grid gap-4 rounded-lg border p-3 sm:grid-cols-2">
              <Campo id="prod-rapido-acab" rotulo="Acabamento" erro={erros.acabamentoId} obrigatorio dica="É dele que vem o preço do kg.">
                <Selecao id="prod-rapido-acab" value={acabamentoId} onChange={(e) => setAcabamentoId(e.target.value)}>
                  <option value="">Escolha o acabamento...</option>
                  {opcoes?.acabamentos.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo id="prod-rapido-linha" rotulo="Linha (opcional)" erro={erros.linhaId}>
                <Selecao id="prod-rapido-linha" value={linhaId} onChange={(e) => setLinhaId(e.target.value)}>
                  <option value="">Qualquer linha</option>
                  {opcoes?.linhas.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo id="prod-rapido-peso" rotulo="Peso por metro (kg/m)" erro={erros.pesoKgPorMetro} dica="Vazio: sem peso por metro, o custo por barra não é calculado.">
                <Input id="prod-rapido-peso" value={peso} onChange={(e) => setPeso(e.target.value)} inputMode="decimal" maxLength={10} autoComplete="off" />
              </Campo>
              <Campo id="prod-rapido-comp" rotulo="Comprimento da barra (mm)" erro={erros.comprimentoBarraMm} dica="Vazio: 6.000 mm, o padrão para barra.">
                <Input id="prod-rapido-comp" value={comprimento} onChange={(e) => setComprimento(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="off" />
              </Campo>
            </div>
          ) : null}
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
            {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Cadastrar produto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
