import { useState, useEffect } from "react";
import { 
  useListAgents, getListAgentsQueryKey,
  useCreateAgent,
  useUpdateAgent,
  useDeleteAgent,
  useActivateAgent
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, Plus, Star, MoreVertical, Edit, Trash2, Save, X, Sparkles, MessageSquare, ArrowUp, ArrowDown } from "lucide-react";
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

const getStageBadgeClass = (index: number) => {
  const styles = [
    'bg-blue-50 text-blue-700 border-blue-200',
    'bg-purple-50 text-purple-700 border-purple-200',
    'bg-amber-50 text-amber-700 border-amber-200',
    'bg-emerald-50 text-emerald-700 border-emerald-200',
    'bg-teal-50 text-teal-700 border-teal-200'
  ];
  return styles[index % styles.length];
};

const HELP_GUIDE = getHelpGuide("agents")!;

export default function Agents() {
  useAutoTour(HELP_GUIDE);
  const queryClient = useQueryClient();
  const { data: agents, isLoading } = useListAgents({
    query: { queryKey: getListAgentsQueryKey() }
  });

  const activateAgent = useActivateAgent();
  const deleteAgent = useDeleteAgent();

  const handleActivate = (id: number) => {
    activateAgent.mutate({ id }, {
      onSuccess: () => {
        toast.success("Agente activado");
        queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
      },
      onError: () => toast.error("Error al activar agente")
    });
  };

  const handleDelete = (id: number) => {
    if(!confirm("¿Seguro que deseas eliminar este agente?")) return;
    deleteAgent.mutate({ id }, {
      onSuccess: () => {
        toast.success("Agente eliminado");
        queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
      },
      onError: () => toast.error("Error al eliminar agente")
    });
  };

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <div className="flex items-start gap-1.5">
              <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">Agentes IA</h1>
              <HelpTourButton guide={HELP_GUIDE} />
            </div>
            <p className="text-sm text-slate-500 mt-1">Configura y entrena a los agentes que automatizan tus ventas.</p>
          </div>
          <AgentModal mode="create" open={isNewModalOpen} onOpenChange={setIsNewModalOpen}>
            <Button data-tour="agents-new-button"><Plus className="h-4 w-4 mr-2"/> Nuevo Agente</Button>
          </AgentModal>
        </div>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-80 w-full rounded-xl" />)}
          </div>
        ) : agents?.length === 0 ? (
          <div className="text-center py-20 text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Bot className="h-10 w-10 text-primary opacity-80" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No hay agentes</h3>
            <p className="max-w-md mx-auto mb-6 text-sm text-slate-500">Crea tu primer agente IA para empezar a atender a tus clientes de forma automática las 24 horas.</p>
            <Button variant="default" onClick={() => setIsNewModalOpen(true)}>Crear Primer Agente</Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {(Array.isArray(agents) ? agents : []).map(agent => (
              <Card key={agent.id} className={`group flex flex-col relative overflow-hidden bg-white rounded-xl shadow-sm transition-shadow hover:shadow ${agent.isActive ? 'border border-primary/60 ring-1 ring-primary/20' : 'border border-slate-200'}`}>
                {agent.isActive && (
                  <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
                )}
                <CardHeader className="pb-4 relative pt-6 px-6">
                  <div className="absolute right-4 top-4 z-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-slate-100 text-slate-500"><MoreVertical className="h-4 w-4"/></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <AgentModal mode="edit" agent={agent}>
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()}><Edit className="h-4 w-4 mr-2 text-slate-500"/> Editar</DropdownMenuItem>
                        </AgentModal>
                        <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => handleDelete(agent.id)}>
                          <Trash2 className="h-4 w-4 mr-2"/> Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  
                  <div className="flex gap-4 items-start">
                    <div className="relative">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold border-2 ${agent.isActive ? 'border-primary text-primary bg-primary/10' : 'border-slate-200 text-slate-500 bg-slate-50'}`}>
                        {agent.name.substring(0, 1).toUpperCase()}
                      </div>
                      {agent.isActive && (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4">
                          <span className="inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white"></span>
                        </span>
                      )}
                    </div>
                    <div className="pt-1 pr-6">
                      <CardTitle className="text-lg font-semibold text-slate-900 leading-tight mb-1">{agent.name}</CardTitle>
                      <CardDescription className="font-normal text-slate-500 text-sm">{agent.role}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 text-sm space-y-5 px-6">
                  <div className="flex gap-2">
                    <Badge variant="outline" className="bg-slate-50 border-slate-200 text-slate-600 rounded-md text-[11px] font-medium tracking-wide">
                      <Sparkles className="h-3 w-3 mr-1 text-slate-400" /> {agent.model}
                    </Badge>
                    <Badge variant="outline" className="bg-slate-50 border-slate-200 text-slate-600 rounded-md text-[11px] font-medium tracking-wide">
                      <MessageSquare className="h-3 w-3 mr-1 text-slate-400" /> {agent.tone}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Flujo de conversación</span>
                    <div className="flex flex-wrap gap-1.5">
                      {agent.stages?.map((s, i) => (
                        <Badge key={s.key} variant="outline" className={`text-[10px] px-2 py-0.5 border ${getStageBadgeClass(i)}`}>
                          {s.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="p-4 pt-4 border-t border-slate-100 bg-slate-50/50">
                  <div className="w-full flex justify-between items-center gap-4">
                    <span className="text-xs text-slate-500 font-medium">Creado {format(parseISO(agent.createdAt), "d MMM yyyy", { locale: es })}</span>
                    {!agent.isActive ? (
                      <Button data-tour="agents-activate-button" variant="default" size="sm" className="rounded-full shadow-sm" onClick={() => handleActivate(agent.id)} disabled={activateAgent.isPending}>
                        <Star className="h-3.5 w-3.5 mr-1.5" /> Activar
                      </Button>
                    ) : (
                      <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-200">Operando</Badge>
                    )}
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function AgentModal({ mode, agent, children, open: controlledOpen, onOpenChange }: { 
  mode: 'create'|'edit', 
  agent?: any, 
  children?: React.ReactNode,
  open?: boolean,
  onOpenChange?: (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;
  
  const queryClient = useQueryClient();
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();

  const defaultStages = [
    { key: "greeting", name: "Saludo", prompt: "Saluda amablemente y ofrece ayuda." },
    { key: "qualification", name: "Calificación", prompt: "Haz preguntas para entender la necesidad del cliente." },
    { key: "presentation", name: "Presentación", prompt: "Muestra las opciones y beneficios relevantes." },
    { key: "closing", name: "Cierre", prompt: "Propón la venta y los siguientes pasos." }
  ];

  const [formData, setFormData] = useState({
    name: agent?.name || "",
    role: agent?.role || "",
    tone: agent?.tone || "profesional y persuasivo",
    language: agent?.language || "es",
    model: agent?.model || "gpt-4o-mini",
    systemPrompt: agent?.systemPrompt || "",
    stages: agent?.stages || defaultStages
  });

  useEffect(() => {
    if (isOpen && mode === 'edit' && agent) {
      setFormData({
        name: agent.name, role: agent.role, tone: agent.tone, language: agent.language, model: agent.model, systemPrompt: agent.systemPrompt, stages: agent.stages || []
      });
    } else if (isOpen && mode === 'create') {
      setFormData({ name: "", role: "", tone: "profesional y persuasivo", language: "es", model: "gpt-4o-mini", systemPrompt: "", stages: defaultStages });
    }
  }, [isOpen, agent, mode]);

  const handleSubmit = () => {
    if(!formData.name || !formData.role) {
      toast.error("Nombre y rol son requeridos");
      return;
    }

    if (mode === 'create') {
      createAgent.mutate({ data: formData }, {
        onSuccess: () => {
          toast.success("Agente creado");
          queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
          setIsOpen(false);
        },
        onError: () => toast.error("Error al crear agente")
      });
    } else {
      updateAgent.mutate({ id: agent.id, data: formData }, {
        onSuccess: () => {
          toast.success("Agente actualizado");
          queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
          setIsOpen(false);
        },
        onError: () => toast.error("Error al actualizar agente")
      });
    }
  };

  const updateStage = (index: number, field: string, value: string) => {
    const newStages = [...formData.stages];
    newStages[index] = { ...newStages[index], [field]: value };
    setFormData({ ...formData, stages: newStages });
  };

  const addStage = () => {
    setFormData({ ...formData, stages: [...formData.stages, { key: "new_stage", name: "Nueva Etapa", prompt: "" }] });
  };

  const removeStage = (index: number) => {
    const newStages = [...formData.stages];
    newStages.splice(index, 1);
    setFormData({ ...formData, stages: newStages });
  };

  const moveStageUp = (index: number) => {
    if (index === 0) return;
    const newStages = [...formData.stages];
    const temp = newStages[index - 1];
    newStages[index - 1] = newStages[index];
    newStages[index] = temp;
    setFormData({ ...formData, stages: newStages });
  };

  const moveStageDown = (index: number) => {
    if (index === formData.stages.length - 1) return;
    const newStages = [...formData.stages];
    const temp = newStages[index + 1];
    newStages[index + 1] = newStages[index];
    newStages[index] = temp;
    setFormData({ ...formData, stages: newStages });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0 border-slate-200">
        <DialogHeader className="p-6 pb-4 border-b border-slate-200">
          <DialogTitle className="text-xl font-semibold text-slate-900">{mode === 'create' ? 'Crear Nuevo Agente' : 'Editar Agente'}</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          <div className="grid gap-8">
            <div className="grid md:grid-cols-2 gap-6 p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-700">Nombre del Agente</Label>
                  <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ej. Alex - Ventas B2B" className="font-medium text-slate-900" />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700">Rol / Puesto</Label>
                  <Input value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} placeholder="Ej. Asesor Comercial Senior" />
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-700">Tono de comunicación</Label>
                  <Input value={formData.tone} onChange={e => setFormData({...formData, tone: e.target.value})} placeholder="Ej. Amable, profesional, persuasivo" />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700">Modelo de IA</Label>
                  <Input value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} placeholder="gpt-4o-mini" />
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-slate-900">Instrucciones Maestras (System Prompt)</Label>
              <Textarea 
                value={formData.systemPrompt} 
                onChange={e => setFormData({...formData, systemPrompt: e.target.value})}
                placeholder="Instrucciones generales, límites y comportamiento base del agente..."
                className="h-32 resize-none font-mono text-sm leading-relaxed bg-white border-slate-200"
              />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end border-b border-slate-200 pb-2">
                <div>
                  <Label className="text-base font-semibold text-slate-900">Flujo de Conversación (Etapas)</Label>
                  <p className="text-sm text-slate-500">El agente avanzará al usuario por estas etapas de forma secuencial.</p>
                </div>
                <Button variant="secondary" size="sm" onClick={addStage} className="rounded-full shadow-none"><Plus className="h-4 w-4 mr-1"/> Añadir etapa</Button>
              </div>
              
              <div className="space-y-4">
                {formData.stages.map((stage: any, i: number) => (
                  <div key={i} className="flex gap-4 items-start p-4 rounded-xl bg-white border border-slate-200 shadow-sm relative group transition-colors hover:border-slate-300">
                    <div className="flex-none pt-2">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-semibold text-slate-600 border border-slate-200 text-sm">
                        {i + 1}
                      </div>
                    </div>
                    <div className="flex-1 grid md:grid-cols-3 gap-4">
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs text-slate-500">Identificador</Label>
                          <Input className="h-8 text-sm font-mono bg-slate-50 border-slate-200 text-slate-700" value={stage.key} onChange={e => updateStage(i, 'key', e.target.value)} />
                        </div>
                        <div>
                          <Label className="text-xs text-slate-500">Nombre</Label>
                          <Input className="h-8 text-sm font-medium border-slate-200 text-slate-900" value={stage.name} onChange={e => updateStage(i, 'name', e.target.value)} />
                        </div>
                      </div>
                      <div className="md:col-span-2 space-y-1">
                        <Label className="text-xs text-slate-500">Instrucciones de esta etapa</Label>
                        <Textarea className="h-[76px] text-sm resize-none border-slate-200" value={stage.prompt} onChange={e => updateStage(i, 'prompt', e.target.value)} placeholder="¿Qué debe hacer o preguntar el agente en esta fase?" />
                      </div>
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700 hover:bg-slate-100" onClick={() => moveStageUp(i)} disabled={i === 0}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700 hover:bg-slate-100" onClick={() => moveStageDown(i)} disabled={i === formData.stages.length - 1}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-destructive hover:bg-destructive/10" onClick={() => removeStage(i)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 border-t border-slate-200 bg-white">
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createAgent.isPending || updateAgent.isPending} className="min-w-[120px] shadow-sm">
            <Save className="h-4 w-4 mr-2" /> Guardar Agente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}