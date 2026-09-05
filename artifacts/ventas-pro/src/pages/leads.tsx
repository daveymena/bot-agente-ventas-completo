import { useState } from "react";
import { 
  useListLeads, getListLeadsQueryKey,
  useCreateLead,
  useUpdateLead,
  useDeleteLead
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, MoreVertical, Edit, Trash2, Save, Phone, Mail, Users, Tag } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { HelpTourButton } from "@/components/HelpTourButton";
import { useAutoTour } from "@/hooks/use-auto-tour";
import { getHelpGuide } from "@/data/help-guides";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LeadStage } from "@workspace/api-client-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const stageColors: Record<LeadStage, string> = {
  new: "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  contacted: "border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  qualified: "border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300",
  proposal: "border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  won: "border-coral bg-coral/10 text-coral",
  lost: "border-destructive bg-destructive/10 text-destructive",
};

const stageNames: Record<LeadStage, string> = {
  new: "Nuevo 🔵",
  contacted: "Contactado 🟡",
  qualified: "Calificado 🟣",
  proposal: "Propuesta 🟠",
  won: "Ganado 🎉",
  lost: "Perdido ❌",
};

const HELP_GUIDE = getHelpGuide("leads")!;

/**
 * El mensaje que mando el servidor, no uno generico.
 *
 * La API ya devuelve textos redactados y en espanol ("Alcanzaste el limite de
 * 10 agentes de tu plan", "Datos invalidos: falta el telefono"), y la pantalla
 * los tiraba para mostrar siempre "Error al crear prospecto". El usuario le
 * daba Guardar tres veces sin saber que le faltaba un campo.
 *
 * Tambien saca el detalle de validacion de zod, que dice QUE campo esta mal --
 * que es justo lo que necesita quien esta llenando un formulario.
 */
function mensajeDeError(e: any, porDefecto: string): string {
  const d = e?.response?.data ?? e?.data ?? e;
  const detalle = d?.details?.issues?.[0];
  if (detalle?.path && detalle?.message) return `${detalle.path}: ${detalle.message}`;
  return d?.message || d?.error || e?.message || porDefecto;
}

