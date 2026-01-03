'use client';

import { useCallback } from 'react';
import { Node } from '@xyflow/react';

const STORAGE_KEY = 'graph-node-positions';

export interface NodePosition {
  id: string;
  x: number;
  y: number;
}

/**
 * Hook for persisting and restoring node positions
 *
 * Saves positions to localStorage when nodes are dragged
 * Restores positions on mount
 */
export function useNodePositions() {
  /**
   * Save node positions to localStorage
   */
  const savePositions = useCallback((nodes: Node[]) => {
    try {
      const positions: Record<string, NodePosition> = {};

      nodes.forEach((node) => {
        if (node.position) {
          positions[node.id] = {
            id: node.id,
            x: node.position.x,
            y: node.position.y,
          };
        }
      });

      localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch (error) {
      console.error('[useNodePositions] Failed to save positions:', error);
    }
  }, []);

  /**
   * Load node positions from localStorage
   */
  const loadPositions = useCallback((): Record<string, NodePosition> => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('[useNodePositions] Failed to load positions:', error);
    }
    return {};
  }, []);

  /**
   * Apply saved positions to nodes
   */
  const applySavedPositions = useCallback(
    (nodes: Node[]): Node[] => {
      const savedPositions = loadPositions();

      return nodes.map((node) => {
        const saved = savedPositions[node.id];
        if (saved) {
          return {
            ...node,
            position: {
              x: saved.x,
              y: saved.y,
            },
          };
        }
        return node;
      });
    },
    [loadPositions]
  );

  /**
   * Clear saved positions
   */
  const clearPositions = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('[useNodePositions] Failed to clear positions:', error);
    }
  }, []);

  return {
    savePositions,
    loadPositions,
    applySavedPositions,
    clearPositions,
  };
}
