/**
 * ============================================================
 * PROVIDER CONFIG - UI para Configurar API Providers
 * ============================================================
 * Panel para clientes: elegir provider, validar keys, ver costos
 */

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { describeError } from "@/lib/utils";
import { SecretInput } from "@/components/ui/secret-input";

interface Provider {
  id: string;
  provider: string;
  apiKey: string;
  model: string;
  isActive: boolean;
}

interface TestResult {
  provider: string;
  valid: boolean;
  latency: number;
  message: string;
  models?: string[];
  error?: string;
}

interface CostReport {
  period: string;
  totalCost: number;
  byProvider: Record<string, { cost: number; tokens: number; requests: number }>;
  estimatedMonthly: number;
  trending: "up" | "down" | "stable";
}

const PROVIDERS = ["openai", "claude", "azure", "g4f"];

export default function ProviderConfig() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [costReport, setCostReport] = useState<CostReport | null>(null);
  const [availableModels, setAvailableModels] = useState<Record<string, string[]>>({});
  const [costPeriod, setCostPeriod] = useState<"today" | "week" | "month">("month");

  // Form state
  const [formData, setFormData] = useState({
    provider: "openai" as string,
    apiKey: "",
    model: "gpt-5.6-luna",
    resourceName: "",
  });

  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Cargar datos iniciales
  useEffect(() => {
    loadProviders();
    loadAvailableModels();
    loadCosts();
  }, [costPeriod]);

  const loadProviders = async () => {
    try {
      const res = await fetch("/api/settings/providers");
      const data = await res.json();
      setProviders(data.providers || []);
    } catch (error) {
      console.error("Error loading providers:", error);
    }
  };

  const loadAvailableModels = async () => {
    try {
      const res = await fetch("/api/settings/provider-models");
      const data = await res.json();
      setAvailableModels(data.models || {});
    } catch (error) {
      console.error("Error loading models:", error);
    }
  };

  const loadCosts = async () => {
    try {
      const res = await fetch(`/api/settings/costs?period=${costPeriod}`);
      const data = await res.json();
      setCostReport(data.report);
    } catch (error) {
      console.error("Error loading costs:", error);
    }
  };

  const testProvider = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/settings/test-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: formData.provider,
          apiKey: formData.apiKey,
          resourceName: formData.resourceName,
        }),
      });

      const data = await res.json();
      setTestResult(data.test);

      if (data.test.valid) {
        toast.success(`✅ ${formData.provider} conectado exitosamente`);
      } else {
        toast.error(`❌ Error: ${data.test.message}`);
      }
    } catch (error) {
      toast.error("Error testeando provider");
      console.error(error);
    } finally {
      setTesting(false);
    }
  };

  const addProvider = async () => {
    if (!formData.apiKey) {
      toast.error("API key requerida");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/settings/add-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: formData.provider,
          apiKey: formData.apiKey,
          model: formData.model,
          resourceName: formData.resourceName,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        toast.success("Provider configurado exitosamente");
        setShowAddForm(false);
        setFormData({
          provider: "openai",
          apiKey: "",
          model: "gpt-5.6-luna",
          resourceName: "",
        });
        loadProviders();
      } else {
        toast.error(describeError(new Error(data.error), "No se pudo configurar el proveedor"));
      }
    } catch (error) {
      toast.error("No se pudo agregar el proveedor. Intentá de nuevo.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 p-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">⚙️ Configuración de Providers</h1>
          <p className="text-gray-600 mt-2">
            Gestiona tus API keys y elige el mejor proveedor de IA
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          {showAddForm ? "Cancelar" : "+ Añadir Provider"}
        </button>
      </div>

      {/* FORMULARIO DE AÑADIR */}
      {showAddForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-xl font-semibold">Nuevo Provider</h2>

          {/* Selector de Provider */}
          <div>
            <label className="block text-sm font-medium mb-2">Proveedor</label>
            <select
              value={formData.provider}
              onChange={(e) => {
                setFormData({ ...formData, provider: e.target.value });
                setTestResult(null);
              }}
              className="w-full border rounded-lg px-3 py-2"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium mb-2">API Key</label>
            <SecretInput
              value={formData.apiKey}
              onChange={(v) => setFormData({ ...formData, apiKey: v })}
              placeholder="Pega tu API key aquí"
            />
            <p className="text-xs text-gray-500 mt-1">
              Tu key será encriptada y almacenada de forma segura
            </p>
          </div>

          {/* Resource Name (solo Azure) */}
          {formData.provider === "azure" && (
            <div>
              <label className="block text-sm font-medium mb-2">Resource Name</label>
              <input
                type="text"
                value={formData.resourceName}
                onChange={(e) =>
                  setFormData({ ...formData, resourceName: e.target.value })
                }
                placeholder="ej: my-azure-resource"
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
          )}

          {/* Modelo */}
          <div>
            <label className="block text-sm font-medium mb-2">Modelo Defecto</label>
            <select
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
            >
              {(availableModels[formData.provider] || []).map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={`rounded-lg p-4 ${
                testResult.valid
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              <p className="font-semibold">{testResult.message}</p>
              <p className="text-sm text-gray-600">Latencia: {testResult.latency}ms</p>
              {testResult.models && (
                <p className="text-sm text-gray-600">
                  Modelos: {testResult.models.join(", ")}
                </p>
              )}
              {testResult.error && (
                <p className="text-sm text-red-600">{testResult.error}</p>
              )}
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-2">
            <button
              onClick={testProvider}
              disabled={testing || !formData.apiKey}
              className="flex-1 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50"
            >
              {testing ? "Testeando..." : "🧪 Testear Conexión"}
            </button>
            <button
              onClick={addProvider}
              disabled={loading || !testResult?.valid}
              className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? "Guardando..." : "✅ Guardar Provider"}
            </button>
          </div>
        </div>
      )}

      {/* LISTA DE PROVIDERS */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-4">Providers Configurados</h2>
        {providers.length === 0 ? (
          <p className="text-gray-600">No hay providers configurados aún</p>
        ) : (
          <div className="space-y-4">
            {providers.map((provider) => (
              <div
                key={provider.id}
                className="border rounded-lg p-4 flex justify-between items-center"
              >
                <div>
                  <p className="font-semibold">{provider.provider.toUpperCase()}</p>
                  <p className="text-sm text-gray-600">
                    Modelo: {provider.model}
                  </p>
                  <p className="text-xs text-gray-500">
                    API Key: {provider.apiKey}
                  </p>
                </div>
                <div className="text-right">
                  {provider.isActive ? (
                    <span className="inline-block bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                      ✅ Activo
                    </span>
                  ) : (
                    <span className="inline-block bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-medium">
                      Inactivo
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DASHBOARD DE COSTOS */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">💰 Dashboard de Costos</h2>
          <select
            value={costPeriod}
            onChange={(e) => setCostPeriod(e.target.value as any)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="today">Hoy</option>
            <option value="week">Esta Semana</option>
            <option value="month">Este Mes</option>
          </select>
        </div>

        {costReport ? (
          <div className="space-y-6">
            {/* MÉTRICAS PRINCIPALES */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
                <p className="text-sm text-gray-600">Costo Total</p>
                <p className="text-3xl font-bold text-blue-600">
                  ${costReport.totalCost.toFixed(2)}
                </p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
                <p className="text-sm text-gray-600">Estimado Mensual</p>
                <p className="text-3xl font-bold text-green-600">
                  ${costReport.estimatedMonthly.toFixed(2)}
                </p>
              </div>
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4">
                <p className="text-sm text-gray-600">Tendencia</p>
                <p className="text-2xl font-bold">
                  {costReport.trending === "up" ? "📈" : costReport.trending === "down" ? "📉" : "→"}
                </p>
              </div>
            </div>

            {/* POR PROVIDER */}
            <div>
              <h3 className="font-semibold mb-3">Por Provider</h3>
              <div className="space-y-2">
                {Object.entries(costReport.byProvider).map(([provider, data]) => (
                  <div key={provider} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <div>
                      <p className="font-medium">{provider}</p>
                      <p className="text-xs text-gray-600">
                        {data.requests} requests • {data.tokens.toLocaleString()} tokens
                      </p>
                    </div>
                    <p className="font-semibold">${data.cost.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* MODELO MÁS CARO */}
            {Object.keys(costReport.byProvider).length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-gray-600">Modelo Más Usado</p>
                <p className="text-lg font-semibold">{costReport.byProvider}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-600">Cargando datos de costos...</p>
        )}
      </div>

      {/* TABLA DE PRECIOS */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-4">📊 Tabla de Precios por Modelo</h2>
        <p className="text-sm text-gray-600 mb-4">
          Precios estimados en USD por millón de tokens
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(availableModels).map(([provider, models]) => (
            <div key={provider} className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3 uppercase">{provider}</h3>
              <div className="space-y-2">
                {models.slice(0, 3).map((model) => (
                  <div key={model} className="text-sm">
                    <p className="font-medium text-gray-700">{model}</p>
                    <p className="text-xs text-gray-500">Click para ver detalles</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
