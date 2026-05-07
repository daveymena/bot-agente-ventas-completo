import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video/animations';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2400),
      setTimeout(() => setPhase(4), 5000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-start px-[10vw]"
      {...sceneTransitions.wipe}
    >
      <div className="z-10 w-[50vw]">
        <motion.div
          className="w-16 h-1 bg-[var(--color-accent)] mb-[3vh]"
          initial={{ scaleX: 0, originX: 0 }}
          animate={phase >= 1 ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{ duration: 0.6, ease: "circOut" }}
        />
        
        <h1 className="text-[5vw] font-black leading-[1.1] font-display text-white tracking-tight mb-[2vh]">
          <motion.span 
            className="block text-[var(--color-primary)]"
            initial={{ opacity: 0, x: -50 }}
            animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            VENTASPRO
          </motion.span>
          <motion.span 
            className="block"
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            Tu Vendedora IA
          </motion.span>
          <motion.span 
            className="block"
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          >
            en WhatsApp.
          </motion.span>
        </h1>

        <motion.p
          className="text-[2vw] text-[var(--color-text-secondary)] font-medium max-w-[40vw]"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          Conoce a Sofía. Ella nunca duerme.
        </motion.p>
      </div>

      {/* Decorative WhatsApp Phone Mockup abstraction */}
      <motion.div 
        className="absolute right-[10vw] top-[20vh] w-[25vw] h-[60vh] border-4 border-[var(--color-accent)] rounded-[3vw] bg-[var(--color-bg-muted)] overflow-hidden shadow-2xl flex flex-col justify-end p-[1.5vw] gap-[1vh]"
        initial={{ opacity: 0, y: 100, rotate: 10 }}
        animate={phase >= 2 ? { opacity: 1, y: 0, rotate: -5 } : { opacity: 0, y: 100, rotate: 10 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
      >
        <motion.div className="w-[70%] h-[5vh] bg-[var(--color-bg-dark)] rounded-tl-[1vw] rounded-tr-[1vw] rounded-br-[1vw] self-start"
          initial={{ opacity: 0, scale: 0.8, transformOrigin: "bottom left" }}
          animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        />
        <motion.div className="w-[80%] h-[8vh] bg-[var(--color-accent)] rounded-tl-[1vw] rounded-tr-[1vw] rounded-bl-[1vw] self-end"
          initial={{ opacity: 0, scale: 0.8, transformOrigin: "bottom right" }}
          animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.3 }}
        />
      </motion.div>
      
      {/* Exit Wipe */}
      <motion.div
        className="absolute inset-0 bg-[var(--color-bg-dark)] origin-bottom z-50"
        initial={{ scaleY: 0 }}
        animate={phase >= 4 ? { scaleY: 1 } : { scaleY: 0 }}
        transition={{ duration: 0.8, ease: [0.64, 0, 0.78, 0] }}
      />
    </motion.div>
  );
}