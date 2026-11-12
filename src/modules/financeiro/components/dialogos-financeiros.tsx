"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CampoMascarado } from "@/components/campo-mascarado";
import { AreaTexto, CaixaMarcacao, Campo, Selecao, ariaDoCampo } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ResultadoAcao } from "@/lib/acoes";
import { FORMAS_PAGAMENTO, ROTULO_FORMA } from "@/lib/dominio/parcelas";
import { colarMoeda, mascararMoeda } from "@/lib/formatadores/mascaras";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";

import { criarConta, editarConta } from "../actions/contas";
import { criarLancamento, transferirEntreContas } from "../actions/lancamentos";
import type { ContaComSaldo, OpcoesDeLancamento } from "../queries";
import { ROTULO_TIPO_DE_CONTA, TIPOS_DE_CONTA } from "../schemas";

/** Valor em reais que se formata enquanto se digita; aceita um "-" na frente quando `negativo` (saldo devedor). */
export function CampoDinheiro({ id, nome, erro, defaultValue, negativo = false, obrigatorio = true }: { id: string; nome: string; erro?: string; defaultValue?: string; negativo?: boolean; obrigatorio?: boolean }) {
  return (
    <div className="relative">
      <CampoMascarado
        id={id}
        name={nome}
        mascara={(t) => (negativo && t.trim().startsWith("-") ? "-" : "") + mascararMoeda(t)}
        colar={(t) => {
          const devedor = negativo && t.trim().startsWith("-");
          const pronto = colarMoeda(devedor ? t.trim().slice(1) : t);
          return pronto === null ? null : (devedor ? "-" : "") + pronto;
        }}
        defaultValue={defaultValue ?? ""}
        inputMode={negativo ? "text" : "numeric"}
        autoComplete="off"
        maxLength={16}
        required={obrigatorio}
        className="pl-10"
        {...ariaDoCampo(id, erro)}
      />
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">R$</span>
    </div>
  );
}

function RodapeDoDialogo({ pendente, aoFechar, rotulo }: { pendente: boolean; aoFechar: () => void; rotulo: string }) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={aoFechar} disabled={pendente}>
        Cancelar
      </Button>
      <Button type="submit" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" aria-hidden /> : null} {rotulo}
      </Button>
    </DialogFooter>
  );
}

function ErroGeral({ estado }: { estado: ResultadoAcao<unknown> | null }) {
  if (!estado || estado.ok) return null;
  if (estado.campos && Object.keys(estado.campos).length > 0) return null;
  return (
    <p role="alert" className="text-destructive text-sm">
      {estado.erro}
    </p>
  );
}

// ---------- Conta financeira ----------

