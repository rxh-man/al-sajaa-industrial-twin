/**
 * Performance Baselines and Rendering-Quality Tiers
 *
 * - Measure frame times, memory, rendering speed.
 * - Define quality tiers (low, medium, high) based on device capability.
 * - Deterministic tier selection based on FPS and memory.
 */

export type QualityTier = 'low' | 'medium' | 'high';

export interface QualitySettings {
  tier: QualityTier;
  maxBatchSize: number;
  shadowMapResolution: number;
  textureQuality: 'half' | 'full';
  particleCount: number;
  targetFps: number;
  instancedMeshLimit: number;
}

export const QUALITY_TIERS: Record<QualityTier, QualitySettings> = {
  low: {
    tier: 'low',
    maxBatchSize: 100,
    shadowMapResolution: 512,
    textureQuality: 'half',
    particleCount: 100,
    targetFps: 30,
    instancedMeshLimit: 1000,
  },
  medium: {
    tier: 'medium',
    maxBatchSize: 500,
    shadowMapResolution: 1024,
    textureQuality: 'full',
    particleCount: 500,
    targetFps: 60,
    instancedMeshLimit: 5000,
  },
  high: {
    tier: 'high',
    maxBatchSize: 2000,
    shadowMapResolution: 2048,
    textureQuality: 'full',
    particleCount: 2000,
    targetFps: 60,
    instancedMeshLimit: 20000,
  },
};

export interface PerformanceMetrics {
  frameTimeMs: number;
  fps: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
  drawCalls: number;
  triangles: number;
  timestamp: number;
}

export interface PerformanceBaseline {
  tier: QualityTier;
  avgFrameTimeMs: number;
  minFps: number;
  avgMemoryMb: number;
  maxDrawCalls: number;
  recommendedUpdateFrequency: number; // ms between quality reassessment
}

/**
 * Measure and track performance metrics over time
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private lastMeasureTime = performance.now();
  private frameCount = 0;
  private currentTier: QualityTier = 'medium';

  measureFrame(): PerformanceMetrics {
    const now = performance.now();
    const frameTimeMs = now - this.lastMeasureTime;
    const fps = frameTimeMs > 0 ? 1000 / frameTimeMs : 0;

    const metric: PerformanceMetrics = {
      frameTimeMs,
      fps,
      memoryUsedMb: this.getMemoryUsage(),
      memoryLimitMb: this.getMemoryLimit(),
      drawCalls: 0, // would be filled by renderer
      triangles: 0, // would be filled by renderer
      timestamp: now,
    };

    this.metrics.push(metric);
    this.lastMeasureTime = now;
    this.frameCount++;

    // Keep only last 300 frames (~5 seconds at 60fps)
    if (this.metrics.length > 300) {
      this.metrics.shift();
    }

    return metric;
  }

  getBaseline(): PerformanceBaseline {
    if (this.metrics.length === 0) {
      return {
        tier: this.currentTier,
        avgFrameTimeMs: 0,
        minFps: 0,
        avgMemoryMb: 0,
        maxDrawCalls: 0,
        recommendedUpdateFrequency: 5000,
      };
    }

    const frameTimeMs = this.metrics.reduce((a, m) => a + m.frameTimeMs, 0) / this.metrics.length;
    const fps = this.metrics.map((m) => m.fps);
    const minFps = Math.min(...fps);
    const memoryMb = this.metrics.reduce((a, m) => a + m.memoryUsedMb, 0) / this.metrics.length;
    const maxDrawCalls = Math.max(...this.metrics.map((m) => m.drawCalls));

    return {
      tier: this.currentTier,
      avgFrameTimeMs: frameTimeMs,
      minFps,
      avgMemoryMb: memoryMb,
      maxDrawCalls,
      recommendedUpdateFrequency: 5000,
    };
  }

  /**
   * Auto-select quality tier based on measured performance
   */
  autoSelectTier(): QualityTier {
    const baseline = this.getBaseline();

    // Heuristic: if avg fps > 55 and memory < 500MB, try medium+
    // If avg fps > 45, stay on medium
    // Otherwise, drop to low
    if (baseline.minFps < 30 || baseline.avgMemoryMb > 800) {
      this.currentTier = 'low';
    } else if (baseline.minFps < 45 || baseline.avgMemoryMb > 600) {
      this.currentTier = 'medium';
    } else if (baseline.minFps > 55 && baseline.avgMemoryMb < 500) {
      this.currentTier = 'high';
    } else {
      this.currentTier = 'medium';
    }

    return this.currentTier;
  }

  getCurrentTier(): QualityTier {
    return this.currentTier;
  }

  setTier(tier: QualityTier): void {
    this.currentTier = tier;
  }

  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  reset(): void {
    this.metrics = [];
    this.frameCount = 0;
    this.lastMeasureTime = performance.now();
  }

  private getMemoryUsage(): number {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      // @ts-ignore: performance.memory is non-standard
      return (performance.memory?.usedJSHeapSize ?? 0) / 1048576; // convert to MB
    }
    return 0;
  }

  private getMemoryLimit(): number {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      // @ts-ignore: performance.memory is non-standard
      return (performance.memory?.jsHeapSizeLimit ?? 0) / 1048576; // convert to MB
    }
    return 0;
  }
}

/**
 * Global singleton performance monitor
 */
let globalMonitor: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!globalMonitor) {
    globalMonitor = new PerformanceMonitor();
  }
  return globalMonitor;
}

export function getQualitySettings(): QualitySettings {
  const monitor = getPerformanceMonitor();
  const tier = monitor.getCurrentTier();
  return QUALITY_TIERS[tier];
}
