"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { menuVisivel } from "@/components/layout/menu";
import { Campo, CaixaMarcacao, Selecao } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ajustesDeDiferenca,
  ehAdministrador,
  MODULOS,
  NIVEIS,
  PAPEIS,
  permissoesEfetivas,
  ROTULO_DO_MODULO,
  ROTULO_DO_NIVEL,
  ROTULO_DO_PAPEL,
  type Modulo,
  type Nivel,
  type Papel,
  type PermissaoDoModulo,
} from "@/lib/dominio/permissoes";

import { alterarPermissoesUsuario } from "../actions/usuarios";
import type { UsuarioLista } from "../queries";

type Props = { usuario: UsuarioLista; ehVoce: boolean; aoFechar: () => void };

/** Perfil, acesso módulo a módulo, os dois acessos transversais e a prévia "o que este usuário vê". */
export function DialogoPermissoes({ usuario, ehVoce, aoFechar }: Props) {
  const [papel, setPapel] = useState<Papel>(usuario.papel);
  const [modulos, setModulos] = useState<Record<Modulo, PermissaoDoModulo>>(() => ({ ...usuario.permissoes.modulos }));
  const [verValores, setVerValores] = useState(usuario.permissoes.verValores);
  const [verCustoMargem, setVerCustoMargem] = useState(usuario.permissoes.verCustoMargem);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const ajustes = ajustesDeDiferenca(papel, modulos, verValores, verCustoMargem);
  const efetivas = permissoesEfetivas(papel, ajustes);
  const grupos = menuVisivel(efetivas);

  function usarPerfil(novo: Papel) {
    const base = permissoesEfetivas(novo);
    setPapel(novo);
    setModulos({ ...base.modulos });
    setVerValores(base.verValores);
    setVerCustoMargem(base.verCustoMargem);
  }

  function mudarNivel(m: Modulo, nivel: Nivel) {
    setModulos((atual) => ({ ...atual, [m]: { nivel, destrutivo: nivel === "ALTERAR" ? atual[m].destrutivo : false } }));
  }

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const r = await alterarPermissoesUsuario({ id: usuario.id, papel, ajustes });
      if (r.ok) {
        toast.success(r.mensagem ?? "Permissões atualizadas.");
        aoFechar();
      } else setErro(r.erro);
    });
  }

  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Permissões de {usuario.nome}</DialogTitle>
          <DialogDescription>
            Escolha o perfil e, se precisar, ajuste módulo a módulo. A pessoa precisa entrar de novo para valer.
            {ehVoce ? " Você está mudando o seu próprio acesso." : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <Campo id="perfil" rotulo="Perfil">
            <Selecao id="perfil" value={papel} onChange={(e) => usarPerfil(e.target.value as Papel)}>
              {PAPEIS.map((p) => (
                <option key={p} value={p}>
                  {ROTULO_DO_PAPEL[p]}
                </option>
              ))}
            </Selecao>
          </Campo>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">O que a pessoa pode em cada área</legend>
            <ul className="divide-y rounded-xl border">
              {MODULOS.map((m) => {
                const x = modulos[m];
                const niveis = m === "PAINEL" ? NIVEIS.filter((n) => n !== "ALTERAR") : NIVEIS;
                return (
                  <li key={m} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-center">
                    <span className="text-sm font-medium">{ROTULO_DO_MODULO[m]}</span>
                    <Selecao aria-label={`Acesso a ${ROTULO_DO_MODULO[m]}`} value={x.nivel} onChange={(e) => mudarNivel(m, e.target.value as Nivel)}>
                      {niveis.map((n) => (
                        <option key={n} value={n}>
                          {ROTULO_DO_NIVEL[n]}
                        </option>
                      ))}
                    </Selecao>
                    {m === "PAINEL" ? (
                      <span />
                    ) : (
                      <CaixaMarcacao
                        id={`destrutivo-${m}`}
                        rotulo="Pode excluir e desfazer"
                        checked={x.destrutivo}
                        disabled={x.nivel !== "ALTERAR"}
                        onChange={(e) => setModulos((atual) => ({ ...atual, [m]: { ...atual[m], destrutivo: e.target.checked } }))}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Valores e custo</legend>
            <CaixaMarcacao
              id="ver-valores"
              rotulo="Pode ver valores (preços, contas, valor das obras e das propostas)"
              checked={verValores}
              onChange={(e) => {
                setVerValores(e.target.checked);
                if (!e.target.checked) setVerCustoMargem(false);
              }}
            />
            <CaixaMarcacao
              id="ver-custo"
              rotulo="Pode ver custo dos materiais e margem das obras"
              checked={verCustoMargem}
              disabled={!verValores}
              onChange={(e) => setVerCustoMargem(e.target.checked)}
            />
          </fieldset>

          <section aria-labelledby="previa" className="bg-muted/40 grid gap-2 rounded-xl border p-3 text-sm">
            <h3 id="previa" className="font-medium">
              O que esta pessoa vê
            </h3>
            {grupos.length === 0 ? (
              <p className="text-muted-foreground">Nada: ela só chega à tela de &quot;sem acesso&quot;.</p>
            ) : (
              <ul className="grid gap-1" aria-label="Menu desta pessoa">
                {grupos.map((g) => (
                  <li key={g.titulo}>
                    <strong>{g.titulo}</strong>
                    {g.itens ? <span className="text-muted-foreground">: {g.itens.map((i) => i.titulo).join(", ")}</span> : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-muted-foreground">
              Valores: <strong>{efetivas.verValores ? "vê" : "não vê"}</strong> · Custo e margem: <strong>{efetivas.verCustoMargem ? "vê" : "não vê"}</strong>
              {ehAdministrador(efetivas) ? " · É administradora: mexe em usuários e configurações." : ""}
            </p>
          </section>

          {erro ? (
            <p role="alert" className="text-destructive text-sm">
              {erro}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => usarPerfil(papel)} disabled={pendente}>
            Voltar ao padrão do perfil
          </Button>
          <Button type="button" variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="button" onClick={salvar} disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} Salvar permissões
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
