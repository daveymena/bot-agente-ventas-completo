import { useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { startTour } from "@/lib/tour";
import type { HelpGuide } from "@/data/help-guides";

/**
 * Si la URL trae ?tour=<guide.id> (link enviado desde /ayuda o el chat de
 * ayuda), arranca el tour guiado de esta página apenas monta. Limpia el
 * parámetro después para que un refresh no repita el tour solo.
 */
export function useAutoTour(guide: HelpGuide) {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    const params = new URLSearchParams(search);
    if (params.get("tour") !== guide.id) return;
    started.current = true;

    const t = setTimeout(() => startTour(guide.steps), 400);

    params.delete("tour");
    const qs = params.toString();
    setLocation(window.location.pathname + (qs ? `?${qs}` : ""), { replace: true });

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
}