export function DialogoConta({ conta, aoFechar }: { conta?: ContaComSaldo; aoFechar: () => void }) {
  const router = useRouter();
  const [informar, setInformar] = useState(conta?.saldoInicialInformado ?? false);
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<unknown>(
    (formData) => (conta ? editarConta(null, formData) : criarConta(null, formData)),
    (r) => {
      if (r.ok) {
        toast.success(r.mensagem ?? "Salvo.");
        aoFechar();
        router.refresh();
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const saldoPadrao = conta?.saldoInicialInformado ? (conta.saldoInicialCentavos < 0 ? "-" : "") + mascararMoeda(String(Math.abs(conta.saldoInicialCentavos))) : "";

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !pendente && aoFechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{conta ? "Editar conta" : "Nova conta"}</DialogTitle>
            <DialogDescription>
              Onde o dinheiro entra e sai: um banco, o caixa da loja. Não guarde número de conta nem senha aqui.
            </DialogDescription>
          </DialogHeader>
          {conta ? <input type="hidden" name="contaId" value={conta.id} /> : null}
          <Campo id="conta-nome" rotulo="Nome" erro={erros.nome} obrigatorio>
            <Input id="conta-nome" name="nome" required maxLength={80} defaultValue={conta?.nome ?? ""} autoComplete="off" {...ariaDoCampo("conta-nome", erros.nome)} />
          </Campo>
          <Campo id="conta-tipo" rotulo="Tipo" erro={erros.tipo} obrigatorio>
            <Selecao id="conta-tipo" name="tipo" defaultValue={conta?.tipo ?? "BANCO"} {...ariaDoCampo("conta-tipo", erros.tipo)}>
              {TIPOS_DE_CONTA.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_DE_CONTA[t]}
                </option>
              ))}
            </Selecao>
          </Campo>
          <CaixaMarcacao id="conta-informar" name="saldoInformado" rotulo="Informar o saldo agora" checked={informar} onChange={(e) => setInformar(e.target.checked)} />
          {informar ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="conta-saldo" rotulo="Saldo nessa data" erro={erros.saldoInicial} dica="Use um sinal de menos para saldo devedor.">
                <CampoDinheiro id="conta-saldo" nome="saldoInicial" erro={erros.saldoInicial} defaultValue={saldoPadrao} negativo />
              </Campo>
              <Campo id="conta-data" rotulo="Data do saldo" erro={erros.dataSaldoInicial} dica="O saldo vale no início desse dia.">
                <Input id="conta-data" name="dataSaldoInicial" type="date" required defaultValue={conta?.dataSaldoInicial ?? ""} {...ariaDoCampo("conta-data", erros.dataSaldoInicial)} />
              </Campo>
            </div>
          ) : (
            <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
              Sem saldo informado, a conta mostra “saldo não informado” e só soma o movimento registrado. O fluxo de caixa e o DRE avisam até o saldo ser preenchido. Dá para informar depois, sem perder o histórico.
            </p>
          )}
          <Campo id="conta-obs" rotulo="Observação (opcional)" erro={erros.observacao}>
            <AreaTexto id="conta-obs" name="observacao" rows={2} maxLength={300} defaultValue={conta?.observacao ?? ""} />
          </Campo>
          <ErroGeral estado={estado} />
          <RodapeDoDialogo pendente={pendente} aoFechar={aoFechar} rotulo={conta ? "Salvar" : "Cadastrar conta"} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Lançamento avulso ----------

