import { prisma } from "@/lib/db";

async function nomeDaEmpresa(): Promise<string> {
  try {
    const cfg = await prisma.configuracaoEmpresa.findUnique({
      where: { id: "singleton" },
      select: { nomeFantasia: true },
    });
    return cfg?.nomeFantasia?.trim() || "Pontual";
  } catch {
    // A tela de login nunca pode quebrar por causa de uma falha ao ler a configuração.
    return "Pontual";
  }
}

export default async function LayoutAutenticacao({ children }: { children: React.ReactNode }) {
  const empresa = await nomeDaEmpresa();

  return (
    <main className="from-primary/10 via-background to-background flex min-h-dvh items-center justify-center bg-gradient-to-b p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="bg-primary text-primary-foreground mx-auto mb-3 flex size-12 items-center justify-center rounded-xl text-xl font-bold" aria-hidden>
            P
          </div>
          <h1 className="text-lg font-semibold tracking-tight">{empresa}</h1>
          <p className="text-muted-foreground text-sm">Sistema de gestão</p>
        </div>
        {children}
      </div>
    </main>
  );
}
