import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HelpGuide } from "@/data/help-guides";
import { startTour } from "@/lib/tour";

/** Botón "?" para poner cerca del título de una página -- lanza el tour guiado de esa guía. */
export function HelpTourButton({ guide }: { guide: HelpGuide }) {
  const hasTour = guide.steps.some(s => s.tourTarget);
  if (!hasTour) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary shrink-0"
      title={`Cómo usar: ${guide.title}`}
      onClick={() => startTour(guide.steps)}
    >
      <HelpCircle className="h-4 w-4" />
    </Button>
  );
}
