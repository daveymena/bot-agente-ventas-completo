/**
 * ============================================================
 * CONFIGURATION PAGE - Panel de Administración
 * ============================================================
 * Gestión de providers, modelos, y configuraciones globales
 */

import React, { useState } from "react";
import ProviderConfig from "../components/provider-config";

export default function ConfigurationPage() {
  const [activeTab, setActiveTab] = useState("providers");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <h1 className="text-4xl font-bold">⚙️ Administración</h1>
          <p className="text-gray-600 mt-2">
            Configura providers de IA, modelos, y monitorea costos
          </p>
        </div>
      </div>

      {/* TABS */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab("providers")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "providers"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              🔑 Providers
            </button>
            <button
              onClick={() => setActiveTab("models")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "models"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              🤖 Modelos
            </button>
            <button
              onClick={() => setActiveTab("billing")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "billing"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              💰 Facturación
            </button>
          </div>
        </div>
      </div>

      {/* CONTENIDO */}
      <div className="max-w-7xl mx-auto">
        {activeTab === "providers" && <ProviderConfig />}

        {activeTab === "models" && (
          <div className="p-6">
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <p className="text-gray-600">
                🚧 Sección de modelos disponibles próximamente
              </p>
            </div>
          </div>
        )}

        {activeTab === "billing" && (
          <div className="p-6">
            <div className="bg-white rounded-lg border border-gray-200 p-8">
              <h2 className="text-2xl font-bold mb-4">💰 Facturación y Costos</h2>
              <div className="space-y-4">
                <div className="border-l-4 border-blue-600 pl-4">
                  <h3 className="font-semibold">Presupuesto Mensual</h3>
                  <p className="text-gray-600 text-sm mt-1">
                    Establece un límite mensual y recibe alertas cuando estés cerca del límite
                  </p>
                </div>
                <div className="border-l-4 border-green-600 pl-4">
                  <h3 className="font-semibold">Historial de Pagos</h3>
                  <p className="text-gray-600 text-sm mt-1">
                    Descarga facturas y ve el detalle de tu consumo por provider/modelo
                  </p>
                </div>
                <div className="border-l-4 border-orange-600 pl-4">
                  <h3 className="font-semibold">Optimización de Costos</h3>
                  <p className="text-gray-600 text-sm mt-1">
                    Recomendaciones para reducir gastos usando modelos más económicos
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
