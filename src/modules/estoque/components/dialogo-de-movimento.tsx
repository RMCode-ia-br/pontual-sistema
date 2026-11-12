"use client";

import { Loader2, PackagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  AreaTexto,
  CaixaMarcacao,
  Campo,
  Selecao,
  ariaDoCampo,
} from "@/components/formulario";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatarQuantidade, lerQuantidade } from "@/lib/dominio/estoque";
import { formatarMoeda } from "@/lib/formatadores";
import { useAcaoDeFormulario } from "@/lib/hooks/usar-acao-de-formulario";
import { CampoProjeto } from "@/modules/agenda/components/campo-projeto";
import { CampoDinheiro } from "@/modules/financeiro/components/dialogos-financeiros";

import { registrarMovimento } from "../actions/movimentos";

const TIPOS = [
  { valor: "SAIDA_OBRA", rotulo: "Saída para uma obra" },
  {
    valor: "ENTRADA_COMPRA",
    rotulo: "Entrada (compra avulsa, sem pedido lançado)",
  },
  { valor: "DEVOLUCAO", rotulo: "Devolução da obra ao estoque" },
  { valor: "AJUSTE", rotulo: "Ajuste de contagem" },
  { valor: "PERDA", rotulo: "Perda (quebra, defeito)" },
] as const;

type Props = {
  produtoId: string;
  produtoNome: string;
  sigla: string;
  saldoMilesimos: number;
  custoAtualCentavos: number | null;
  hoje: string;
};

/** Registra um movimento de UM produto: confere o saldo na hora e só aceita saída sem saldo com confirmação e justificativa. */
export function DialogoDeMovimento({
  produtoId,
  produtoNome,
  sigla,
  saldoMilesimos,
  custoAtualCentavos,
  hoje,
}: Props) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] =
    useState<(typeof TIPOS)[number]["valor"]>("SAIDA_OBRA");
  const [sentido, setSentido] = useState<"MAIS" | "MENOS">("MAIS");
  const [quantidade, setQuantidade] = useState("");
  const { estado, pendente, aoEnviar } = useAcaoDeFormulario<unknown>(
    (fd) => registrarMovimento(null, fd),
    (r) => {
      if (r.ok) {
        toast.success(r.mensagem ?? "Movimento registrado.");
        setAberto(false);
        setQuantidade("");
        router.refresh();
      }
    },
  );
  const erros = estado && !estado.ok ? (estado.campos ?? {}) : {};

  const retira =
    tipo === "SAIDA_OBRA" ||
    tipo === "PERDA" ||
    (tipo === "AJUSTE" && sentido === "MENOS");
  const q = lerQuantidade(quantidade);
  const semSaldo = retira && q !== null && saldoMilesimos - q < 0;
  const exigeObra = tipo === "SAIDA_OBRA" || tipo === "DEVOLUCAO";

  return (
    <>
      <Button type="button" onClick={() => setAberto(true)}>
        <PackagePlus aria-hidden /> Registrar movimento
      </Button>
      <Dialog open={aberto} onOpenChange={(a) => !pendente && setAberto(a)}>
        <DialogContent>
          <form onSubmit={aoEnviar} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>Registrar movimento</DialogTitle>
              <DialogDescription>
                {produtoNome}. Saldo atual:{" "}
                <strong>
                  {formatarQuantidade(saldoMilesimos)} {sigla}
                </strong>
                .
              </DialogDescription>
            </DialogHeader>
            <input type="hidden" name="produtoId" value={produtoId} />
            <Campo id="mov-tipo" rotulo="Tipo" erro={erros.tipo} obrigatorio>
              <Selecao
                id="mov-tipo"
                name="tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as typeof tipo)}
              >
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </Selecao>
            </Campo>
            {tipo === "AJUSTE" ? (
              <Campo
                id="mov-sentido"
                rotulo="O ajuste"
                erro={erros.sentido}
                obrigatorio
              >
                <Selecao
                  id="mov-sentido"
                  name="sentido"
                  value={sentido}
                  onChange={(e) =>
                    setSentido(e.target.value as "MAIS" | "MENOS")
                  }
                >
                  <option value="MAIS">
                    Acrescenta ao estoque (contei mais)
                  </option>
                  <option value="MENOS">
                    Retira do estoque (contei menos)
                  </option>
                </Selecao>
              </Campo>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                id="mov-qtd"
                rotulo={`Quantidade (${sigla})`}
                erro={erros.quantidade}
                obrigatorio
                dica="Até 3 casas decimais, ex.: 2,5."
              >
                <Input
                  id="mov-qtd"
                  name="quantidade"
                  inputMode="decimal"
                  autoComplete="off"
                  required
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  {...ariaDoCampo("mov-qtd", erros.quantidade)}
                />
              </Campo>
              <Campo id="mov-data" rotulo="Data" erro={erros.data} obrigatorio>
                <Input
                  id="mov-data"
                  name="data"
                  type="date"
                  required
                  defaultValue={hoje}
                  {...ariaDoCampo("mov-data", erros.data)}
                />
              </Campo>
            </div>
            {exigeObra ? (
              <Campo
                id="mov-obra"
                rotulo="Obra"
                erro={erros.projetoId}
                obrigatorio
                dica="Obras aprovadas, em execução ou concluídas."
              >
                <CampoProjeto id="mov-obra" name="projetoId" />
              </Campo>
            ) : null}
            {tipo === "ENTRADA_COMPRA" ? (
              <Campo
                id="mov-custo"
                rotulo="Custo unitário desta compra (opcional)"
                erro={erros.custo}
                dica="Se informar, o custo do produto passa a ser este (último custo). Vazio não muda o custo."
              >
                <CampoDinheiro
                  id="mov-custo"
                  nome="custo"
                  erro={erros.custo}
                  obrigatorio={false}
                />
              </Campo>
            ) : exigeObra || tipo === "PERDA" ? (
              <p className="text-muted-foreground text-sm">
                {custoAtualCentavos !== null
                  ? `Será registrado ao custo atual: ${formatarMoeda(custoAtualCentavos)} por ${sigla}.`
                  : "Este produto está sem custo: o movimento fica “sem custo” e a margem da obra ficará incompleta até informar o custo."}
              </p>
            ) : null}
            {semSaldo ? (
              <div
                role="alert"
                className="grid gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
              >
                <p>
                  A quantidade passa do saldo (
                  {formatarQuantidade(saldoMilesimos)} {sigla}). Para registrar
                  mesmo assim, confirme e explique o motivo.
                </p>
                <CaixaMarcacao
                  id="mov-confirma"
                  name="confirmarSemSaldo"
                  rotulo="Confirmo: o saldo vai ficar negativo"
                />
                <Campo
                  id="mov-just"
                  rotulo="Justificativa"
                  erro={erros.justificativa ?? erros.quantidade}
                  obrigatorio
                >
                  <AreaTexto
                    id="mov-just"
                    name="justificativa"
                    rows={2}
                    maxLength={300}
                    {...ariaDoCampo("mov-just", erros.justificativa)}
                  />
                </Campo>
              </div>
            ) : (
              <Campo
                id="mov-obs"
                rotulo="Observação (opcional)"
                erro={erros.justificativa}
              >
                <AreaTexto
                  id="mov-obs"
                  name="justificativa"
                  rows={2}
                  maxLength={300}
                />
              </Campo>
            )}
            {estado && !estado.ok && Object.keys(erros).length === 0 ? (
              <p role="alert" className="text-destructive text-sm">
                {estado.erro}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAberto(false)}
                disabled={pendente}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pendente}>
                {pendente ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : null}{" "}
                Registrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
