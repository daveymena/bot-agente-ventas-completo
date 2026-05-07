import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';

export const SCENE_DURATIONS: Record<string, number> = {
  hook: 5000,
  solution: 6000,
  features: 6500,
  stats: 5500,
  closing: 6000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  hook: Scene1,
  solution: Scene2,
  features: Scene3,
  stats: Scene4,
  closing: Scene5,
};

const scenePos = [
  { x: '10vw', y: '10vh', scale: 1.5, opacity: 0.1 },
  { x: '80vw', y: '20vh', scale: 0.8, opacity: 0.15 },
  { x: '40vw', y: '70vh', scale: 1.2, opacity: 0.1 },
  { x: '80vw', y: '80vh', scale: 2, opacity: 0.05 },
  { x: '50vw', y: '50vh', scale: 3, opacity: 0.15 },
];

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  const pos = scenePos[sceneIndex] ?? scenePos[0];

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[var(--color-bg-dark)]">
      {/* Background layer - OUTSIDE AnimatePresence */}
      <div className="absolute inset-0">
        <motion.div
          className="absolute w-[800px] h-[800px] rounded-full blur-[100px] opacity-20"
          style={{ background: 'var(--color-primary)' }}
          animate={{
            x: ['-20%', '50%', '0%'],
            y: ['0%', '30%', '-20%'],
            scale: [1, 1.2, 0.9],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute w-[600px] h-[600px] rounded-full blur-[100px] opacity-20"
          style={{ background: 'var(--color-secondary)' }}
          animate={{
            x: ['50%', '10%', '60%'],
            y: ['50%', '0%', '40%'],
            scale: [1.1, 0.9, 1.2],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Midground Layer - persists across scenes */}
      <motion.div
        className="absolute w-[40vw] h-[40vw] rounded-full border border-[var(--color-primary)] opacity-20 mix-blend-overlay"
        animate={{
          x: ['-10vw', '110vw'],
          y: ['-10vh', '110vh'],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
      />

      {/* Scene-responsive geometric element */}
      <motion.div
        className="absolute w-[20vw] h-[20vw] bg-[var(--color-accent)] mix-blend-overlay blur-[80px]"
        animate={pos}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      />

      <div className="absolute inset-0 opacity-10 pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+")`
        }}
      />

      {/* Foreground scenes */}
      <AnimatePresence mode="sync">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>
    </div>
  );
}
