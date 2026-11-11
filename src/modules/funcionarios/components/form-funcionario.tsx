"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CampoMascarado } from "@/components/campo-mascarado";
import { AreaTexto, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResultadoAcao } from "@/lib/acoes";
import { dataParaInput } from "@/lib/formatadores";
import { centavosParaCampo, mascararCpf, mascararMoeda, mascararTelefone } from "@/lib/formatadores/mascaras";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { useProtecaoDeSaida } from "@/lib/hooks/usar-protecao-de-saida";

import { criarFuncionario, editarFuncionario } from "../actions/funcionarios";
import type { FuncionarioDetalhe } from "../queries";
import { FUNCOES, ROTULO_FUNCAO } from "../schemas";

type Props = { funcionario?: FuncionarioDetalhe; usuarios: { id: string; nome: string; login: string }[] };

export function FormFuncionario({ funcionario, usuarios }: Props) {
  const router = useRouter();
  const editando = !!funcionario;
  const [sujo, setSujo] = useState(false);
  useProtecaoDeSaida(sujo);

  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<{ id: string }>(
    (formData): Promise<ResultadoAcao<{ id: string }>> => (editando ? editarFuncionario(null, formData) : criarFuncionario(null, formData)),
    (r) => {
      if (r.ok && r.dados) {
        setSujo(false);
        toast.success(r.mensagem ?? "Salvo.");
        setTimeout(() => router.push(`/funcionarios/${r.dados!.id}`), 0);
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const data = (iso: string | null | undefined) => dataParaInput(iso ? new Date(iso) : null);

  return (
    <form onSubmit={aoEnviar} onChange={() => setSujo(true)} className="grid gap-5">
      {funcionario ? <input type="hidden" name="id" value={funcionario.id} /> : null}

      <section aria-labelledby="sec-pessoa" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-pessoa" className="font-medium sm:col-span-2">
          Pessoa
        </h2>
        <Campo id="nome" rotulo="Nome completo" erro={erros.nome} obrigatorio className="sm:col-span-2">
          <Input id="nome" name="nome" required maxLength={160} defaultValue={funcionario?.nome ?? ""} autoFocus={!editando} autoComplete="off" {...ariaDoCampo("nome", erros.nome)} />
        </Campo>
        <Campo id="cpf" rotulo="CPF (opcional)" erro={erros.cpf}>
          <CampoMascarado id="cpf" name="cpf" mascara={mascararCpf} defaultValue={funcionario?.cpf ?? ""} inputMode="numeric" maxLength={14} autoComplete="off" placeholder="000.000.000-00" {...ariaDoCampo("cpf", erros.cpf)} />
        </Campo>
        <Campo id="telefone" rotulo="Telefone ou WhatsApp" erro={erros.telefone}>
          <CampoMascarado id="telefone" name="telefone" type="tel" mascara={mascararTelefone} defaultValue={funcionario?.telefone ?? ""} inputMode="tel" autoComplete="off" placeholder="(22) 99999-9999" {...ariaDoCampo("telefone", erros.telefone)} />
        </Campo>
        <Campo id="email" rotulo="E-mail" erro={erros.email} className="sm:col-span-2">
          <Input id="email" name="email" type="email" maxLength={254} defaultValue={funcionario?.email ?? ""} autoComplete="off" {...ariaDoCampo("email", erros.email)} />
        </Campo>
      </section>

      <section aria-labelledby="sec-trabalho" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-trabalho" className="font-medium sm:col-span-2">
          Trabalho
        </h2>
        <Campo id="funcao" rotulo="Função" erro={erros.funcao} obrigatorio dica="Define em que telas a pessoa aparece (agenda, equipes de instalação).">
          <Selecao id="funcao" name="funcao" required defaultValue={funcionario?.funcao ?? ""} {...ariaDoCampo("funcao", erros.funcao, "Define em que telas a pessoa aparece (agenda, equipes de instalação).")}>
            <option value="" disabled>
              Escolha…
            </option>
            {FUNCOES.map((f) => (
              <option key={f} value={f}>
                {ROTULO_FUNCAO[f]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="cargo" rotulo="Cargo (opcional)" erro={erros.cargo}>
          <Input id="cargo" name="cargo" maxLength={80} defaultValue={funcionario?.cargo ?? ""} autoComplete="off" />
        </Campo>
        <Campo id="admissaoEm" rotulo="Admissão (opcional)" erro={erros.admissaoEm}>
          <Input id="admissaoEm" name="admissaoEm" type="date" defaultValue={data(funcionario?.admissaoEm)} {...ariaDoCampo("admissaoEm", erros.admissaoEm)} />
        </Campo>
        <Campo id="demissaoEm" rotulo="Demissão (opcional)" erro={erros.demissaoEm}>
          <Input id="demissaoEm" name="demissaoEm" type="date" defaultValue={data(funcionario?.demissaoEm)} {...ariaDoCampo("demissaoEm", erros.demissaoEm)} />
        </Campo>
        <Campo id="usuarioId" rotulo="Usuário do sistema (opcional)" erro={erros.usuarioId} dica="Se a pessoa também entra no sistema, vincule o usuário dela." className="sm:col-span-2">
          <Selecao id="usuarioId" name="usuarioId" defaultValue={funcionario?.usuarioId ?? ""} {...ariaDoCampo("usuarioId", erros.usuarioId, "Se a pessoa também entra no sistema, vincule o usuário dela.")}>
            <option value="">Sem usuário</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome} ({u.login})
              </option>
            ))}
          </Selecao>
        </Campo>
      </section>

      <section aria-labelledby="sec-custo" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-custo" className="font-medium sm:col-span-2">
          Custo
        </h2>
        <p role="note" className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm sm:col-span-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <span>
            Salário e custo por hora são dados sensíveis. Por enquanto, <strong>todos os usuários do sistema enxergam estes valores</strong>; quando houver perfis de acesso, eles serão restritos.
          </span>
        </p>
        <Campo id="salarioBase" rotulo="Salário base (R$)" erro={erros.salarioBase}>
          <CampoMascarado id="salarioBase" name="salarioBase" mascara={mascararMoeda} defaultValue={centavosParaCampo(funcionario?.salarioBaseCentavos)} inputMode="numeric" autoComplete="off" placeholder="0,00" {...ariaDoCampo("salarioBase", erros.salarioBase)} />
        </Campo>
        <Campo id="custoHora" rotulo="Custo por hora (R$, opcional)" erro={erros.custoHora}>
          <CampoMascarado id="custoHora" name="custoHora" mascara={mascararMoeda} defaultValue={centavosParaCampo(funcionario?.custoHoraCentavos)} inputMode="numeric" autoComplete="off" placeholder="0,00" {...ariaDoCampo("custoHora", erros.custoHora)} />
        </Campo>
        <Campo id="observacoes" rotulo="Observações (opcional)" erro={erros.observacoes} className="sm:col-span-2">
          <AreaTexto id="observacoes" name="observacoes" maxLength={4000} rows={3} defaultValue={funcionario?.observacoes ?? ""} />
        </Campo>
      </section>

      {estado && !estado.ok && Object.keys(erros).length === 0 ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.erro}
        </p>
      ) : null}

      <div className="bg-background/95 sticky bottom-14 z-10 -mx-1 flex flex-wrap gap-2 border-t px-1 py-3 backdrop-blur md:bottom-0">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {editando ? "Salvar alterações" : "Cadastrar funcionário"}
        </Button>
        <Link href={editando ? `/funcionarios/${funcionario.id}` : "/funcionarios"} className="inline-flex h-8 items-center px-3 text-sm hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
