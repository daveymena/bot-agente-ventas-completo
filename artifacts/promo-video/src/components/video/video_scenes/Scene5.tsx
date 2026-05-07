import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video/animations';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3000),
      setTimeout(() => setPhase(4), 5000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center p-[5vw] text-center"
      {...sceneTransitions.zoomThrough}
    >
      <motion.div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          background: 'radial-gradient(circle at center, var(--color-primary) 0%, transparent 60%)'
        }}
        animate={phase >= 1 ? { scale: [1, 1.5, 1] } : {}}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.h1 
        className="text-[6vw] font-black font-display leading-[1.1] tracking-tight mb-[2vh] z-10"
        initial={{ y: 50, opacity: 0 }}
        animate={phase >= 1 ? { y: 0, opacity: 1 } : { y: 50, opacity: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        Tu vendedor <span className="text-[var(--color-accent)]">trabaja 24/7.</span>
      </motion.h1>

      <motion.h2
        className="text-[5vw] font-bold text-[var(--color-text-secondary)] mb-[8vh] z-10"
        initial={{ y: 30, opacity: 0 }}
        animate={phase >= 2 ? { y: 0, opacity: 1 } : { y: 30, opacity: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        Tú te dedicas a crecer.
      </motion.h2>

      <motion.div
        className="px-[4vw] py-[2vh] bg-[var(--color-primary)] text-white text-[3vw] font-bold rounded-full z-10 overflow-hidden relative"
        initial={{ scale: 0, opacity: 0 }}
        animate={phase >= 3 ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <span className="relative z-10">EMPIEZA GRATIS</span>
        <motion.div 
          className="absolute inset-0 bg-white/20"
          initial={{ x: '-100%' }}
          animate={phase >= 3 ? { x: '100%' } : { x: '-100%' }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: 1 }}
        />
      </motion.div>
      
      {/* Loop exit wipe */}
      <motion.div
        className="absolute inset-0 bg-[var(--color-bg-dark)] origin-top z-50"
        initial={{ scaleY: 0 }}
        animate={phase >= 4 ? { scaleY: 1 } : { scaleY: 0 }}
        transition={{ duration: 0.8, ease: [0.64, 0, 0.78, 0] }}
      />
    </motion.div>
  );
}