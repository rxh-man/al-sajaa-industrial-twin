/**
 * Hook: Performance Renderer Integration
 *
 * Initializes performance monitoring and applies quality settings to the renderer.
 */

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { PerformanceRenderer } from '../perf/performanceRenderer';

/**
 * Initialize performance renderer with the Three.js renderer.
 * Updates performance metrics and quality tier every frame.
 */
export function usePerformanceRenderer() {
  const { gl } = useThree();
  const rendererRef = useRef<PerformanceRenderer | null>(null);

  useEffect(() => {
    // Initialize performance renderer
    rendererRef.current = new PerformanceRenderer(gl);

    return () => {
      // Cleanup if needed
    };
  }, [gl]);

  useEffect(() => {
    // Update performance metrics before each frame
    const frameUpdate = () => {
      if (rendererRef.current) {
        // Update quality based on performance
        rendererRef.current.updatePerformance();
      }
      requestAnimationFrame(frameUpdate);
    };

    const id = requestAnimationFrame(frameUpdate);
    return () => cancelAnimationFrame(id);
  }, []);

  return {
    getRenderer: () => rendererRef.current,
    getTier: () => rendererRef.current?.getTier(),
    getMetrics: () => rendererRef.current?.getMetrics(),
  };
}
