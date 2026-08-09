import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import type { HelpGuideStep } from "@/data/help-guides";

/**
 * Arranca el tour guiado en pantalla para los pasos de una guía que tengan
 * tourTarget (los demás son solo informativos, no se resaltan). Si ninguno
 * tiene tourTarget no hay nada que mostrar en esta página.
 */
export function startTour(steps: HelpGuideStep[]) {
  const driveSteps: DriveStep[] = steps
    .filter((s): s is HelpGuideStep & { tourTarget: string } => !!s.tourTarget)
    .map(s => ({
      element: `[data-tour="${s.tourTarget}"]`,
      popover: { title: s.title, description: s.description },
    }));

  if (driveSteps.length === 0) return false;

  driver({
    showProgress: true,
    nextBtnText: "Siguiente",
    prevBtnText: "Atrás",
    doneBtnText: "Listo",
    steps: driveSteps,
  }).drive();

  return true;
}
