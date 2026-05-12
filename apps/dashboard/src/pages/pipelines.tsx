'use client';

import { useState, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Card, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { api } from '../lib/api';
import {
  Play,
  Save,
  Plus,
  Trash2,
  GitBranch,
  Clock,
  Merge,
  SplitSquareVertical,
  Input as InputIcon,
  Output as OutputIcon,
  CheckCircle,
  XCircle,
  Loader2,
  FileJson,
} from 'lucide-react';

interface PipelineNodeData {
  label: string;
  type: 'agent' | 'condition' | 'input' | 'output' | 'delay' | 'merge' | 'split';
  config: Record<string, unknown>;
}

type PipelineNode = Node<PipelineNodeData>;
type PipelineEdge = Edge;

// Custom Node Components
function AgentNode({ data }: { data: PipelineNodeData }) {
  return (
    <div className="px-4 py-3 rounded-lg border-2 border-blue-500 bg-card shadow-lg min-w-[150px]">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
          <span className="text-blue-500 font-bold text-sm">A</span>
        </div>
        <div>
          <div className="font-medium text-sm">{data.label}</div>
          <div className="text-xs text-muted-foreground">Agent</div>
        </div>
      </div>
    </div>
  );
}

function ConditionNode({ data }: { data: PipelineNodeData }) {
  return (
    <div className="px-4 py-3 rounded-lg border-2 border-amber-500 bg-card shadow-lg min-w-[140px]">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
          <GitBranch className="w-4 h-4 text-amber-500" />
        </div>
        <div>
          <div className="font-medium text-sm">{data.label}</div>
          <div className="text-xs text-muted-foreground">Condition</div>
        </div>
      </div>
    </div>
  );
}

function PipelineInputNode({ data }: { data: PipelineNodeData }) {
  return (
    <div className="px-4 py-3 rounded-lg border-2 border-green-500 bg-card shadow-lg min-w-[120px]">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
          <InputIcon className="w-4 h-4 text-green-500" />
        </div>
        <div>
          <div className="font-medium text-sm">{data.label}</div>
          <div className="text-xs text-muted-foreground">Input</div>
        </div>
      </div>
    </div>
  );
}

function PipelineOutputNode({ data }: { data: PipelineNodeData }) {
  return (
    <div className="px-4 py-3 rounded-lg border-2 border-purple-500 bg-card shadow-lg min-w-[120px]">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
          <OutputIcon className="w-4 h-4 text-purple-500" />
        </div>
        <div>
          <div className="font-medium text-sm">{data.label}</div>
          <div className="text-xs text-muted-foreground">Output</div>
        </div>
      </div>
    </div>
  );
}

function DelayNode({ data }: { data: PipelineNodeData }) {
  return (
    <div className="px-4 py-3 rounded-lg border-2 border-orange-500 bg-card shadow-lg min-w-[120px]">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
          <Clock className="w-4 h-4 text-orange-500" />
        </div>
        <div>
          <div className="font-medium text-sm">{data.label}</div>
          <div className="text-xs text-muted-foreground">Delay</div>
        </div>
      </div>
    </div>
  );
}

function MergeNodeComponent({ data }: { data: PipelineNodeData }) {
  return (
    <div className="px-4 py-3 rounded-lg border-2 border-pink-500 bg-card shadow-lg min-w-[120px]">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center">
          <Merge className="w-4 h-4 text-pink-500" />
        </div>
        <div>
          <div className="font-medium text-sm">{data.label}</div>
          <div className="text-xs text-muted-foreground">Merge</div>
        </div>
      </div>
    </div>
  );
}

function SplitNodeComponent({ data }: { data: PipelineNodeData }) {
  return (
    <div className="px-4 py-3 rounded-lg border-2 border-cyan-500 bg-card shadow-lg min-w-[120px]">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
          <SplitSquareVertical className="w-4 h-4 text-cyan-500" />
        </div>
        <div>
          <div className="font-medium text-sm">{data.label}</div>
          <div className="text-xs text-muted-foreground">Split</div>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = {
  agent: AgentNode,
  condition: ConditionNode,
  input: PipelineInputNode,
  output: PipelineOutputNode,
  delay: DelayNode,
  merge: MergeNodeComponent,
  split: SplitNodeComponent,
};

const defaultEdgeOptions = {
  animated: true,
  markerEnd: {
    type: MarkerType.ArrowClosed,
  },
};

const nodeTypeOptions = [
  { value: 'input', label: 'Input', color: 'green' },
  { value: 'agent', label: 'Agent', color: 'blue' },
  { value: 'condition', label: 'Condition', color: 'amber' },
  { value: 'delay', label: 'Delay', color: 'orange' },
  { value: 'merge', label: 'Merge', color: 'pink' },
  { value: 'split', label: 'Split', color: 'cyan' },
  { value: 'output', label: 'Output', color: 'purple' },
];

export default function PipelinesPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<PipelineNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<PipelineEdge>([]);
  const [pipelineName, setPipelineName] = useState('Untitled Pipeline');
  const [selectedNode, setSelectedNode] = useState<PipelineNode | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<string | null>(null);
  const [pipelines, setPipelines] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [showTemplatesDialog, setShowTemplatesDialog] = useState(false);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge({ ...params, animated: true, markerEnd: { type: MarkerType.ArrowClosed } }, eds)
      ),
    [setEdges]
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: PipelineNode) => {
    setSelectedNode(node);
  }, []);

  const addNode = (type: string) => {
    const id = `${type}-${Date.now()}`;
    const newNode: PipelineNode = {
      id,
      type,
      position: { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
      data: {
        label: `${type.charAt(0).toUpperCase() + type.slice(1)} Node`,
        type: type as PipelineNodeData['type'],
        config: {},
      },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const updateNode = (nodeId: string, updates: Partial<PipelineNodeData>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...updates } } : node
      )
    );
    if (selectedNode?.id === nodeId) {
      setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, ...updates } });
    }
  };

  const deleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }
  };

  const savePipeline = async () => {
    const pipeline = {
      name: pipelineName,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        config: n.data.config,
        inputs: edges.filter((e) => e.target === n.id).map((e) => e.source),
        outputs: edges.filter((e) => e.source === n.id).map((e) => e.target),
      })),
      edges: edges.map((e) => ({
        id: e.id,
        sourceId: e.source,
        targetId: e.target,
        type: 'data' as const,
      })),
    };

    try {
      await api.post('/pipelines', pipeline);
      alert('Pipeline saved successfully!');
    } catch (error) {
      console.error('Failed to save pipeline:', error);
      alert('Failed to save pipeline');
    }
  };

  const executePipeline = async () => {
    if (nodes.length === 0) return;

    setIsExecuting(true);
    setExecutionStatus('running');

    try {
      const response = await api.post('/pipelines');
      setExecutionStatus('completed');
      setTimeout(() => setExecutionStatus(null), 3000);
    } catch {
      setExecutionStatus('failed');
      setTimeout(() => setExecutionStatus(null), 3000);
    } finally {
      setIsExecuting(false);
    }
  };

  const applyTemplate = (template: { nodes: PipelineNode[]; edges: PipelineEdge[] }) => {
    setNodes(template.nodes as PipelineNode[]);
    setEdges(template.edges as PipelineEdge[]);
    setShowTemplatesDialog(false);
  };

  const clearCanvas = () => {
    setNodes([]);
    setEdges([]);
    setPipelineName('Untitled Pipeline');
    setSelectedNode(null);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Input
            value={pipelineName}
            onChange={(e) => setPipelineName(e.target.value)}
            className="font-semibold text-lg w-[300px]"
          />
          {executionStatus && (
            <Badge
              variant={executionStatus === 'completed' ? 'default' : executionStatus === 'failed' ? 'destructive' : 'secondary'}
            >
              {executionStatus === 'running' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              {executionStatus === 'completed' && <CheckCircle className="w-3 h-3 mr-1" />}
              {executionStatus === 'failed' && <XCircle className="w-3 h-3 mr-1" />}
              {executionStatus.charAt(0).toUpperCase() + executionStatus.slice(1)}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTemplatesDialog(true)}>
            <FileJson className="w-4 h-4 mr-2" />
            Templates
          </Button>
          <Button variant="outline" size="sm" onClick={clearCanvas}>
            <Trash2 className="w-4 h-4 mr-2" />
            Clear
          </Button>
          <Button variant="outline" size="sm" onClick={savePipeline}>
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
          <Button size="sm" onClick={executePipeline} disabled={isExecuting || nodes.length === 0}>
            {isExecuting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Execute
          </Button>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Node Palette */}
        <div className="w-64 border-r bg-card p-4 overflow-y-auto">
          <h3 className="font-semibold mb-4">Add Nodes</h3>
          <div className="space-y-2">
            {nodeTypeOptions.map((option) => (
              <Button
                key={option.value}
                variant="outline"
                className="w-full justify-start"
                onClick={() => addNode(option.value)}
              >
                <Plus className="w-4 h-4 mr-2" />
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
          >
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                const colors: Record<string, string> = {
                  input: '#22c55e',
                  output: '#a855f7',
                  agent: '#3b82f6',
                  condition: '#f59e0b',
                  delay: '#f97316',
                  merge: '#ec4899',
                  split: '#06b6d4',
                };
                return colors[node.type || ''] || '#6b7280';
              }}
            />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          </ReactFlow>
        </div>

        {/* Properties Panel */}
        {selectedNode && (
          <div className="w-80 border-l bg-card p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Node Properties</h3>
              <Button variant="ghost" size="sm" onClick={() => deleteNode(selectedNode.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Label</Label>
                <Input
                  value={selectedNode.data.label}
                  onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                />
              </div>

              <div>
                <Label>Type</Label>
                <p className="text-sm text-muted-foreground">{selectedNode.data.type}</p>
              </div>

              {selectedNode.data.type === 'agent' && (
                <div>
                  <Label>Agent ID</Label>
                  <Input
                    placeholder="Select or enter agent ID"
                    value={(selectedNode.data.config.agentId as string) || ''}
                    onChange={(e) =>
                      updateNode(selectedNode.id, {
                        config: { ...selectedNode.data.config, agentId: e.target.value },
                      })
                    }
                  />
                </div>
              )}

              {selectedNode.data.type === 'condition' && (
                <>
                  <div>
                    <Label>Field</Label>
                    <Input
                      placeholder="e.g., data.status"
                      value={(selectedNode.data.config.field as string) || ''}
                      onChange={(e) =>
                        updateNode(selectedNode.id, {
                          config: { ...selectedNode.data.config, field: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Operator</Label>
                    <Select
                      value={(selectedNode.data.config.operator as string) || 'eq'}
                      onValueChange={(value) =>
                        updateNode(selectedNode.id, {
                          config: { ...selectedNode.data.config, operator: value },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eq">Equals</SelectItem>
                        <SelectItem value="neq">Not Equals</SelectItem>
                        <SelectItem value="gt">Greater Than</SelectItem>
                        <SelectItem value="lt">Less Than</SelectItem>
                        <SelectItem value="gte">Greater or Equal</SelectItem>
                        <SelectItem value="lte">Less or Equal</SelectItem>
                        <SelectItem value="contains">Contains</SelectItem>
                        <SelectItem value="not_contains">Not Contains</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Value</Label>
                    <Input
                      placeholder="Comparison value"
                      value={(selectedNode.data.config.value as string) || ''}
                      onChange={(e) =>
                        updateNode(selectedNode.id, {
                          config: { ...selectedNode.data.config, value: e.target.value },
                        })
                      }
                    />
                  </div>
                </>
              )}

              {selectedNode.data.type === 'delay' && (
                <div>
                  <Label>Duration (ms)</Label>
                  <Input
                    type="number"
                    placeholder="1000"
                    value={(selectedNode.data.config.durationMs as number) || ''}
                    onChange={(e) =>
                      updateNode(selectedNode.id, {
                        config: { ...selectedNode.data.config, durationMs: parseInt(e.target.value) },
                      })
                    }
                  />
                </div>
              )}

              {selectedNode.data.type === 'merge' && (
                <div>
                  <Label>Strategy</Label>
                  <Select
                    value={(selectedNode.data.config.strategy as string) || 'all'}
                    onValueChange={(value) =>
                      updateNode(selectedNode.id, {
                        config: { ...selectedNode.data.config, strategy: value },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All - Wait for all inputs</SelectItem>
                      <SelectItem value="first">First - Use first result</SelectItem>
                      <SelectItem value="fail_fast">Fail Fast - Stop on error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedNode.data.type === 'split' && (
                <div>
                  <Label>Number of Branches</Label>
                  <Input
                    type="number"
                    placeholder="2"
                    value={(selectedNode.data.config.branches as number) || ''}
                    onChange={(e) =>
                      updateNode(selectedNode.id, {
                        config: { ...selectedNode.data.config, branches: parseInt(e.target.value) },
                      })
                    }
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Templates Dialog */}
      <Dialog open={showTemplatesDialog} onOpenChange={setShowTemplatesDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pipeline Templates</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() =>
                applyTemplate({
                  nodes: [
                    { id: 'input-1', type: 'input', position: { x: 100, y: 200 }, data: { label: 'Input', type: 'input', config: {} } },
                    { id: 'agent-1', type: 'agent', position: { x: 300, y: 200 }, data: { label: 'Agent', type: 'agent', config: {} } },
                    { id: 'output-1', type: 'output', position: { x: 500, y: 200 }, data: { label: 'Output', type: 'output', config: {} } },
                  ],
                  edges: [
                    { id: 'e1', source: 'input-1', target: 'agent-1' },
                    { id: 'e2', source: 'agent-1', target: 'output-1' },
                  ],
                })
              }
            >
              <CardHeader>
                <CardTitle className="text-base">Sequential Agents</CardTitle>
                <CardDescription>Run agents one after another</CardDescription>
              </CardHeader>
            </Card>
            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() =>
                applyTemplate({
                  nodes: [
                    { id: 'input-1', type: 'input', position: { x: 100, y: 200 }, data: { label: 'Input', type: 'input', config: {} } },
                    { id: 'split-1', type: 'split', position: { x: 250, y: 200 }, data: { label: 'Split', type: 'split', config: { branches: 2 } } },
                    { id: 'agent-1', type: 'agent', position: { x: 400, y: 100 }, data: { label: 'Agent 1', type: 'agent', config: {} } },
                    { id: 'agent-2', type: 'agent', position: { x: 400, y: 300 }, data: { label: 'Agent 2', type: 'agent', config: {} } },
                    { id: 'merge-1', type: 'merge', position: { x: 550, y: 200 }, data: { label: 'Merge', type: 'merge', config: { strategy: 'all' } } },
                    { id: 'output-1', type: 'output', position: { x: 700, y: 200 }, data: { label: 'Output', type: 'output', config: {} } },
                  ],
                  edges: [
                    { id: 'e1', source: 'input-1', target: 'split-1' },
                    { id: 'e2', source: 'split-1', target: 'agent-1' },
                    { id: 'e3', source: 'split-1', target: 'agent-2' },
                    { id: 'e4', source: 'agent-1', target: 'merge-1' },
                    { id: 'e5', source: 'agent-2', target: 'merge-1' },
                    { id: 'e6', source: 'merge-1', target: 'output-1' },
                  ],
                })
              }
            >
              <CardHeader>
                <CardTitle className="text-base">Parallel Processing</CardTitle>
                <CardDescription>Split input to multiple agents</CardDescription>
              </CardHeader>
            </Card>
            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() =>
                applyTemplate({
                  nodes: [
                    { id: 'input-1', type: 'input', position: { x: 100, y: 200 }, data: { label: 'Input', type: 'input', config: {} } },
                    { id: 'condition-1', type: 'condition', position: { x: 300, y: 200 }, data: { label: 'Condition', type: 'condition', config: {} } },
                    { id: 'agent-1', type: 'agent', position: { x: 500, y: 100 }, data: { label: 'True Branch', type: 'agent', config: {} } },
                    { id: 'agent-2', type: 'agent', position: { x: 500, y: 300 }, data: { label: 'False Branch', type: 'agent', config: {} } },
                    { id: 'output-1', type: 'output', position: { x: 700, y: 200 }, data: { label: 'Output', type: 'output', config: {} } },
                  ],
                  edges: [
                    { id: 'e1', source: 'input-1', target: 'condition-1' },
                    { id: 'e2', source: 'condition-1', target: 'agent-1' },
                    { id: 'e3', source: 'condition-1', target: 'agent-2' },
                    { id: 'e4', source: 'agent-1', target: 'output-1' },
                    { id: 'e5', source: 'agent-2', target: 'output-1' },
                  ],
                })
              }
            >
              <CardHeader>
                <CardTitle className="text-base">Conditional Branching</CardTitle>
                <CardDescription>Route based on conditions</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}