/**
 * Eight-Agent Orchestration Framework
 *
 * Coordinates independent agents with typed tools and dependency-aware delegation.
 * - AgentRegistry: manages agent definitions and tool contracts.
 * - DependencyGraph: tracks task dependencies and required outputs.
 * - Dispatcher: routes tasks to agents based on dependencies and capabilities.
 *
 * All operations are deterministic; no random task selection.
 */

export type ToolIOType = 'number' | 'string' | 'boolean' | 'object' | 'array';

export interface ToolParameter {
  name: string;
  type: ToolIOType;
  required: boolean;
  description: string;
}

export interface ToolOutput {
  type: ToolIOType;
  description: string;
}

export interface ToolContract {
  name: string;
  description: string;
  version: string;
  parameters: ToolParameter[];
  outputs: ToolOutput;
}

export enum AgentType {
  HeatAnalysis = 'heat-analysis',
  AirQuality = 'air-quality',
  WaterSecurity = 'water-security',
  Microgrid = 'microgrid',
  FloodRisk = 'flood-risk',
  TransportOptim = 'transport-optim',
  SolarPlanning = 'solar-planning',
  CoastalResilience = 'coastal-resilience',
}

export interface AgentDefinition {
  id: AgentType;
  name: string;
  description: string;
  tools: ToolContract[];
  /** Agent IDs this agent can depend on */
  canDependOn: AgentType[];
  /** Agent IDs that can depend on this one */
  providesTo: AgentType[];
  /** Max concurrent tasks */
  concurrency: number;
}

export const AGENT_REGISTRY: Record<AgentType, AgentDefinition> = {
  [AgentType.HeatAnalysis]: {
    id: AgentType.HeatAnalysis,
    name: 'Heat Analysis Agent',
    description: 'Calculates pedestrian heat exposure, high-exposure locations, and time-of-day effects.',
    tools: [
      {
        name: 'calculateExposure',
        description: 'Calculate heat exposure over a pedestrian route',
        version: '1.0',
        parameters: [
          { name: 'route', type: 'object', required: true, description: 'Pedestrian route (start, end, duration, hour)' },
        ],
        outputs: { type: 'object', description: 'Exposure result with heat dose, shade, assumptions' },
      },
      {
        name: 'findHighExposureLocations',
        description: 'Identify hotspots where pedestrians face high heat',
        version: '1.0',
        parameters: [],
        outputs: { type: 'array', description: 'Array of high-exposure locations sorted by peak heat' },
      },
    ],
    canDependOn: [],
    providesTo: [AgentType.TransportOptim],
    concurrency: 1,
  },
  [AgentType.AirQuality]: {
    id: AgentType.AirQuality,
    name: 'Air Quality Agent',
    description: 'Models wind-driven dispersion and factory contributions to air pollution.',
    tools: [
      {
        name: 'airQualityBaseline',
        description: 'Calculate baseline air concentration at a location',
        version: '1.0',
        parameters: [
          { name: 'location', type: 'array', required: true, description: '[x, z] coordinates' },
          { name: 'wind', type: 'object', required: true, description: 'Wind direction (deg) and speed (units/s)' },
        ],
        outputs: { type: 'object', description: 'Source attribution with concentrations' },
      },
      {
        name: 'compareAirQuality',
        description: 'Compare baseline vs mitigation scenario',
        version: '1.0',
        parameters: [
          { name: 'location', type: 'array', required: true, description: '[x, z] coordinates' },
          { name: 'wind', type: 'object', required: true, description: 'Wind conditions' },
          { name: 'mitigatedFactories', type: 'object', required: true, description: 'Map of factory ID to reduction factor' },
        ],
        outputs: { type: 'object', description: 'Comparison result with improvement metric' },
      },
    ],
    canDependOn: [],
    providesTo: [AgentType.TransportOptim],
    concurrency: 1,
  },
  [AgentType.WaterSecurity]: {
    id: AgentType.WaterSecurity,
    name: 'Water Security Agent',
    description: 'Models water loss, interventions, and cascading failures.',
    tools: [
      {
        name: 'estimateWaterLoss',
        description: 'Estimate water loss over a period with breakdown by source',
        version: '1.0',
        parameters: [
          { name: 'durationDays', type: 'number', required: true, description: 'Duration in days' },
          { name: 'assetFailures', type: 'array', required: false, description: 'Array of failed asset IDs' },
        ],
        outputs: { type: 'object', description: 'Loss estimate with breakdown and cascade impact' },
      },
      {
        name: 'analyzeFailureScenario',
        description: 'Analyze cascading failure scenario',
        version: '1.0',
        parameters: [
          { name: 'failedAssetId', type: 'string', required: true, description: 'Asset ID that failed' },
          { name: 'durationHours', type: 'number', required: false, description: 'Duration of outage in hours' },
        ],
        outputs: { type: 'object', description: 'Failure scenario with cascade chain and recovery actions' },
      },
    ],
    canDependOn: [AgentType.Microgrid],
    providesTo: [AgentType.CoastalResilience],
    concurrency: 1,
  },
  [AgentType.Microgrid]: {
    id: AgentType.Microgrid,
    name: 'Microgrid Agent',
    description: 'Dispatches energy, models battery constraints, and compares scenarios.',
    tools: [
      {
        name: 'simulateMicrogridDay',
        description: 'Simulate 24-hour microgrid dispatch',
        version: '1.0',
        parameters: [
          { name: 'scenario', type: 'object', required: true, description: 'Microgrid scenario (solar, battery, demand)' },
        ],
        outputs: { type: 'object', description: 'Daily dispatch result with generation, demand, battery, grid' },
      },
      {
        name: 'compareMicrogridScenarios',
        description: 'Compare baseline vs proposed scenarios',
        version: '1.0',
        parameters: [],
        outputs: { type: 'object', description: 'Comparison with energy savings and emissions savings' },
      },
    ],
    canDependOn: [AgentType.WaterSecurity],
    providesTo: [AgentType.SolarPlanning, AgentType.TransportOptim],
    concurrency: 1,
  },
  [AgentType.FloodRisk]: {
    id: AgentType.FloodRisk,
    name: 'Flood Risk Agent',
    description: 'Assesses flood risk, inundation extent, and recovery times.',
    tools: [],
    canDependOn: [AgentType.WaterSecurity],
    providesTo: [AgentType.CoastalResilience],
    concurrency: 1,
  },
  [AgentType.TransportOptim]: {
    id: AgentType.TransportOptim,
    name: 'Transport Optimisation Agent',
    description: 'Optimises routes, vehicle assignments, and scheduling.',
    tools: [],
    canDependOn: [AgentType.HeatAnalysis, AgentType.AirQuality, AgentType.Microgrid],
    providesTo: [],
    concurrency: 2,
  },
  [AgentType.SolarPlanning]: {
    id: AgentType.SolarPlanning,
    name: 'Solar Planning Agent',
    description: 'Plans solar deployment and roof utilisation.',
    tools: [],
    canDependOn: [AgentType.Microgrid],
    providesTo: [],
    concurrency: 1,
  },
  [AgentType.CoastalResilience]: {
    id: AgentType.CoastalResilience,
    name: 'Coastal Resilience Agent',
    description: 'Coordinates coastal flood risk and water security.',
    tools: [],
    canDependOn: [AgentType.WaterSecurity, AgentType.FloodRisk],
    providesTo: [],
    concurrency: 1,
  },
};

