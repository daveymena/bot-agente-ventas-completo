import { useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, PlayCircle } from "lucide-react";
import { HELP_GUIDES, HELP_CATEGORIES, getHelpGuide } from "@/data/help-guides";

export default function HelpCenterPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const initialId = new URLSearchParams(search).get("guide");
  const [selectedId, setSelectedId] = useState<string>(
    initialId && getHelpGuide(initialId) ? initialId : HELP_GUIDES[0].id
  );
  const [query, setQuery] = useState("");

  const guide = getHelpGuide(selectedId) || HELP_GUIDES[0];
  const Icon = guide.icon;
  const hasTour = guide.steps.some(s => s.tourTarget);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HELP_GUIDES;
    return HELP_GUIDES.filter(
      g => g.title.toLowerCase().includes(q) || g.summary.toLowerCase().includes(q)
    );
  }, [query]);

  const startTourInApp = () => {
    if (!guide.route) return;
    const sep = guide.route.includes("?") ? "&" : "?";
    setLocation(`${guide.route}${sep}tour=${guide.id}`);
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6 animate-enter h-full">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Centro de Ayuda</h1>
          <p className="text-muted-foreground mt-1">Guías paso a paso para sacarle el máximo provecho a VentasPro.</p>
        </div>

        <div className="grid md:grid-cols-[300px_1fr] gap-6 flex-1 min-h-0">
          {/* Lista de guías */}
          <div className="flex flex-col gap-4 min-h-0">
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar una guía..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="pl-9 rounded-full"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-5 pr-1">
              {HELP_CATEGORIES.map(cat => {
                const guides = filtered.filter(g => g.category === cat.id);
                if (guides.length === 0) return null;
                return (
                  <div key={cat.id}>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                      {cat.label}
                    </p>
                    <div className="space-y-1">
                      {guides.map(g => {
                        const GuideIcon = g.icon;
                        const active = g.id === selectedId;
                        return (
                          <button
                            key={g.id}
                            onClick={() => setSelectedId(g.id)}
                            className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                              active
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "hover:bg-muted text-foreground"
                            }`}
                          >
                            <GuideIcon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{g.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground px-1">No encontramos guías para "{query}".</p>
              )}
            </div>
          </div>

          {/* Guía seleccionada */}
          <Card className="glass-panel border-0 shadow-md overflow-y-auto">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-xl">{guide.title}</CardTitle>
                  <CardDescription>{guide.summary}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {hasTour && (
                <Button onClick={startTourInApp} className="rounded-xl">
                  <PlayCircle className="h-4 w-4 mr-2" /> Iniciar tour en la app
                </Button>
              )}

              <div className="space-y-5">
                {guide.steps.map((step, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm mb-1">{step.title}</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                      {step.screenshot && (
                        <img
                          src={step.screenshot}
                          alt={step.title}
                          className="mt-3 rounded-xl border shadow-sm max-w-full"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
