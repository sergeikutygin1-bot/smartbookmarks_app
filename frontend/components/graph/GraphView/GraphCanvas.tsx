'use client';

import { useCallback, useEffect, useState } from 'react';
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
  NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { BookmarkNode } from './BookmarkNode';
import { ConceptNode } from './ConceptNode';
import { EntityNode } from './EntityNode';
import { useGraphData, saveNodePosition } from '@/hooks/graph/useGraphData';
import { useGraphStore } from '@/store/graphStore';
import { GraphControls } from './GraphControls';

// Define custom node types
const nodeTypes = {
  bookmark: BookmarkNode,
  concept: ConceptNode,
  entity: EntityNode,
};

export function GraphCanvas() {
  const { data, isLoading, error } = useGraphData();
  const {
    selectedNodeId,
    setSelectedNode,
    setHighlightedNodes,
    setOverlapNodes,
    clearHighlights,
    highlightedNodeIds,
    overlapNodeIds,
    addHistoryEntry,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useGraphStore();


  const [nodes, setNodes, onNodesChange] = useNodesState(data?.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(data?.edges || []);
  const [nodePositionBeforeDrag, setNodePositionBeforeDrag] = useState<{
    id: string;
    position: { x: number; y: number };
  } | null>(null);

  // Update nodes and edges when data is loaded
  useEffect(() => {
    if (data) {
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    }
  }, [data, setNodes, setEdges]);

  // Update node data when highlights change
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isHighlighted: highlightedNodeIds.includes(node.id),
          isOverlap: overlapNodeIds.includes(node.id),
        },
      }))
    );
  }, [highlightedNodeIds, overlapNodeIds, setNodes]);

  // Update edge opacity based on selection
  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => {
        if (!selectedNodeId) {
          // No selection: default opacity (10%)
          return {
            ...edge,
            style: {
              ...edge.style,
              strokeOpacity: edge.data?.defaultOpacity || 0.1,
            },
          };
        }

        // Check if edge is connected to selected node
        const isConnected = edge.source === selectedNodeId || edge.target === selectedNodeId;

        return {
          ...edge,
          style: {
            ...edge.style,
            strokeOpacity: isConnected ? 1.0 : 0.1, // 100% for connected, 10% for others
          },
        };
      })
    );
  }, [selectedNodeId, setEdges]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCtrlOrCmd = isMac ? event.metaKey : event.ctrlKey;

      // Undo: Ctrl+Z or Cmd+Z
      if (isCtrlOrCmd && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (canUndo()) {
          const entry = undo();
          if (entry && entry.type === 'position') {
            // Restore old position
            setNodes((nds) =>
              nds.map((node) =>
                node.id === entry.nodeId
                  ? { ...node, position: entry.oldPosition }
                  : node
              )
            );
            // Update localStorage
            saveNodePosition(entry.nodeId, entry.oldPosition);
          }
        }
      }

      // Redo: Ctrl+Shift+Z or Cmd+Shift+Z
      if (isCtrlOrCmd && event.key === 'z' && event.shiftKey) {
        event.preventDefault();
        if (canRedo()) {
          const entry = redo();
          if (entry && entry.type === 'position') {
            // Restore new position
            setNodes((nds) =>
              nds.map((node) =>
                node.id === entry.nodeId
                  ? { ...node, position: entry.newPosition }
                  : node
              )
            );
            // Update localStorage
            saveNodePosition(entry.nodeId, entry.newPosition);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo, setNodes]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Handle node click to highlight connected nodes
  const handleNodeClick: NodeMouseHandler = useCallback(
    (event, node) => {
      setSelectedNode(node.id);

      // Highlight all connected nodes (bookmarks, concepts, and entities)
      const connectedNodeIds = edges
        .filter((edge) => edge.source === node.id || edge.target === node.id)
        .map((edge) => (edge.source === node.id ? edge.target : edge.source));

      setHighlightedNodes(connectedNodeIds);

      // Detect overlaps: bookmarks connected to multiple concepts/entities
      // Count connections for each bookmark
      const bookmarkConnectionCount = new Map<string, number>();

      edges.forEach((edge) => {
        // Check if edge connects to a concept or entity
        const sourceIsConcept = edge.source.startsWith('concept-') || edge.source.startsWith('entity-');
        const targetIsConcept = edge.target.startsWith('concept-') || edge.target.startsWith('entity-');

        if (sourceIsConcept && edge.target.length === 36) {
          // Target is a bookmark (UUID format)
          const count = bookmarkConnectionCount.get(edge.target) || 0;
          bookmarkConnectionCount.set(edge.target, count + 1);
        }
        if (targetIsConcept && edge.source.length === 36) {
          // Source is a bookmark (UUID format)
          const count = bookmarkConnectionCount.get(edge.source) || 0;
          bookmarkConnectionCount.set(edge.source, count + 1);
        }
      });

      // Find bookmarks with multiple connections (overlap nodes)
      const overlapNodes: string[] = [];
      bookmarkConnectionCount.forEach((count, bookmarkId) => {
        if (count > 1 && connectedNodeIds.includes(bookmarkId)) {
          overlapNodes.push(bookmarkId);
        }
      });

      setOverlapNodes(overlapNodes);
    },
    [edges, setSelectedNode, setHighlightedNodes, setOverlapNodes]
  );

  // Handle pane click to clear selection and highlights
  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
    clearHighlights();
  }, [setSelectedNode, clearHighlights]);

  // Track position before drag starts
  const handleNodeDragStart = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setNodePositionBeforeDrag({
        id: node.id,
        position: { ...node.position },
      });
    },
    []
  );

  // Save node positions when dragged and add to history
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (nodePositionBeforeDrag && nodePositionBeforeDrag.id === node.id) {
        // Add to history
        addHistoryEntry({
          type: 'position',
          nodeId: node.id,
          oldPosition: nodePositionBeforeDrag.position,
          newPosition: { ...node.position },
          timestamp: Date.now(),
        });
      }
      saveNodePosition(node.id, node.position);
      setNodePositionBeforeDrag(null);
    },
    [nodePositionBeforeDrag, addHistoryEntry]
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
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
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
