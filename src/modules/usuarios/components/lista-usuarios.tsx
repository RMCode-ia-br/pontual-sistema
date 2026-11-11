"use client";

import { Check, Copy, KeyRound, Loader2, MoreHorizontal, Pencil, Plus, UserCheck, UserX } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Campo, ariaDoCampo } from "@/components/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatarDataHora } from "@/lib/formatadores";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";

import { alternarAtivoUsuario, criarUsuario, editarUsuario, redefinirSenhaUsuario, type SenhaTemporaria } from "../actions/usuarios";
import type { UsuarioLista } from "../queries";

type Dialogo =
  | { tipo: "novo" }
  | { tipo: "editar"; usuario: UsuarioLista }
  | { tipo: "redefinir"; usuario: UsuarioLista }
  | { tipo: "desativar"; usuario: UsuarioLista }
  | { tipo: "senha"; credencial: SenhaTemporaria; titulo: string }
  | null;

export function ListaUsuarios({ usuarios, usuarioAtualId }: { usuarios: UsuarioLista[]; usuarioAtualId: string }) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [pendente, iniciar] = useTransition();

  const ativos = usuarios.filter((u) => u.ativo);
  const adminAtivo = ativos.find((u) => u.login === "admin");
  const sugerirDesativarAdmin = !!adminAtivo && ativos.length > 1;

  function ativar(u: UsuarioLista) {
    iniciar(async () => {
      const r = await alternarAtivoUsuario(u.id, true);
      if (r.ok) toast.success(r.mensagem ?? "Usuário ativado.");
      else toast.error(r.erro);
    });
  }

  function confirmarDesativar(u: UsuarioLista) {
    iniciar(async () => {
      const r = await alternarAtivoUsuario(u.id, false);
      setDialogo(null);
      if (r.ok) toast.success(r.mensagem ?? "Usuário desativado.");
      else toast.error(r.erro);
    });
  }

  function confirmarRedefinir(u: UsuarioLista) {
    iniciar(async () => {
      const r = await redefinirSenhaUsuario(u.id);
      if (r.ok && r.dados) setDialogo({ tipo: "senha", credencial: r.dados, titulo: "Senha redefinida" });
      else {
        setDialogo(null);
        toast.error(r.ok ? "Não foi possível redefinir." : r.erro);
      }
    });
  }

  return (
    <div className="grid gap-4">
      {sugerirDesativarAdmin ? (
        <p role="status" className="bg-primary/10 text-primary rounded-lg p-3 text-sm">
          Já existem outros usuários. Por segurança, desative o usuário <strong>admin</strong> padrão quando não precisar mais dele.
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" onClick={() => setDialogo({ tipo: "novo" })}>
          <Plus aria-hidden /> Novo usuário
        </Button>
      </div>

      <ul className="divide-y rounded-xl border">
        {usuarios.map((u) => (
          <li key={u.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {u.nome}
                {u.id === usuarioAtualId ? <Badge variant="secondary">Você</Badge> : null}
                {!u.ativo ? <Badge variant="outline">Inativo</Badge> : null}
                {u.precisaTrocarSenha ? <Badge variant="outline">Troca de senha pendente</Badge> : null}
              </p>
              <p className="text-muted-foreground text-sm">
                {u.login}
                {u.email ? ` · ${u.email}` : ""}
              </p>
              <p className="text-muted-foreground text-xs">
                {u.ultimoLoginEm ? `Último acesso: ${formatarDataHora(u.ultimoLoginEm)}` : "Nunca acessou"}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button type="button" variant="outline" size="sm" disabled={pendente} aria-label={`Ações de ${u.nome}`} />}
              >
                <MoreHorizontal aria-hidden /> Ações
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setDialogo({ tipo: "editar", usuario: u })}>
                  <Pencil aria-hidden /> Editar
                </DropdownMenuItem>
                {u.id !== usuarioAtualId ? (
                  <DropdownMenuItem onClick={() => setDialogo({ tipo: "redefinir", usuario: u })}>
                    <KeyRound aria-hidden /> Redefinir senha
                  </DropdownMenuItem>
                ) : null}
                {u.ativo ? (
                  u.id !== usuarioAtualId ? (
                    <DropdownMenuItem onClick={() => setDialogo({ tipo: "desativar", usuario: u })}>
                      <UserX aria-hidden /> Desativar
                    </DropdownMenuItem>
                  ) : null
                ) : (
                  <DropdownMenuItem onClick={() => ativar(u)}>
                    <UserCheck aria-hidden /> Ativar
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>

      {dialogo?.tipo === "novo" ? (
        <DialogoNovo aoFechar={() => setDialogo(null)} aoCriar={(credencial) => setDialogo({ tipo: "senha", credencial, titulo: "Usuário criado" })} />
      ) : null}
      {dialogo?.tipo === "editar" ? <DialogoEditar usuario={dialogo.usuario} aoFechar={() => setDialogo(null)} /> : null}
      {dialogo?.tipo === "senha" ? (
        <DialogoSenha credencial={dialogo.credencial} titulo={dialogo.titulo} aoFechar={() => setDialogo(null)} />
      ) : null}

      <AlertDialog open={dialogo?.tipo === "desativar"} onOpenChange={(a) => !a && setDialogo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar {dialogo?.tipo === "desativar" ? dialogo.usuario.nome : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              A pessoa deixa de conseguir entrar e as sessões abertas são encerradas na hora. Você pode ativar de novo depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendente}
              onClick={(e) => {
                e.preventDefault();
                if (dialogo?.tipo === "desativar") confirmarDesativar(dialogo.usuario);
              }}
            >
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialogo?.tipo === "redefinir"} onOpenChange={(a) => !a && setDialogo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Redefinir a senha de {dialogo?.tipo === "redefinir" ? dialogo.usuario.nome : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              Será criada uma senha temporária, exibida uma única vez. A pessoa terá de trocá-la no próximo acesso e as sessões abertas
              serão encerradas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendente}
              onClick={(e) => {
                e.preventDefault();
                if (dialogo?.tipo === "redefinir") confirmarRedefinir(dialogo.usuario);
              }}
            >
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Redefinir senha
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DialogoNovo({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: (c: SenhaTemporaria) => void }) {
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<SenhaTemporaria>(
    (formData) => criarUsuario(null, formData),
    (r) => {
      if (r.ok && r.dados) aoCriar(r.dados);
    },
  );
  const campos = estado && !estado.ok ? (estado.campos ?? {}) : {};

  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>Será criada uma senha temporária. A pessoa troca a senha no primeiro acesso.</DialogDescription>
        </DialogHeader>
        <form onSubmit={aoEnviar} className="grid gap-4">
          <Campo id="nome" rotulo="Nome" erro={campos.nome} obrigatorio>
            <Input id="nome" name="nome" required maxLength={120} autoFocus autoComplete="off" {...ariaDoCampo("nome", campos.nome)} />
          </Campo>
          <Campo id="login" rotulo="Usuário (login)" erro={campos.login} dica="Letras minúsculas, números, ponto, hífen ou sublinhado." obrigatorio>
            <Input
              id="login"
              name="login"
              required
              maxLength={40}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              {...ariaDoCampo("login", campos.login, "dica")}
            />
          </Campo>
          <Campo id="email" rotulo="E-mail (opcional)" erro={campos.email}>
            <Input id="email" name="email" type="email" maxLength={254} autoComplete="off" {...ariaDoCampo("email", campos.email)} />
          </Campo>
          {estado && !estado.ok && Object.keys(campos).length === 0 ? (
            <p role="alert" className="text-destructive text-sm">
              {estado.erro}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Criar usuário
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoEditar({ usuario, aoFechar }: { usuario: UsuarioLista; aoFechar: () => void }) {
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario(
    (formData) => editarUsuario(null, formData),
    (r) => {
      if (r.ok) {
        toast.success(r.mensagem ?? "Usuário atualizado.");
        aoFechar();
      }
    },
  );
  const campos = estado && !estado.ok ? (estado.campos ?? {}) : {};

  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
          <DialogDescription>O login não pode ser alterado.</DialogDescription>
        </DialogHeader>
        <form onSubmit={aoEnviar} className="grid gap-4">
          <input type="hidden" name="id" value={usuario.id} />
          <Campo id="nome" rotulo="Nome" erro={campos.nome} obrigatorio>
            <Input id="nome" name="nome" required maxLength={120} defaultValue={usuario.nome} autoFocus {...ariaDoCampo("nome", campos.nome)} />
          </Campo>
          <Campo id="login" rotulo="Usuário (login)">
            <Input id="login" value={usuario.login} disabled readOnly />
          </Campo>
          <Campo id="email" rotulo="E-mail (opcional)" erro={campos.email}>
            <Input id="email" name="email" type="email" maxLength={254} defaultValue={usuario.email ?? ""} {...ariaDoCampo("email", campos.email)} />
          </Campo>
          {estado && !estado.ok && Object.keys(campos).length === 0 ? (
            <p role="alert" className="text-destructive text-sm">
              {estado.erro}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar}>
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

function DialogoSenha({ credencial, titulo, aoFechar }: { credencial: SenhaTemporaria; titulo: string; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(credencial.senhaTemporaria);
      setCopiado(true);
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie a senha manualmente.");
    }
  }

  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            Anote a senha temporária de <strong>{credencial.login}</strong> agora: ela <strong>não será mostrada de novo</strong>. No primeiro
            acesso a pessoa precisará trocá-la.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code data-testid="senha-temporaria" className="bg-muted flex-1 rounded-lg px-3 py-2 font-mono text-base tracking-wide select-all">
            {credencial.senhaTemporaria}
          </code>
          <Button type="button" variant="outline" onClick={copiar} aria-label="Copiar senha">
            {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copiado ? "Copiada" : "Copiar"}
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={aoFechar}>
            Já anotei
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
