import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { EstiloDaMarca } from "@/components/layout/estilo-da-marca";
import { TooltipProvider } from "@/components/ui/tooltip";
import { COR_PADRAO_DO_SISTEMA, derivarTemaDaMarca, SUPERFICIES } from "@/lib/tema/derivar";
import { obterMarcaOuPadrao } from "@/modules/configuracoes/queries";

import "./globals.css";

// O Tailwind lê --font-sans (ver globals.css), por isso a variável tem esse nome.
const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// A cor da marca vem do banco (Configurações): nenhuma página pode ser gravada estática com a cor do momento do build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Pontual Gestão", template: "%s | Pontual Gestão" },
  description: "Sistema de gestão da Pontual Soluções em Esquadrias e Vidros.",
  applicationName: "Pontual Gestão",
  robots: { index: false, follow: false },
  // Favicon e ícone do iOS vêm dos arquivos src/app/{icon.png,apple-icon.png,favicon.ico} (gerados por `npm run icones`).
};

// A cor da barra do navegador acompanha a cor da marca de Configurações (no escuro, o fundo do sistema).
export async function generateViewport(): Promise<Viewport> {
  const marca = await obterMarcaOuPadrao();
  const tema = derivarTemaDaMarca(marca.corPrimaria);
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: tema?.claro["--primary"] ?? COR_PADRAO_DO_SISTEMA },
      { media: "(prefers-color-scheme: dark)", color: SUPERFICIES.escuro.fundo },
    ],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Uma leitura por requisição (cache): o mesmo resultado serve ao layout da área logada e ao login.
  const marca = await obterMarcaOuPadrao();
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <EstiloDaMarca cor={marca.corPrimaria} />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
          {/* No topo: embaixo os avisos cobriam o botão Salvar (barra fixa) e a navegação do celular. */}
          <Toaster richColors closeButton position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