export function DialogoLancamento({ opcoes, hoje, contaInicialId, aoFechar }: { opcoes: OpcoesDeLancamento; hoje: string; contaInicialId?: string; aoFechar: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<unknown>(
    (formData) => criarLancamento(null, formData),
    (r) => {
      if (r.ok) {
        toast.success(r.mensagem ?? "Registrado.");
        aoFechar();
        router.refresh();
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};
  const categorias = opcoes.categorias.filter((c) => c.tipo === (tipo === "ENTRADA" ? "RECEITA" : "DESPESA"));

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !pendente && aoFechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Novo lançamento</DialogTitle>
            <DialogDescription>
              Dinheiro que já entrou ou saiu e não é uma parcela de obra nem uma conta a pagar (ex.: venda de sucata, tarifa do banco). Parcelas de obra e contas a pagar são baixadas nas próprias telas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="lanc-tipo" rotulo="Tipo" erro={erros.tipo} obrigatorio>
              <Selecao id="lanc-tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "ENTRADA" | "SAIDA")} {...ariaDoCampo("lanc-tipo", erros.tipo)}>
                <option value="ENTRADA">Entrada (recebi)</option>
                <option value="SAIDA">Saída (paguei)</option>
              </Selecao>
            </Campo>
            <Campo id="lanc-data" rotulo="Data" erro={erros.data} obrigatorio>
              <Input id="lanc-data" name="data" type="date" required defaultValue={hoje} max={hoje} {...ariaDoCampo("lanc-data", erros.data)} />
            </Campo>
            <Campo id="lanc-valor" rotulo="Valor" erro={erros.valor} obrigatorio>
              <CampoDinheiro id="lanc-valor" nome="valor" erro={erros.valor} />
            </Campo>
            <Campo id="lanc-conta" rotulo="Conta" erro={erros.contaFinanceiraId} obrigatorio>
              <Selecao id="lanc-conta" name="contaFinanceiraId" required defaultValue={contaInicialId ?? (opcoes.contas.length === 1 ? opcoes.contas[0].id : "")} {...ariaDoCampo("lanc-conta", erros.contaFinanceiraId)}>
                <option value="">Escolha a conta...</option>
                {opcoes.contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
          </div>
          <Campo id="lanc-categoria" rotulo="Categoria" erro={erros.categoriaId} obrigatorio>
            <Selecao key={tipo} id="lanc-categoria" name="categoriaId" required defaultValue="" {...ariaDoCampo("lanc-categoria", erros.categoriaId)}>
              <option value="">Escolha a categoria...</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo id="lanc-descricao" rotulo="Descrição" erro={erros.descricao} obrigatorio>
            <Input id="lanc-descricao" name="descricao" required maxLength={200} autoComplete="off" {...ariaDoCampo("lanc-descricao", erros.descricao)} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="lanc-forma" rotulo="Forma (opcional)" erro={erros.forma}>
              <Selecao id="lanc-forma" name="forma" defaultValue="">
                <option value="">—</option>
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f} value={f}>
                    {ROTULO_FORMA[f]}
                  </option>
                ))}
              </Selecao>
            </Campo>
            {tipo === "SAIDA" ? (
              <Campo id="lanc-fornecedor" rotulo="Fornecedor (opcional)" erro={erros.fornecedorId}>
                <Selecao id="lanc-fornecedor" name="fornecedorId" defaultValue="">
                  <option value="">—</option>
                  {opcoes.fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
            ) : null}
          </div>
          <CaixaMarcacao id="lanc-nota" name="comNotaFiscal" rotulo="Com nota fiscal (só a marca; o sistema não lida com notas)" />
          <Campo id="lanc-obs" rotulo="Observação (opcional)" erro={erros.observacao}>
            <AreaTexto id="lanc-obs" name="observacao" rows={2} maxLength={500} />
          </Campo>
          <ErroGeral estado={estado} />
          <RodapeDoDialogo pendente={pendente} aoFechar={aoFechar} rotulo="Registrar" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Transferência ----------

export function DialogoTransferencia({ contas, hoje, aoFechar }: { contas: { id: string; nome: string }[]; hoje: string; aoFechar: () => void }) {
  const router = useRouter();
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<unknown>(
    (formData) => transferirEntreContas(null, formData),
    (r) => {
      if (r.ok) {
        toast.success(r.mensagem ?? "Registrada.");
        aoFechar();
        router.refresh();
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !pendente && aoFechar()}>
      <DialogContent>
        <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Transferência entre contas</DialogTitle>
            <DialogDescription>Move dinheiro de uma conta para outra. Não entra no DRE nem no fluxo total: o dinheiro só mudou de lugar.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="transf-origem" rotulo="Sai de" erro={erros.contaOrigemId} obrigatorio>
              <Selecao id="transf-origem" name="contaOrigemId" required defaultValue="" {...ariaDoCampo("transf-origem", erros.contaOrigemId)}>
                <option value="">Escolha...</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo id="transf-destino" rotulo="Entra em" erro={erros.contaDestinoId} obrigatorio>
              <Selecao id="transf-destino" name="contaDestinoId" required defaultValue="" {...ariaDoCampo("transf-destino", erros.contaDestinoId)}>
                <option value="">Escolha...</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo id="transf-valor" rotulo="Valor" erro={erros.valor} obrigatorio>
              <CampoDinheiro id="transf-valor" nome="valor" erro={erros.valor} />
            </Campo>
            <Campo id="transf-data" rotulo="Data" erro={erros.data} obrigatorio>
              <Input id="transf-data" name="data" type="date" required defaultValue={hoje} max={hoje} {...ariaDoCampo("transf-data", erros.data)} />
            </Campo>
          </div>
          <Campo id="transf-descricao" rotulo="Descrição (opcional)" erro={erros.descricao}>
            <Input id="transf-descricao" name="descricao" maxLength={200} autoComplete="off" />
          </Campo>
          <ErroGeral estado={estado} />
          <RodapeDoDialogo pendente={pendente} aoFechar={aoFechar} rotulo="Transferir" />
        </form>
      </DialogContent>
    </Dialog>
  );
}
