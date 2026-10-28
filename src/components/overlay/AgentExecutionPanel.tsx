/**
 * Agent Execution Panel
 *
 * Displays real-time execution traces of agent tasks with status tracking,
 * parameter validation, result collection, and error handling.
 */

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle, Clock, Zap } from 'lucide-react';
import { AgentExecutor, type ExecutionTrace, type ExecutionState } from '../../agents/agentExecutor';
import { AGENT_REGISTRY, AgentType, type TaskDefinition } from '../../agents/agentOrchestrator';
import '../../styles/agentPanel.css';

export function AgentExecutionPanel() {
  const [executor] = useState(() => new AgentExecutor());
  const [executionState, setExecutionState] = useState<ExecutionState | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const toggleTaskExpansion = useCallback((taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const executeExampleWorkflow = useCallback(async () => {
    if (isRunning) return;

    setIsRunning(true);
    setExecutionState(null);

    // Example workflow: heat → air quality → water → microgrid
    const tasks: TaskDefinition[] = [
      {
        id: 'heat_1',
        agentId: AgentType.HeatAnalysis,
        toolName: 'calculateExposure',
        parameters: {
          route: {
            startLocation: [0, 0],
            endLocation: [100, 100],
            duration: 30,
            hour: 12,
          },
        },
        dependsOn: [],
        priority: 10,
      },
      {
        id: 'heat_2',
        agentId: AgentType.HeatAnalysis,
        toolName: 'findHighExposureLocations',
        parameters: {},
        dependsOn: [],
        priority: 9,
      },
      {
        id: 'air_1',
        agentId: AgentType.AirQuality,
        toolName: 'airQualityBaseline',
        parameters: {
          location: [50, 50],
          wind: { direction: 45, speed: 5 },
        },
        dependsOn: ['heat_1'],
        priority: 8,
      },
      {
        id: 'water_1',
        agentId: AgentType.WaterSecurity,
        toolName: 'estimateWaterLoss',
        parameters: {
          durationDays: 1,
        },
        dependsOn: [],
        priority: 7,
      },
      {
        id: 'microgrid_1',
        agentId: AgentType.Microgrid,
        toolName: 'simulateMicrogridDay',
        parameters: {
          scenario: {
            solarCapacityKw: 150,
            batteryCapacityKwh: 200,
            waterPumpingReductionKw: 2,
            baselineDemandKw: 15,
            waterDemandMl: 40,
          },
        },
        dependsOn: ['water_1'],
        priority: 6,
      },
    ];

    try {
      const state = await executor.execute(tasks);
      setExecutionState(state);
    } catch (err) {
      console.error('Execution failed:', err);
      setExecutionState(executor.getState());
    } finally {
      setIsRunning(false);
    }
  }, [executor, isRunning]);

  const renderStatusIcon = (status: ExecutionTrace['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-400" />;
      case 'running':
        return <Zap className="w-4 h-4 text-blue-400 animate-pulse" />;
      case 'succeeded':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'blocked':
        return <Clock className="w-4 h-4 text-orange-400" />;
      default:
        return null;
    }
  };

  const renderStatusLabel = (status: ExecutionTrace['status']) => {
    return (
      <span
        className={`text-xs font-semibold px-2 py-1 rounded ${
          status === 'succeeded'
            ? 'bg-green-100 text-green-700'
            : status === 'failed'
              ? 'bg-red-100 text-red-700'
              : status === 'running'
                ? 'bg-blue-100 text-blue-700'
                : status === 'blocked'
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-yellow-100 text-yellow-700'
        }`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getAgentName = (agentId: AgentType) => {
    return AGENT_REGISTRY[agentId]?.name || agentId;
  };

  return (
    <div className="agent-execution-panel">
      <div className="agent-panel-header">
        <h2 className="agent-panel-title">Agent Execution Engine</h2>
        <button
          onClick={executeExampleWorkflow}
          disabled={isRunning}
          className="agent-run-button"
        >
          {isRunning ? 'Running...' : 'Run Workflow'}
        </button>
      </div>

      {!executionState && !isRunning && (
        <div className="agent-panel-info">
          <p>Click "Run Workflow" to execute a multi-agent task sequence.</p>
          <p className="text-xs text-gray-500 mt-2">
            Example: Heat Analysis → Air Quality → Water Security → Microgrid Dispatch
          </p>
        </div>
      )}

      {executionState && (
        <div className="agent-panel-status">
          <div className="agent-status-row">
            <span>Status:</span>
            <span className="agent-status-value">
              {executionState.status.charAt(0).toUpperCase() + executionState.status.slice(1)}
            </span>
          </div>
          <div className="agent-status-row">
            <span>Completed:</span>
            <span className="agent-status-value">
              {executionState.completedCount} / {executionState.traces.length}
            </span>
          </div>
          {executionState.failedCount > 0 && (
            <div className="agent-status-row agent-status-error">
              <span>Failed:</span>
              <span className="agent-status-value">{executionState.failedCount}</span>
            </div>
          )}
        </div>
      )}

      {executionState && executionState.traces.length > 0 && (
        <div className="agent-traces-container">
          <h3 className="agent-traces-title">Execution Traces</h3>
          <div className="agent-traces-list">
            {executionState.traces.map((trace) => (
              <div key={trace.taskId} className="agent-trace-item">
                <div
                  className="agent-trace-header"
                  onClick={() => toggleTaskExpansion(trace.taskId)}
                >
                  <div className="agent-trace-toggle">
                    {expandedTasks.has(trace.taskId) ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>
                  <div className="agent-trace-icon">
                    {renderStatusIcon(trace.status)}
                  </div>
                  <div className="agent-trace-info">
                    <div className="agent-trace-task-id">{trace.taskId}</div>
                    <div className="agent-trace-agent-tool">
                      <span className="agent-trace-agent">{getAgentName(trace.agentId)}</span>
                      <span className="agent-trace-dot">·</span>
                      <span className="agent-trace-tool">{trace.toolName}</span>
                    </div>
                  </div>
                  <div className="agent-trace-status">
                    {renderStatusLabel(trace.status)}
                  </div>
                  {trace.durationMs && (
                    <div className="agent-trace-duration">{trace.durationMs.toFixed(0)}ms</div>
                  )}
                </div>

                {expandedTasks.has(trace.taskId) && (
                  <div className="agent-trace-details">
                    {trace.blockedBy && trace.blockedBy.length > 0 && (
                      <div className="agent-trace-section">
                        <span className="agent-trace-label">Blocked By:</span>
                        <div className="agent-trace-value">
                          {trace.blockedBy.join(', ')}
                        </div>
                      </div>
                    )}

                    {Object.keys(trace.parameters).length > 0 && (
                      <div className="agent-trace-section">
                        <span className="agent-trace-label">Parameters:</span>
                        <pre className="agent-trace-code">
                          {JSON.stringify(trace.parameters, null, 2)}
                        </pre>
                      </div>
                    )}

                    {trace.output ? (
                      <div className="agent-trace-section">
                        <span className="agent-trace-label">Output:</span>
                        <pre className="agent-trace-code">
                          {JSON.stringify(trace.output as any, null, 2)}
                        </pre>
                      </div>
                    ) : null}

                    {trace.error && (
                      <div className="agent-trace-section agent-trace-error-section">
                        <span className="agent-trace-label">Error:</span>
                        <div className="agent-trace-error-message">{trace.error}</div>
                      </div>
                    )}

                    {trace.startedAt && (
                      <div className="agent-trace-section">
                        <span className="agent-trace-label">Started:</span>
                        <span className="agent-trace-value">
                          {new Date(trace.startedAt).toLocaleTimeString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
