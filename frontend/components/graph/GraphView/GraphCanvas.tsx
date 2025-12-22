'use client';

import { useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { BookmarkNode } from './BookmarkNode';
import { ConceptNode } from './ConceptNode';
import { EntityNode } from './EntityNode';
import { useGraphData } from '@/hooks/graph/useGraphData';
import { GraphControls } from './GraphControls';

// Define custom node types
const nodeTypes = {
  bookmark: BookmarkNode,
  concept: ConceptNode,
  entity: EntityNode,
};

export function GraphCanvas() {
  const { data, isLoading, error } = useGraphData();

  const [nodes, setNodes, onNodesChange] = useNodesState(data?.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(data?.edges || []);

  // Update nodes and edges when data is loaded
  useEffect(() => {
    if (data) {
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    }
  }, [data, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Apply force-directed layout
  const proOptions = { hideAttribution: true };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-600">Loading graph...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-600">Error loading graph: {error.message}</div>
      </div>
    );
  }

  if (!nodes.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-gray-600 mb-2">No graph data available yet.</p>
          <p className="text-sm text-gray-500">
            Create and enrich some bookmarks to see them here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        proOptions={proOptions}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#D1D1D6', strokeWidth: 1 },
        }}
      >
        <Background color="#E5E5E5" gap={16} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(node) => {
            switch (node.type) {
              case 'bookmark':
                return '#FFFFFF';
              case 'concept':
                return '#F5F5F5';
              case 'entity':
                return '#E5E5E5';
              default:
                return '#FFFFFF';
            }
          }}
          maskColor="rgba(0, 0, 0, 0.05)"
          className="border border-gray-200"
        />
        <Panel position="top-right">
          <GraphControls />
        </Panel>
      </ReactFlow>
    </div>
  );
}
