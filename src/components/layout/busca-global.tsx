"use client";

import { CheckSquare, FileText, FolderKanban, HardHat, Package, Search, Truck, User, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Command as Comando, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buscaGlobal, type ResultadoBusca } from "@/modules/busca/actions";

import { paginasDisponiveis } from "./menu";

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const VAZIO: ResultadoBusca = { clientes: [], projetos: [], fornecedores: [], produtos: [], funcionarios: [], tarefas: [], usuarios: [] };

export function BuscaGlobal() {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState<ResultadoBusca>(VAZIO);

  // Atalho Ctrl+K (ou Cmd+K).
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberta((a) => !a);
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  // Busca no servidor com atraso (debounce) para não consultar a cada tecla.
  useEffect(() => {
    const limpo = termo.trim();
    if (limpo.length < 2) return;
    let cancelado = false;
    const t = setTimeout(() => {
      buscaGlobal(limpo)
        .then((r) => !cancelado && setResultado(r))
        .catch(() => !cancelado && setResultado(VAZIO));
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [termo]);

  const paginas = useMemo(() => {
    const q = semAcento(termo.trim());
    return paginasDisponiveis().filter((p) => !q || semAcento(`${p.titulo} ${p.grupo}`).includes(q));
  }, [termo]);

  const visivel = termo.trim().length >= 2 ? resultado : VAZIO;

  function ir(href: string) {
    setAberta(false);
    setTermo("");
    router.push(href);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setAberta(true)}
        className="text-muted-foreground h-9 w-9 justify-center px-0 sm:w-64 sm:justify-start sm:px-3"
        aria-label="Buscar (Ctrl+K)"
        aria-keyshortcuts="Control+K"
      >
        <Search aria-hidden />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="bg-muted ml-auto hidden rounded px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
      </Button>

      <Dialog open={aberta} onOpenChange={setAberta}>
        <DialogHeader className="sr-only">
          <DialogTitle>Busca global</DialogTitle>
          <DialogDescription>Procure páginas, clientes, projetos, fornecedores, produtos, funcionários, tarefas e usuários.</DialogDescription>
        </DialogHeader>
        <DialogContent className="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0" showCloseButton={false}>
          <Comando shouldFilter={false}>
            <CommandInput placeholder="Buscar páginas, clientes, produtos..." value={termo} onValueChange={setTermo} />
            <CommandList>
              <CommandEmpty>Nada encontrado.</CommandEmpty>
              {paginas.length > 0 ? (
                <CommandGroup heading="Páginas">
                  {paginas.slice(0, 8).map((p) => (
                    <CommandItem key={p.href} value={`pagina-${p.href}`} onSelect={() => ir(p.href)}>
                      <FileText aria-hidden /> {p.titulo}
                      <span className="text-muted-foreground ml-auto text-xs">{p.grupo}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {visivel.clientes.length > 0 ? (
                <CommandGroup heading="Clientes">
                  {visivel.clientes.map((c) => (
                    <CommandItem key={c.id} value={`cliente-${c.id}`} onSelect={() => ir(`/clientes/${c.id}`)}>
                      <Users aria-hidden /> {c.nome}
                      {c.detalhe ? <span className="text-muted-foreground ml-auto text-xs">{c.detalhe}</span> : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {visivel.projetos.length > 0 ? (
                <CommandGroup heading="Projetos">
                  {visivel.projetos.map((p) => (
                    <CommandItem key={p.id} value={`projeto-${p.id}`} onSelect={() => ir(`/projetos/${p.id}`)}>
                      <FolderKanban aria-hidden /> {p.titulo}
                      <span className="text-muted-foreground ml-auto text-xs">
                        {p.codigo} · {p.cliente}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {visivel.fornecedores.length > 0 ? (
                <CommandGroup heading="Fornecedores">
                  {visivel.fornecedores.map((f) => (
                    <CommandItem key={f.id} value={`fornecedor-${f.id}`} onSelect={() => ir(`/fornecedores/${f.id}`)}>
                      <Truck aria-hidden /> {f.nome}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {visivel.produtos.length > 0 ? (
                <CommandGroup heading="Produtos">
                  {visivel.produtos.map((p) => (
                    <CommandItem key={p.id} value={`produto-${p.id}`} onSelect={() => ir(`/produtos/${p.id}`)}>
                      <Package aria-hidden /> {p.descricao}
                      <span className="text-muted-foreground ml-auto text-xs">{p.codigo}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {visivel.funcionarios.length > 0 ? (
                <CommandGroup heading="Funcionários">
                  {visivel.funcionarios.map((f) => (
                    <CommandItem key={f.id} value={`funcionario-${f.id}`} onSelect={() => ir(`/funcionarios/${f.id}`)}>
                      <HardHat aria-hidden /> {f.nome}
                      {f.cargo ? <span className="text-muted-foreground ml-auto text-xs">{f.cargo}</span> : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {visivel.tarefas.length > 0 ? (
                <CommandGroup heading="Tarefas">
                  {visivel.tarefas.map((t) => (
                    <CommandItem key={t.id} value={`tarefa-${t.id}`} onSelect={() => ir(`/tarefas/${t.id}`)}>
                      <CheckSquare aria-hidden /> <span className={t.concluida ? "line-through" : undefined}>{t.titulo}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {visivel.usuarios.length > 0 ? (
                <CommandGroup heading="Usuários">
                  {visivel.usuarios.map((u) => (
                    <CommandItem key={u.id} value={`usuario-${u.id}`} onSelect={() => ir("/configuracoes/usuarios")}>
                      <User aria-hidden /> {u.nome}
                      <span className="text-muted-foreground ml-auto text-xs">{u.login}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Comando>
        </DialogContent>
      </Dialog>
    </>
  );
}
