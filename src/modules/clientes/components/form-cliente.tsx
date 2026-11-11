"use client";

import { AlertTriangle, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { CampoMascarado } from "@/components/campo-mascarado";
import { AreaTexto, CaixaMarcacao, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResultadoAcao } from "@/lib/acoes";
import { mascararCnpj, mascararCpf, mascararTelefone } from "@/lib/formatadores/mascaras";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { useProtecaoDeSaida } from "@/lib/hooks/usar-protecao-de-saida";

import { consultarCnpjDoCliente, verificarDuplicidadeDeCliente } from "../actions/consultas";
import { criarCliente, editarCliente } from "../actions/clientes";
import type { Duplicado } from "../queries";
import { ORIGENS, ROTULO_ORIGEM } from "../schemas";
import { CampoCliente } from "./campo-cliente";

export type ClienteParaForm = {
  id: string;
  tipoPessoa: "PF" | "PJ";
  nome: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  clienteFinal: boolean;
  arquiteto: boolean;
  construtora: boolean;
  empresa: boolean;
  origem: string | null;
  origemDetalhe: string | null;
  indicadoPor: { id: string; nome: string } | null;
  observacoes: string | null;
};

export function FormCliente({ cliente }: { cliente?: ClienteParaForm }) {
  const router = useRouter();
  const editando = !!cliente;
  const formulario = useRef<HTMLFormElement>(null);
  const confirmado = useRef(false);
  const [tipo, setTipo] = useState<"PF" | "PJ">(cliente?.tipoPessoa ?? "PF");
  const [sujo, setSujo] = useState(false);
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
  const [consultando, setConsultando] = useState(false);
  useProtecaoDeSaida(sujo);

  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<{ id: string }>(
    async (formData): Promise<ResultadoAcao<{ id: string }>> => {
      if (!confirmado.current) {
        const aviso = await verificarDuplicidadeDeCliente({
          cpfCnpj: String(formData.get("documento") ?? ""),
          telefone: String(formData.get("telefone") ?? ""),
          whatsapp: String(formData.get("whatsapp") ?? ""),
          exceto: cliente?.id,
        });
        if (aviso.ok && aviso.dados && aviso.dados.length > 0) {
          setDuplicados(aviso.dados);
          // Objeto literal (e não o helper `falha` de @/lib/acoes): aquele arquivo importa o Prisma, que não pode ir ao navegador.
          return { ok: false, erro: "Já existe um cliente com os mesmos dados. Veja o aviso acima." };
        }
      }
      setDuplicados([]);
      formData.set("confirmarDuplicado", confirmado.current ? "1" : "");
      confirmado.current = false;
      return editando ? editarCliente(null, formData) : criarCliente(null, formData);
    },
    (r) => {
      if (r.ok && r.dados) {
        setSujo(false);
        toast.success(r.mensagem ?? "Salvo.");
        // Dá um instante para a proteção de saída desligar antes de navegar.
        setTimeout(() => router.push(`/clientes/${r.dados!.id}`), 0);
      }
    },
  );

  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const rotuloDocumento = tipo === "PF" ? "CPF" : "CNPJ";

  async function consultarCnpj() {
    const campo = formulario.current?.elements.namedItem("documento") as HTMLInputElement | null;
    if (!campo) return;
    setConsultando(true);
    const r = await consultarCnpjDoCliente(campo.value);
    setConsultando(false);
    if (!r.ok || !r.dados) {
      // Falha silenciosa por desenho: o cadastro manual continua valendo.
      toast.message("Não foi possível buscar os dados do CNPJ agora. Preencha à mão.");
      return;
    }
    // Só preenche o que está vazio: nunca sobrescreve o que a pessoa já digitou.
    const preencher = (nome: string, valor: string, mascara?: (t: string) => string) => {
      const el = formulario.current?.elements.namedItem(nome) as HTMLInputElement | null;
      if (el && el.value.trim() === "" && valor) el.value = mascara ? mascara(valor) : valor;
    };
    preencher("nome", r.dados.razaoSocial);
    preencher("nomeFantasia", r.dados.nomeFantasia);
    preencher("telefone", r.dados.telefone, mascararTelefone);
    preencher("email", r.dados.email);
    setSujo(true);
    toast.success("Dados preenchidos pelo CNPJ. Confira antes de salvar.");
  }

  return (
    <form ref={formulario} onSubmit={aoEnviar} onChange={() => setSujo(true)} className="grid gap-5">
      {cliente ? <input type="hidden" name="id" value={cliente.id} /> : null}

      {duplicados.length > 0 ? (
        <div role="alert" className="grid gap-2 border-amber-500/40 bg-amber-500/10 rounded-xl border p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden /> Esse cliente parece já estar cadastrado
          </p>
          <ul className="grid gap-1">
            {duplicados.map((d) => (
              <li key={d.id}>
                <Link href={`/clientes/${d.id}`} target="_blank" rel="noopener" className="font-medium underline">
                  {d.nome}
                </Link>{" "}
                <span className="text-muted-foreground">({d.motivo})</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                confirmado.current = true;
                formulario.current?.requestSubmit();
              }}
            >
              {editando ? "Salvar assim mesmo" : "Cadastrar assim mesmo"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDuplicados([])}>
              Fechar aviso
            </Button>
          </div>
        </div>
      ) : null}

      <section aria-labelledby="sec-identificacao" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-identificacao" className="font-medium sm:col-span-2">
          Identificação
        </h2>
        <Campo id="tipoPessoa" rotulo="Tipo de pessoa" erro={erros.tipoPessoa} obrigatorio>
          <Selecao
            id="tipoPessoa"
            name="tipoPessoa"
            value={tipo}
            onChange={(e) => setTipo(e.target.value === "PJ" ? "PJ" : "PF")}
            {...ariaDoCampo("tipoPessoa", erros.tipoPessoa)}
          >
            <option value="PF">Pessoa física</option>
            <option value="PJ">Pessoa jurídica (empresa)</option>
          </Selecao>
        </Campo>
        <Campo id="documento" rotulo={rotuloDocumento} erro={erros.documento} dica={tipo === "PJ" ? "Com o CNPJ, dá para buscar os dados da empresa." : undefined}>
          <div className="flex gap-2">
            <CampoMascarado
              key={tipo}
              id="documento"
              name="documento"
              mascara={tipo === "PF" ? mascararCpf : mascararCnpj}
              defaultValue={cliente && cliente.tipoPessoa === tipo ? (cliente.cpfCnpj ?? "") : ""}
              inputMode="numeric"
              autoComplete="off"
              maxLength={18}
              placeholder={tipo === "PF" ? "000.000.000-00" : "00.000.000/0000-00"}
              {...ariaDoCampo("documento", erros.documento)}
            />
            {tipo === "PJ" ? (
              <Button type="button" variant="outline" onClick={consultarCnpj} disabled={consultando} aria-label="Buscar dados pelo CNPJ">
                {consultando ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
                <span className="hidden sm:inline">Buscar</span>
              </Button>
            ) : null}
          </div>
        </Campo>
        <Campo id="nome" rotulo={tipo === "PF" ? "Nome completo" : "Razão social"} erro={erros.nome} obrigatorio className="sm:col-span-2">
          <Input id="nome" name="nome" required maxLength={160} defaultValue={cliente?.nome ?? ""} autoFocus={!editando} autoComplete="off" {...ariaDoCampo("nome", erros.nome)} />
        </Campo>
        <Campo id="nomeFantasia" rotulo={tipo === "PF" ? "Como prefere ser chamado (opcional)" : "Nome fantasia (opcional)"} erro={erros.nomeFantasia} className="sm:col-span-2">
          <Input id="nomeFantasia" name="nomeFantasia" maxLength={160} defaultValue={cliente?.nomeFantasia ?? ""} autoComplete="off" {...ariaDoCampo("nomeFantasia", erros.nomeFantasia)} />
        </Campo>
        <fieldset className="grid gap-1 sm:col-span-2">
          <legend className="text-sm font-medium">Esse cadastro é</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <CaixaMarcacao id="clienteFinal" name="clienteFinal" rotulo="Cliente final" defaultChecked={cliente ? cliente.clienteFinal : true} />
            <CaixaMarcacao id="arquiteto" name="arquiteto" rotulo="Arquiteto/designer" defaultChecked={cliente?.arquiteto} />
            <CaixaMarcacao id="construtora" name="construtora" rotulo="Construtora" defaultChecked={cliente?.construtora} />
            <CaixaMarcacao id="empresa" name="empresa" rotulo="Empresa" defaultChecked={cliente?.empresa} />
          </div>
          <p className="text-muted-foreground text-xs">Pode marcar mais de uma opção. Arquitetos e construtoras aparecem em Parceiros.</p>
        </fieldset>
      </section>

      <section aria-labelledby="sec-contato" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-contato" className="font-medium sm:col-span-2">
          Contato
        </h2>
        <Campo id="telefone" rotulo="Telefone" erro={erros.telefone}>
          <CampoMascarado id="telefone" name="telefone" type="tel" mascara={mascararTelefone} defaultValue={cliente?.telefone ?? ""} inputMode="tel" autoComplete="off" placeholder="(22) 99999-9999" {...ariaDoCampo("telefone", erros.telefone)} />
        </Campo>
        <Campo id="whatsapp" rotulo="WhatsApp" erro={erros.whatsapp}>
          <CampoMascarado id="whatsapp" name="whatsapp" type="tel" mascara={mascararTelefone} defaultValue={cliente?.whatsapp ?? ""} inputMode="tel" autoComplete="off" placeholder="(22) 99999-9999" {...ariaDoCampo("whatsapp", erros.whatsapp)} />
        </Campo>
        <Campo id="email" rotulo="E-mail" erro={erros.email} className="sm:col-span-2">
          <Input id="email" name="email" type="email" maxLength={254} defaultValue={cliente?.email ?? ""} autoComplete="off" {...ariaDoCampo("email", erros.email)} />
        </Campo>
      </section>

      <section aria-labelledby="sec-origem" className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <h2 id="sec-origem" className="font-medium sm:col-span-2">
          Como chegou até a Pontual
        </h2>
        <Campo id="origem" rotulo="Origem" erro={erros.origem}>
          <Selecao id="origem" name="origem" defaultValue={cliente?.origem ?? ""} {...ariaDoCampo("origem", erros.origem)}>
            <option value="">Não informada</option>
            {ORIGENS.map((o) => (
              <option key={o} value={o}>
                {ROTULO_ORIGEM[o]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="origemDetalhe" rotulo="Detalhe da origem (opcional)" erro={erros.origemDetalhe} dica="Ex.: nome da obra com a placa, ou quem recomendou.">
          <Input id="origemDetalhe" name="origemDetalhe" maxLength={160} defaultValue={cliente?.origemDetalhe ?? ""} autoComplete="off" {...ariaDoCampo("origemDetalhe", erros.origemDetalhe)} />
        </Campo>
        <Campo id="indicadoPorId" rotulo="Indicado por (opcional)" erro={erros.indicadoPorId} dica="Outro cliente ou parceiro já cadastrado." className="sm:col-span-2">
          <CampoCliente id="indicadoPorId" name="indicadoPorId" inicial={cliente?.indicadoPor ?? null} exceto={cliente?.id} aoMudar={() => setSujo(true)} />
        </Campo>
        <Campo id="observacoes" rotulo="Observações (opcional)" erro={erros.observacoes} className="sm:col-span-2">
          <AreaTexto id="observacoes" name="observacoes" maxLength={4000} rows={4} defaultValue={cliente?.observacoes ?? ""} {...ariaDoCampo("observacoes", erros.observacoes)} />
        </Campo>
      </section>

      {estado && !estado.ok && Object.keys(erros).length === 0 && duplicados.length === 0 ? (
        <p role="alert" className="text-destructive text-sm">
          {estado.erro}
        </p>
      ) : null}

      <div className="bg-background/95 sticky bottom-14 z-10 -mx-1 flex flex-wrap gap-2 border-t px-1 py-3 backdrop-blur md:bottom-0">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {editando ? "Salvar alterações" : "Cadastrar cliente"}
        </Button>
        <Link href={editando ? `/clientes/${cliente.id}` : "/clientes"} className="inline-flex h-8 items-center px-3 text-sm hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
