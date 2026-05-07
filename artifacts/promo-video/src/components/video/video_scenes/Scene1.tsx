import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video/animations';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2800),
      setTimeout(() => setPhase(4), 4000), // exit start
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center p-[5vw]"
      {...sceneTransitions.scaleFade}
    >
      {/* Decorative pulse ring */}
      <motion.div 
        className="absolute w-[30vw] h-[30vw] border border-[var(--color-primary)] rounded-full opacity-0"
        animate={phase >= 1 ? { scale: [0.5, 2], opacity: [0.8, 0] } : {}}
        transition={{ duration: 2, ease: "easeOut", repeat: Infinity, repeatDelay: 1 }}
      />

      <div className="z-10 text-center flex flex-col items-center">
        <motion.div
          className="bg-[var(--color-bg-muted)] text-[var(--color-primary)] px-[2vw] py-[0.8vw] rounded-full text-[1.5vw] font-bold tracking-widest uppercase mb-[4vh] overflow-hidden"
          initial={{ width: 0, opacity: 0 }}
          animate={phase >= 1 ? { width: 'auto', opacity: 1 } : { width: 0, opacity: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="whitespace-nowrap">EL PROBLEMA</span>
        </motion.div>

        <h1 className="text-[6vw] font-black leading-[1.1] font-display text-white tracking-tight">
          <motion.span 
            className="block opacity-0"
            animate={phase >= 1 ? { opacity: 1, y: [40, 0] } : {}}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            ¿CANSADO DE
          </motion.span>
          <motion.span 
            className="block text-[var(--color-error)] opacity-0"
            animate={phase >= 2 ? { opacity: 1, y: [40, 0], scale: [0.9, 1] } : {}}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            PERDER VENTAS
          </motion.span>
          <motion.span 
            className="block opacity-0"
            animate={phase >= 3 ? { opacity: 1, y: [40, 0] } : {}}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            MIENTRAS DUERMES?
          </motion.span>
        </h1>
        
        <motion.div
          className="absolute w-full h-full inset-0 bg-[var(--color-bg-dark)] z-20 origin-right"
          initial={{ scaleX: 0 }}
          animate={phase >= 4 ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{ duration: 0.8, ease: [0.64, 0, 0.78, 0] }}
        />
      </div>
    </motion.div>
  );
}