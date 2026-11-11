"use client";

import { Building2, Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { CampoMascarado } from "@/components/campo-mascarado";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { CaixaMarcacao, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResultadoAcao } from "@/lib/acoes";
import { mascararCep, mascararTelefone } from "@/lib/formatadores/mascaras";
import { formatarTelefone } from "@/lib/formatadores";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { UFS } from "@/lib/validadores/campos";

import { consultarCepDoEndereco } from "../actions/consultas";
import { criarEndereco, editarEndereco, excluirEndereco } from "../actions/enderecos";
import { resumoDoEndereco } from "../schemas";

export type EnderecoItem = {
  id: string;
  clienteId: string;
  tipo: "OBRA" | "COBRANCA";
  apelido: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  condominio: boolean;
  condominioNome: string | null;
  exigeAprovacaoFachada: boolean;
  fachadaAprovada: boolean;
  horariosPermitidos: string | null;
  sindicoNome: string | null;
  sindicoTelefone: string | null;
};

function FormEndereco({ clienteId, endereco, aoConcluir }: { clienteId: string; endereco?: EnderecoItem; aoConcluir: () => void }) {
  const router = useRouter();
  const formulario = useRef<HTMLFormElement>(null);
  const [condominio, setCondominio] = useState(endereco?.condominio ?? false);
  const [exigeFachada, setExigeFachada] = useState(endereco?.exigeAprovacaoFachada ?? false);
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario(
    (formData): Promise<ResultadoAcao> =>
      endereco ? editarEndereco(null, formData) : criarEndereco(null, formData),
    (r) => {
      if (r.ok) {
        toast.success(r.mensagem ?? "Salvo.");
        router.refresh();
        aoConcluir();
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};

  /** Ao completar o CEP, preenche o que estiver vazio. Se o serviço falhar, a pessoa digita à mão. */
  async function aoMudarCep(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.currentTarget.value.replace(/\D/g, "").length !== 8) return;
    const r = await consultarCepDoEndereco(e.currentTarget.value);
    if (!r.ok || !r.dados) return;
    const preencher = (nome: string, valor: string) => {
      const el = formulario.current?.elements.namedItem(nome) as HTMLInputElement | HTMLSelectElement | null;
      if (el && el.value.trim() === "" && valor) el.value = valor;
    };
    preencher("logradouro", r.dados.logradouro);
    preencher("bairro", r.dados.bairro);
    preencher("cidade", r.dados.cidade);
    preencher("uf", r.dados.uf);
  }

  return (
    <form ref={formulario} onSubmit={aoEnviar} className="grid gap-4 rounded-xl border p-4 sm:grid-cols-6" aria-label={endereco ? "Editar endereço" : "Novo endereço"}>
      <input type="hidden" name="clienteId" value={clienteId} />
      {endereco ? <input type="hidden" name="id" value={endereco.id} /> : null}
      <Campo id={`tipo-${endereco?.id ?? "novo"}`} rotulo="Tipo" erro={erros.tipo} className="sm:col-span-2">
        <Selecao id={`tipo-${endereco?.id ?? "novo"}`} name="tipo" defaultValue={endereco?.tipo ?? "OBRA"}>
          <option value="OBRA">Endereço de obra</option>
          <option value="COBRANCA">Endereço de cobrança</option>
        </Selecao>
      </Campo>
      <Campo id={`apelido-${endereco?.id ?? "novo"}`} rotulo="Apelido (opcional)" erro={erros.apelido} dica="Ex.: Casa da praia, Apto 302." className="sm:col-span-4">
        <Input id={`apelido-${endereco?.id ?? "novo"}`} name="apelido" maxLength={80} defaultValue={endereco?.apelido ?? ""} autoComplete="off" />
      </Campo>
      <Campo id={`cep-${endereco?.id ?? "novo"}`} rotulo="CEP" erro={erros.cep} dica="Ao digitar o CEP, a rua e a cidade são preenchidas." className="sm:col-span-2">
        <CampoMascarado id={`cep-${endereco?.id ?? "novo"}`} name="cep" mascara={mascararCep} defaultValue={endereco?.cep ?? ""} inputMode="numeric" autoComplete="off" placeholder="00000-000" onChange={aoMudarCep} {...ariaDoCampo(`cep-${endereco?.id ?? "novo"}`, erros.cep)} />
      </Campo>
      <Campo id={`logradouro-${endereco?.id ?? "novo"}`} rotulo="Rua, avenida..." erro={erros.logradouro} className="sm:col-span-3">
        <Input id={`logradouro-${endereco?.id ?? "novo"}`} name="logradouro" maxLength={200} defaultValue={endereco?.logradouro ?? ""} autoComplete="off" {...ariaDoCampo(`logradouro-${endereco?.id ?? "novo"}`, erros.logradouro)} />
      </Campo>
      <Campo id={`numero-${endereco?.id ?? "novo"}`} rotulo="Número" erro={erros.numero} className="sm:col-span-1">
        <Input id={`numero-${endereco?.id ?? "novo"}`} name="numero" maxLength={20} defaultValue={endereco?.numero ?? ""} autoComplete="off" />
      </Campo>
      <Campo id={`complemento-${endereco?.id ?? "novo"}`} rotulo="Complemento" erro={erros.complemento} className="sm:col-span-2">
        <Input id={`complemento-${endereco?.id ?? "novo"}`} name="complemento" maxLength={120} defaultValue={endereco?.complemento ?? ""} autoComplete="off" />
      </Campo>
      <Campo id={`bairro-${endereco?.id ?? "novo"}`} rotulo="Bairro" erro={erros.bairro} className="sm:col-span-2">
        <Input id={`bairro-${endereco?.id ?? "novo"}`} name="bairro" maxLength={120} defaultValue={endereco?.bairro ?? ""} autoComplete="off" />
      </Campo>
      <Campo id={`cidade-${endereco?.id ?? "novo"}`} rotulo="Cidade" erro={erros.cidade} className="sm:col-span-2">
        <Input id={`cidade-${endereco?.id ?? "novo"}`} name="cidade" maxLength={120} defaultValue={endereco?.cidade ?? ""} autoComplete="off" />
      </Campo>
      <Campo id={`uf-${endereco?.id ?? "novo"}`} rotulo="Estado" erro={erros.uf} className="sm:col-span-2">
        <Selecao id={`uf-${endereco?.id ?? "novo"}`} name="uf" defaultValue={endereco?.uf ?? ""}>
          <option value="">—</option>
          {UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </Selecao>
      </Campo>

      <div className="grid gap-3 sm:col-span-6">
        <CaixaMarcacao id={`condominio-${endereco?.id ?? "novo"}`} name="condominio" rotulo="É em condomínio" checked={condominio} onChange={(e) => setCondominio(e.target.checked)} />
        {condominio ? (
          <div className="grid gap-4 rounded-lg border border-dashed p-3 sm:grid-cols-2">
            <Campo id={`condominioNome-${endereco?.id ?? "novo"}`} rotulo="Nome do condomínio" erro={erros.condominioNome} className="sm:col-span-2">
              <Input id={`condominioNome-${endereco?.id ?? "novo"}`} name="condominioNome" maxLength={160} defaultValue={endereco?.condominioNome ?? ""} autoComplete="off" />
            </Campo>
            <div className="flex flex-wrap gap-x-5 gap-y-1 sm:col-span-2">
              <CaixaMarcacao id={`exigeFachada-${endereco?.id ?? "novo"}`} name="exigeAprovacaoFachada" rotulo="Exige aprovação da fachada" checked={exigeFachada} onChange={(e) => setExigeFachada(e.target.checked)} />
              {exigeFachada ? <CaixaMarcacao id={`fachadaAprovada-${endereco?.id ?? "novo"}`} name="fachadaAprovada" rotulo="Fachada já aprovada" defaultChecked={endereco?.fachadaAprovada} /> : null}
            </div>
            <Campo id={`horarios-${endereco?.id ?? "novo"}`} rotulo="Horários permitidos para obra" erro={erros.horariosPermitidos} className="sm:col-span-2">
              <Input id={`horarios-${endereco?.id ?? "novo"}`} name="horariosPermitidos" maxLength={200} defaultValue={endereco?.horariosPermitidos ?? ""} placeholder="Ex.: seg a sex, 8h às 17h" autoComplete="off" />
            </Campo>
            <Campo id={`sindicoNome-${endereco?.id ?? "novo"}`} rotulo="Síndico" erro={erros.sindicoNome}>
              <Input id={`sindicoNome-${endereco?.id ?? "novo"}`} name="sindicoNome" maxLength={160} defaultValue={endereco?.sindicoNome ?? ""} autoComplete="off" />
            </Campo>
            <Campo id={`sindicoTelefone-${endereco?.id ?? "novo"}`} rotulo="Telefone do síndico" erro={erros.sindicoTelefone}>
              <CampoMascarado id={`sindicoTelefone-${endereco?.id ?? "novo"}`} name="sindicoTelefone" type="tel" mascara={mascararTelefone} defaultValue={endereco?.sindicoTelefone ?? ""} inputMode="tel" autoComplete="off" />
            </Campo>
          </div>
        ) : null}
      </div>

      {estado && !estado.ok && Object.keys(erros).length === 0 ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-6">
          {estado.erro}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 sm:col-span-6">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {endereco ? "Salvar endereço" : "Adicionar endereço"}
        </Button>
        <Button type="button" variant="ghost" onClick={aoConcluir}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function SecaoEnderecos({ clienteId, enderecos }: { clienteId: string; enderecos: EnderecoItem[] }) {
  const router = useRouter();
  const [adicionando, setAdicionando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<EnderecoItem | null>(null);
  const [pendente, iniciar] = useTransition();

  function confirmarExclusao() {
    const alvo = excluindo;
    if (!alvo) return;
    iniciar(async () => {
      const r = await excluirEndereco(alvo.id);
      setExcluindo(null);
      if (r.ok) {
        toast.success(r.mensagem ?? "Removido.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  return (
    <section aria-labelledby="titulo-enderecos" className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="titulo-enderecos" className="font-medium">
          Endereços de obra e de cobrança
        </h2>
        {!adicionando ? (
          <Button type="button" variant="outline" onClick={() => setAdicionando(true)}>
            <Plus aria-hidden /> Adicionar endereço
          </Button>
        ) : null}
      </div>

      {adicionando ? <FormEndereco clienteId={clienteId} aoConcluir={() => setAdicionando(false)} /> : null}

      {enderecos.length === 0 && !adicionando ? (
        <EstadoVazio
          icone={MapPin}
          titulo="Nenhum endereço cadastrado"
          descricao="Cadastre o endereço de cada obra do cliente. Dados de condomínio (aprovação da fachada, horários e síndico) ficam aqui também."
          acao={
            <Button type="button" onClick={() => setAdicionando(true)}>
              <Plus aria-hidden /> Adicionar endereço
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {enderecos.map((e) =>
            editando === e.id ? (
              <li key={e.id}>
                <FormEndereco clienteId={clienteId} endereco={e} aoConcluir={() => setEditando(null)} />
              </li>
            ) : (
              <li key={e.id} className="flex flex-wrap items-start gap-3 rounded-xl border p-3">
                <span className="bg-muted text-muted-foreground mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full">
                  {e.condominio ? <Building2 className="size-4" aria-hidden /> : <MapPin className="size-4" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {e.apelido || resumoDoEndereco(e) || "Endereço sem rua"}
                    <Badge variant="secondary">{e.tipo === "OBRA" ? "Obra" : "Cobrança"}</Badge>
                    {e.condominio ? <Badge variant="outline">Condomínio</Badge> : null}
                  </p>
                  {e.apelido && resumoDoEndereco(e) ? <p className="text-muted-foreground text-sm">{resumoDoEndereco(e)}</p> : null}
                  {e.cep ? <p className="text-muted-foreground text-xs">CEP {e.cep}</p> : null}
                  {e.condominio ? (
                    <dl className="text-muted-foreground mt-1 grid gap-0.5 text-xs">
                      {e.condominioNome ? <div>Condomínio: {e.condominioNome}</div> : null}
                      {e.exigeAprovacaoFachada ? <div>Fachada: {e.fachadaAprovada ? "aprovada" : "aguardando aprovação"}</div> : null}
                      {e.horariosPermitidos ? <div>Horários: {e.horariosPermitidos}</div> : null}
                      {e.sindicoNome || e.sindicoTelefone ? (
                        <div>
                          Síndico: {e.sindicoNome ?? "—"}
                          {e.sindicoTelefone ? ` · ${formatarTelefone(e.sindicoTelefone)}` : ""}
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => setEditando(e.id)} aria-label={`Editar endereço ${e.apelido || resumoDoEndereco(e)}`}>
                    <Pencil aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setExcluindo(e)} aria-label={`Remover endereço ${e.apelido || resumoDoEndereco(e)}`}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <ConfirmarAcao
        aberto={!!excluindo}
        aoFechar={() => setExcluindo(null)}
        titulo="Remover este endereço?"
        descricao="O endereço deixa de aparecer na ficha do cliente. O histórico da alteração fica registrado na auditoria."
        botao="Remover"
        pendente={pendente}
        aoConfirmar={confirmarExclusao}
      />
    </section>
  );
}