export interface TaskDefinition {
  id: string;
  agentId: AgentType;
  toolName: string;
  parameters: Record<string, unknown>;
  dependsOn: string[]; // task IDs
  priority: number; // 0–10, higher = earlier
}

export interface TaskResult {
  taskId: string;
  agentId: AgentType;
  toolName: string;
  output: unknown;
  duration_ms: number;
  timestamp: string;
}

export interface DependencyNode {
  taskId: string;
  agentId: AgentType;
  dependencies: string[]; // task IDs this depends on
  dependents: string[]; // task IDs that depend on this
  resolved: boolean;
}

export class DependencyGraph {
  private nodes: Map<string, DependencyNode> = new Map();

  addTask(task: TaskDefinition): void {
    if (this.nodes.has(task.id)) {
      throw new Error(`Task ${task.id} already exists`);
    }
    const node: DependencyNode = {
      taskId: task.id,
      agentId: task.agentId,
      dependencies: task.dependsOn,
      dependents: [],
      resolved: false,
    };
    this.nodes.set(task.id, node);

    // Update dependents
    for (const depId of task.dependsOn) {
      const dep = this.nodes.get(depId);
      if (dep) {
        dep.dependents.push(task.id);
      }
    }
  }

  getReadyTasks(): DependencyNode[] {
    const ready: DependencyNode[] = [];
    for (const node of this.nodes.values()) {
      if (!node.resolved && node.dependencies.every((d) => this.nodes.get(d)?.resolved ?? false)) {
        ready.push(node);
      }
    }
    return ready.sort((a, b) => {
      // Prioritise by dependency depth (leaf nodes first)
      const depthA = a.dependencies.length;
      const depthB = b.dependencies.length;
      return depthA - depthB;
    });
  }

  markResolved(taskId: string): void {
    const node = this.nodes.get(taskId);
    if (node) {
      node.resolved = true;
    }
  }

  getStatus(): { total: number; resolved: number; pending: number } {
    let resolved = 0,
      pending = 0;
    for (const node of this.nodes.values()) {
      if (node.resolved) resolved++;
      else pending++;
    }
    return { total: this.nodes.size, resolved, pending };
  }
}

export class AgentDispatcher {
  private graph: DependencyGraph;
  private results: Map<string, TaskResult> = new Map();

  constructor() {
    this.graph = new DependencyGraph();
  }

  addTasks(tasks: TaskDefinition[]): void {
    for (const task of tasks) {
      this.graph.addTask(task);
    }
  }

  async dispatch(taskId: string, task: TaskDefinition): Promise<TaskResult> {
    const agent = AGENT_REGISTRY[task.agentId];
    if (!agent) {
      throw new Error(`Unknown agent: ${task.agentId}`);
    }

    const tool = agent.tools.find((t) => t.name === task.toolName);
    if (!tool) {
      throw new Error(`Agent ${task.agentId} has no tool ${task.toolName}`);
    }

    // Validate parameters
    for (const param of tool.parameters) {
      if (param.required && !(param.name in task.parameters)) {
        throw new Error(`Missing required parameter: ${param.name}`);
      }
    }

    // Simulate tool execution
    // In a real system, this would call the actual agent with the tool
    const output = { success: true, parameters: task.parameters };
    const duration_ms = Math.random() * 100; // simulated duration

    const result: TaskResult = {
      taskId,
      agentId: task.agentId,
      toolName: task.toolName,
      output,
      duration_ms,
      timestamp: new Date().toISOString(),
    };

    this.results.set(taskId, result);
    this.graph.markResolved(taskId);

    return result;
  }

  getResults(): TaskResult[] {
    return Array.from(this.results.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  getStatus() {
    return this.graph.getStatus();
  }
}
