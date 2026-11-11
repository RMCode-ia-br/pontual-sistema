"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function BotaoImprimir() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()} className="print:hidden">
      <Printer aria-hidden /> Imprimir
    </Button>
  );
}
