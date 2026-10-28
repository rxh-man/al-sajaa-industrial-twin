/**
 * Performance Renderer Integration
 *
 * Connects performance monitor to Three.js renderer to dynamically
 * adjust quality tiers based on measured frame time, FPS, and memory.
 */

import { getPerformanceMonitor, type PerformanceMonitor, type QualityTier } from './performanceBaseline';
import type { WebGLRenderer } from 'three';

export interface RenderQualitySettings {
  shadowMapSize: number;
  shadowMapType: string;
  particleCount: number;
  maxInstances: number;
  textureResolution: 'half' | 'full';
  pixelRatio: number;
  targetFps: number;
}

const QUALITY_SETTINGS: Record<QualityTier, RenderQualitySettings> = {
  low: {
    shadowMapSize: 512,
    shadowMapType: 'PCFShadowMap',
    particleCount: 100,
    maxInstances: 1000,
    textureResolution: 'half',
    pixelRatio: 1,
    targetFps: 30,
  },
  medium: {
    shadowMapSize: 1024,
    shadowMapType: 'PCFShadowMap',
    particleCount: 500,
    maxInstances: 5000,
    textureResolution: 'full',
    pixelRatio: 1,
    targetFps: 60,
  },
  high: {
    shadowMapSize: 2048,
    shadowMapType: 'PCFShadowMapSoft',
    particleCount: 2000,
    maxInstances: 20000,
    textureResolution: 'full',
    pixelRatio: 1.5,
    targetFps: 60,
  },
};

/**
 * Performance-aware renderer: tracks metrics and adjusts quality dynamically.
 */
export class PerformanceRenderer {
  private renderer: WebGLRenderer;
  private monitor: PerformanceMonitor;
  private currentTier: QualityTier = 'medium';
  private lastAdjustmentTime = 0;
  private adjustmentInterval = 1000; // adjust quality at most once per second

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
    this.monitor = getPerformanceMonitor();
    this.applyQualitySettings('medium');
  }

  /**
   * Apply quality settings to renderer and system.
   */
  private applyQualitySettings(tier: QualityTier): void {
    const settings = QUALITY_SETTINGS[tier];

    // Shadow maps
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = settings.shadowMapType as any;

    // Device pixel ratio for rendering resolution
    const dpr = Math.min(settings.pixelRatio, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);

    // Store settings globally for systems to read
    globalThis.__PERF_SETTINGS__ = settings;
    globalThis.__PERF_TIER__ = tier;

    if (import.meta.env.DEV) {
      console.log(`[perf] Applied quality tier: ${tier}`, settings);
    }
  }

  /**
   * Update performance metrics and adjust quality if needed.
   * Call this from the render loop.
   */
  updatePerformance(): void {
    const now = Date.now();
    if (now - this.lastAdjustmentTime < this.adjustmentInterval) {
      return;
    }

    // Measure frame and get baseline
    this.monitor.measureFrame();
    const baseline = this.monitor.getBaseline();

    // Decide tier based on metrics
    let newTier: QualityTier = 'medium';

    if (baseline.minFps < 30 || baseline.avgMemoryMb > 800) {
      newTier = 'low';
    } else if (baseline.minFps < 45 || baseline.avgMemoryMb > 600) {
      newTier = 'medium';
    } else if (baseline.minFps > 55 && baseline.avgMemoryMb < 500) {
      newTier = 'high';
    } else {
      newTier = 'medium';
    }

    // Apply if tier changed
    if (newTier !== this.currentTier) {
      this.currentTier = newTier;
      this.applyQualitySettings(newTier);
    }

    this.lastAdjustmentTime = now;
  }

  /**
   * Force a specific quality tier.
   */
  setTier(tier: QualityTier): void {
    this.currentTier = tier;
    this.applyQualitySettings(tier);
  }

  /**
   * Get current quality tier.
   */
  getTier(): QualityTier {
    return this.currentTier;
  }

  /**
   * Get settings for current tier.
   */
  getSettings(): RenderQualitySettings {
    return QUALITY_SETTINGS[this.currentTier];
  }

  /**
   * Get performance metrics for display.
   */
  getMetrics() {
    return this.monitor.getBaseline();
  }
}

/**
 * Global convenience getters for performance settings (for use in shaders, workers, etc.)
 */
declare global {
  var __PERF_SETTINGS__: RenderQualitySettings | undefined;
  var __PERF_TIER__: QualityTier | undefined;
}

export function getPerformanceSettings(): RenderQualitySettings {
  return globalThis.__PERF_SETTINGS__ || QUALITY_SETTINGS.medium;
}

export function getPerformanceTier(): QualityTier {
  return globalThis.__PERF_TIER__ || 'medium';
}
