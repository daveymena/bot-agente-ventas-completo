import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2500),
      setTimeout(() => setPhase(4), 4500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-[var(--color-secondary)] text-[var(--color-bg-dark)] p-[5vw]"
      initial={{ clipPath: 'inset(0 100% 0 0)' }}
      animate={{ clipPath: 'inset(0 0% 0 0)' }}
      exit={{ opacity: 0, scale: 1.2 }}
      transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="flex w-full justify-around items-center h-full">
        
        <div className="flex flex-col items-center text-center">
          <motion.div
            className="text-[12vw] font-black font-display leading-none"
            initial={{ scale: 0, opacity: 0, rotate: -45 }}
            animate={phase >= 1 ? { scale: 1, opacity: 1, rotate: 0 } : { scale: 0, opacity: 0, rotate: -45 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            3x
          </motion.div>
          <motion.div
            className="text-[2.5vw] font-bold uppercase tracking-widest"
            initial={{ y: 20, opacity: 0 }}
            animate={phase >= 2 ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            Más Ventas
          </motion.div>
        </div>

        <motion.div 
          className="w-1 h-[40vh] bg-[var(--color-bg-dark)] opacity-20"
          initial={{ scaleY: 0 }}
          animate={phase >= 2 ? { scaleY: 1 } : { scaleY: 0 }}
          transition={{ duration: 0.8, ease: "circOut" }}
        />

        <div className="flex flex-col items-center text-center">
          <motion.div
            className="text-[12vw] font-black font-display leading-none"
            initial={{ scale: 0, opacity: 0, rotate: 45 }}
            animate={phase >= 2 ? { scale: 1, opacity: 1, rotate: 0 } : { scale: 0, opacity: 0, rotate: 45 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            10
          </motion.div>
          <motion.div
            className="text-[2.5vw] font-bold uppercase tracking-widest"
            initial={{ y: 20, opacity: 0 }}
            animate={phase >= 3 ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            Min para empezar
          </motion.div>
        </div>
        
      </div>
    </motion.div>
  );
}