export default function Leads() {
  useAutoTour(HELP_GUIDE);
  const queryClient = useQueryClient();
  const [filterStage, setFilterStage] = useState<LeadStage | "all">("all");
  
  const { data: leads, isLoading } = useListLeads(
    { stage: filterStage === "all" ? undefined : filterStage },
    { query: { queryKey: getListLeadsQueryKey({ stage: filterStage === "all" ? undefined : filterStage }), refetchInterval: 3000 } }
  );

  const deleteLead = useDeleteLead();

  const handleDelete = (id: number) => {
    if(!confirm("¿Seguro que deseas eliminar este prospecto?")) return;
    deleteLead.mutate({ id }, {
      onSuccess: () => {
        toast.success("Prospecto eliminado");
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
      },
      onError: (e: any) => toast.error(mensajeDeError(e, "No pudimos eliminar el prospecto.")),
    });
  };

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <div className="flex items-start gap-1.5">
              <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">Prospectos (CRM)</h1>
              <HelpTourButton guide={HELP_GUIDE} />
            </div>
            <p className="text-sm text-slate-500 mt-1">Gestiona tus contactos y oportunidades de venta.</p>
          </div>
          <LeadModal mode="create" open={isNewModalOpen} onOpenChange={setIsNewModalOpen}>
            <Button data-tour="leads-new-button" className="shadow-sm"><Plus className="h-4 w-4 mr-2"/> Nuevo Prospecto</Button>
          </LeadModal>
        </div>

        {/* Filter Bar */}
        <div data-tour="leads-stage-filter" className="bg-white border border-slate-200 p-2 rounded-xl flex gap-4 items-center sticky top-[80px] z-10 overflow-hidden">
          {/* Móvil: desplegable de una línea. Las 7 etapas en fila se salían
              del ancho del teléfono y quedaban ocultas a la derecha. */}
          <div className="md:hidden w-full px-1">
            <Select value={filterStage} onValueChange={(v) => setFilterStage(v as LeadStage | "all")}>
              <SelectTrigger className="w-full h-9 rounded-full text-xs">
                <SelectValue placeholder="Todas las etapas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las etapas</SelectItem>
                {Object.entries(stageNames).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ScrollArea contentWidth className="hidden md:block w-full max-w-[calc(100vw-3rem)]">
            <div className="flex gap-2 pb-2 md:pb-0 px-2 items-center min-w-max">
              <Button
                variant={filterStage === "all" ? "default" : "ghost"}
                className={`rounded-full h-8 px-4 text-xs font-medium transition-all ${filterStage === 'all' ? 'shadow-sm' : 'hover:bg-muted'}`}
                onClick={() => setFilterStage("all")}
              >
                Todas las etapas
              </Button>
              {Object.entries(stageNames).map(([k, v]) => (
                <Button
                  key={k}
                  variant={filterStage === k ? "default" : "ghost"}
                  className={`rounded-full h-8 px-4 text-xs font-medium transition-all ${filterStage === k ? 'shadow-sm' : 'hover:bg-muted'}`}
                  onClick={() => setFilterStage(k as LeadStage)}
                >
                  {v}
                </Button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" className="hidden md:flex" />
          </ScrollArea>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
          </div>
        ) : leads?.length === 0 ? (
          <div className="text-center py-20 text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="h-10 w-10 text-primary opacity-80" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No hay prospectos</h3>
            <p className="max-w-md mx-auto mb-6 text-sm text-slate-500">
              {filterStage === 'all' 
                ? 'Añade tu primer prospecto o espera a que los agentes IA generen leads automáticamente.'
                : 'No hay prospectos en esta etapa. Ajusta los filtros para ver más resultados.'}
            </p>
            {filterStage !== "all" ? (
              <Button variant="outline" onClick={() => setFilterStage("all")}>Mostrar todos</Button>
            ) : (
              <Button variant="default" onClick={() => setIsNewModalOpen(true)}>Añadir Prospecto</Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(Array.isArray(leads) ? leads : []).map(lead => (
              <Card key={lead.id} className={`flex flex-col relative overflow-hidden bg-white border border-slate-200 rounded-xl hover:shadow-sm transition-shadow border-l-[6px] ${stageColors[lead.stage].split(' ')[0]}`}>
                <CardHeader className="pb-3 flex-row justify-between items-start gap-2 pt-5">
                  <div className="flex gap-3 items-start min-w-0">
                    <div className={`w-10 h-10 rounded-full flex shrink-0 items-center justify-center font-bold text-sm ${stageColors[lead.stage].replace('border-', 'bg-').split(' ')[1]} ${stageColors[lead.stage].split(' ')[2]}`}>
                      {lead.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <CardTitle className="text-base truncate leading-none mb-1 text-slate-900" title={lead.name}>{lead.name}</CardTitle>
                      <Badge variant="outline" className={`border-transparent text-[10px] px-1.5 py-0 font-medium ${stageColors[lead.stage].replace('border-', '')}`}>
                        {stageNames[lead.stage].split(' ')[0]}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="-mr-2 -mt-2 h-8 w-8 hover:bg-slate-100 rounded-full shrink-0"><MoreVertical className="h-4 w-4 text-slate-500"/></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <LeadModal mode="edit" lead={lead}>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}><Edit className="h-4 w-4 mr-2 text-slate-500"/> Editar</DropdownMenuItem>
                      </LeadModal>
                      <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => handleDelete(lead.id)}>
                        <Trash2 className="h-4 w-4 mr-2"/> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent className="flex-1 text-sm space-y-3 pb-2">
                  <div className="space-y-2">
                    <div className="flex items-center text-slate-500">
                      <Phone className="h-3.5 w-3.5 mr-2 shrink-0 text-slate-400" />
                      <span className="truncate font-medium text-slate-700">{lead.phone}</span>
                    </div>
                    {lead.email && (
                      <div className="flex items-center text-slate-500">
                        <Mail className="h-3.5 w-3.5 mr-2 shrink-0 text-slate-400" />
                        <span className="truncate text-xs text-slate-600">{lead.email}</span>
                      </div>
                    )}
                  </div>
                  
                  {lead.notes && (
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs text-slate-500 line-clamp-2 italic">
                      "{lead.notes}"
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Tag className="h-3 w-3 text-slate-400" />
                      <span className="truncate max-w-[100px]">{lead.source || 'Sin origen'}</span>
                    </div>
                    {lead.value > 0 && (
                      <span className="font-bold text-slate-900 tabular-nums-all bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                        ${lead.value.toLocaleString()}
                      </span>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500 font-medium">
                  Actualizado {format(parseISO(lead.createdAt), "d MMM", { locale: es })}
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function LeadModal({ mode, lead, children, open: controlledOpen, onOpenChange }: { 
  mode: 'create'|'edit', 
  lead?: any, 
  children?: React.ReactNode,
  open?: boolean,
  onOpenChange?: (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;
  
  const queryClient = useQueryClient();
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();

  const [formData, setFormData] = useState({
    name: lead?.name || "",
    phone: lead?.phone || "",
    email: lead?.email || "",
    stage: lead?.stage || "new",
    value: lead?.value?.toString() || "0",
    notes: lead?.notes || "",
    source: lead?.source || ""
  });

  const handleSubmit = () => {
    if(!formData.name || !formData.phone) {
      toast.error("Nombre y teléfono son requeridos");
      return;
    }

    const payload = {
      ...formData,
      value: parseFloat(formData.value) || 0,
      email: formData.email || null,
      notes: formData.notes || null,
      source: formData.source || null,
    };

    if (mode === 'create') {
      createLead.mutate({ data: payload as any }, {
        onSuccess: () => {
          toast.success("Prospecto creado");
          queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
          setIsOpen(false);
        },
        // El modal NO se cierra: si se cierra, se pierde todo lo que escribio.
        onError: (e: any) => toast.error(mensajeDeError(e, "No pudimos guardar el prospecto. Intentá de nuevo.")),
      });
    } else {
      updateLead.mutate({ id: lead.id, data: payload as any }, {
        onSuccess: () => {
          toast.success("Prospecto actualizado");
          queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
          setIsOpen(false);
        },
        onError: (e: any) => toast.error(mensajeDeError(e, "No pudimos actualizar el prospecto.")),
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => {
      if(o && mode==='edit' && lead) {
        setFormData({
          name: lead.name, phone: lead.phone, email: lead.email || "", 
          stage: lead.stage, value: lead.value.toString(), notes: lead.notes || "", source: lead.source || ""
        });
      } else if (o && mode === 'create') {
        setFormData({ name: "", phone: "", email: "", stage: "new", value: "0", notes: "", source: "" });
      }
      setIsOpen(o);
    }}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      {/* max-h + columna flex: el mismo patron que ya usan los modales de
          Producto y Agente. Sin esto, en una pantalla de ~535px de alto el
          modal quedaba mas alto que la ventana y el pie con Cancelar/Guardar
          se cortaba abajo -- y la rueda del mouse no lo traia porque el
          scroll se lo comia el textarea de Notas. Invisible en un monitor
          grande, bloqueante en un portatil. */}
      <DialogContent className="max-w-xl p-0 gap-0 max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="p-6 pb-4 border-b bg-muted/5 shrink-0">
          <DialogTitle className="text-xl">{mode === 'create' ? 'Nuevo Prospecto' : 'Editar Prospecto'}</DialogTitle>
        </DialogHeader>
        
        <div className="p-6 grid gap-6 overflow-y-auto flex-1 min-h-0">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre completo *</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ej. Juan Pérez" className="font-medium" />
            </div>
            <div className="space-y-2">
              <Label>Teléfono *</Label>
              <Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="+52 1..." />
            </div>
            <div className="space-y-2">
              <Label>Correo electrónico</Label>
              <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="correo@ejemplo.com" />
            </div>
            <div className="space-y-2">
              <Label>Origen / Fuente</Label>
              <Input value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})} placeholder="Ej. Campaña FB, Referido..." />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-xl border">
            <div className="space-y-2">
              <Label>Etapa del Embudo</Label>
              <Select value={formData.stage} onValueChange={(v: any) => setFormData({...formData, stage: v})}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Seleccionar etapa" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(stageNames).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor estimado ($)</Label>
              <Input type="number" min="0" step="0.01" value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})} className="bg-background tabular-nums-all font-bold" />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Notas y contexto</Label>
            <Textarea 
              value={formData.notes} 
              onChange={e => setFormData({...formData, notes: e.target.value})}
              placeholder="Detalles adicionales sobre el prospecto o la oportunidad que la IA debe saber..."
              className="h-24 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="p-6 border-t bg-muted/10 shrink-0">
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createLead.isPending || updateLead.isPending} className="min-w-[120px]">
            <Save className="h-4 w-4 mr-2" /> Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}