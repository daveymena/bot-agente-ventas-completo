import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video/animations';

const features = [
  { id: 1, title: 'Atiende 24/7', color: 'var(--color-accent)' },
  { id: 2, title: 'Envía Catálogos', color: 'var(--color-primary)' },
  { id: 3, title: 'Genera Links de Pago', color: 'var(--color-secondary)' },
];

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1000), // feat 1
      setTimeout(() => setPhase(3), 2000), // feat 2
      setTimeout(() => setPhase(4), 3000), // feat 3
      setTimeout(() => setPhase(5), 5500), // exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center p-[5vw]"
      {...sceneTransitions.scaleFade}
    >
      <motion.h2 
        className="text-[4vw] font-display font-bold mb-[8vh] text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
        transition={{ duration: 0.6 }}
      >
        Todo en piloto automático
      </motion.h2>

      <div className="flex flex-col gap-[3vh] w-full max-w-[50vw]">
        {features.map((feat, i) => {
          const isActive = phase >= i + 2;
          return (
            <motion.div 
              key={feat.id}
              className="flex items-center gap-[2vw] bg-[var(--color-bg-muted)] p-[2vh] rounded-[1vw] border-l-8 border-transparent overflow-hidden relative"
              initial={{ x: -100, opacity: 0 }}
              animate={isActive ? { x: 0, opacity: 1 } : { x: -100, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              style={{ borderColor: isActive ? feat.color : 'transparent' }}
            >
              <div className="text-[2.5vw] font-bold z-10">{feat.title}</div>
              {/* Highlight sweep */}
              <motion.div 
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{ backgroundColor: feat.color }}
                initial={{ x: '-100%' }}
                animate={isActive ? { x: '100%' } : { x: '-100%' }}
                transition={{ duration: 1.5, ease: "linear", repeat: Infinity }}
              />
            </motion.div>
          );
        })}
      </div>
      
      <motion.div
        className="absolute inset-0 bg-[var(--color-secondary)] origin-left z-50"
        initial={{ scaleX: 0 }}
        animate={phase >= 5 ? { scaleX: 1 } : { scaleX: 0 }}
        transition={{ duration: 0.8, ease: [0.64, 0, 0.78, 0] }}
      />
    </motion.div>
  );
}