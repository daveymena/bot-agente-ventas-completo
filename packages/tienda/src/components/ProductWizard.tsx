import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { useStore } from '../store/useStore';

const ProductWizard = () => {
  const [step, setStep] = useState(1);
  const [selections, setSelections] = useState<any>({});
  const { products } = useStore();

  const nextStep = (key: string, value: string) => {
    setSelections({ ...selections, [key]: value });
    setStep(step + 1);
  };

  const reset = () => {
    setStep(1);
    setSelections({});
  };

  const getRecommendations = () => {
    return products.filter(p => {
      if (selections.type && p.type !== selections.type) return false;
      if (selections.category && p.category !== selections.category) return false;
      return true;
    }).slice(0, 2);
  };

  return (
    <div className="bg-slate-900 rounded-[3rem] p-8 md:p-16 text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 p-8 opacity-10">
        <Sparkles className="w-32 h-32" />
      </div>

      <div className="relative z-10 max-w-2xl">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              key="step1"
            >
              <h2 className="text-4xl font-black mb-6">¿Qué buscas hoy?</h2>
              <p className="text-slate-400 mb-8">Ayúdanos a recomendarte lo mejor para tu perfil.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button 
                  onClick={() => nextStep('type', 'digital')}
                  className="p-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all text-left group"
                >
                  <h3 className="text-xl font-bold mb-1 group-hover:text-indigo-400">Productos Digitales</h3>
                  <p className="text-sm text-slate-500">Cursos, software y descargables.</p>
                </button>
                <button 
                  onClick={() => nextStep('type', 'physical')}
                  className="p-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all text-left group"
                >
                  <h3 className="text-xl font-bold mb-1 group-hover:text-indigo-400">Productos Físicos</h3>
                  <p className="text-sm text-slate-500">Hardware, ropa y gadgets.</p>
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              key="step2"
            >
              <h2 className="text-4xl font-black mb-6">¿Para qué lo necesitas?</h2>
              <div className="grid grid-cols-1 gap-4">
                {['Profesional', 'Gaming', 'Educación', 'Hobby'].map(cat => (
                  <button 
                    key={cat}
                    onClick={() => nextStep('category', cat)}
                    className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-left flex items-center justify-between group"
                  >
                    <span className="font-bold">{cat}</span>
                    <ArrowRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-all" />
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              key="results"
              className="text-center"
            >
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-6" />
              <h2 className="text-4xl font-black mb-4">¡Encontramos opciones!</h2>
              <p className="text-slate-400 mb-8">Basado en tus preferencias, te sugerimos:</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
                {getRecommendations().map(p => (
                  <div key={p.id} className="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center gap-4 text-left">
                    <img src={p.image} className="w-16 h-16 rounded-lg object-cover" alt="" />
                    <div>
                      <p className="font-bold text-sm">{p.name}</p>
                      <p className="text-indigo-400 font-bold">${p.price}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button 
                onClick={reset}
                className="inline-flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-sm font-bold"
              >
                <RefreshCw className="w-4 h-4" /> REINICIAR ASISTENTE
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ProductWizard;
