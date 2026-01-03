import { Node, Edge } from '@xyflow/react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  SimulationNodeDatum,
} from 'd3-force';

interface LayoutNode extends SimulationNodeDatum {
  id: string;
  type?: string;
  x?: number;
  y?: number;
}

interface LayoutLink {
  source: string;
  target: string;
}

/**
 * Apply force-directed layout to graph nodes
 *
 * Features:
 * - Stronger repulsion for bookmarks to spread them out
 * - Weaker repulsion for concepts/entities
 * - Collision detection to prevent overlap
 * - Link forces to maintain connections
 */
export function applyForceLayout(
  nodes: Node[],
  edges: Edge[],
  options: {
    width?: number;
    height?: number;
    iterations?: number;
    bookmarkCharge?: number;
    conceptEntityCharge?: number;
  } = {}
): Node[] {
  const {
    width = 4000,
    height = 3000,
    iterations = 300,
    bookmarkCharge = -2000,
    conceptEntityCharge = -800,
  } = options;

  if (nodes.length === 0) return nodes;

  // Simple hash function for deterministic positioning
  const hashCode = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  };

  // Create simulation nodes with deterministic initial positions
  const simulationNodes: LayoutNode[] = nodes.map((node, index) => {
    // Use saved position if it exists and is valid
    const hasValidPosition =
      node.position.x !== undefined &&
      node.position.y !== undefined &&
      isFinite(node.position.x) &&
      isFinite(node.position.y) &&
      (node.position.x !== 0 || node.position.y !== 0);

    if (hasValidPosition) {
      return {
        id: node.id,
        type: node.type,
        x: node.position.x,
        y: node.position.y,
      };
    }

    // Otherwise use deterministic position based on node ID hash
    const hash = hashCode(node.id);
    return {
      id: node.id,
      type: node.type,
      x: (hash % width) * 0.8 + width * 0.1,
      y: ((hash >> 8) % height) * 0.8 + height * 0.1,
    };
  });

  // Create simulation links
  const simulationLinks: LayoutLink[] = edges.map(edge => ({
    source: edge.source,
    target: edge.target,
  }));

  // Apply force simulation
  const simulation = forceSimulation(simulationNodes)
    .force(
      'link',
      forceLink(simulationLinks)
        .id((d: any) => d.id)
        .distance((d: any) => {
          // Longer distances for better spacing
          return 350;
        })
        .strength(0.4)
    )
    .force(
      'charge',
      forceManyBody().strength((d: any) => {
        // Stronger repulsion for bookmarks to spread them out
        return d.type === 'bookmark' ? bookmarkCharge : conceptEntityCharge;
      })
    )
    .force('center', forceCenter(width / 2, height / 2))
    .force(
      'collide',
      forceCollide()
        .radius((d: any) => {
          // Larger collision radius for more spacing
          return d.type === 'bookmark' ? 150 : 80;
        })
        .strength(0.9)
    );

  // Run simulation for fixed number of iterations
  simulation.stop();
  for (let i = 0; i < iterations; i++) {
    simulation.tick();
  }

  // Apply computed positions back to nodes
  return nodes.map(node => {
    const simulationNode = simulationNodes.find(n => n.id === node.id);
    if (simulationNode && simulationNode.x !== undefined && simulationNode.y !== undefined) {
      return {
        ...node,
        position: {
          x: simulationNode.x,
          y: simulationNode.y,
        },
      };
    }
    return node;
  });
}
