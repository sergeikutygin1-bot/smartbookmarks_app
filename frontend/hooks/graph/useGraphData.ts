'use client';

import { useState, useEffect } from 'react';
import { Node, Edge } from '@xyflow/react';
import { useGraphStore } from '@/store/graphStore';
import { applyForceLayout } from '@/lib/graph/layout';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002';
const STORAGE_KEY = 'graph-node-positions';

// Helper functions for localStorage
function loadSavedPositions(): Record<string, { x: number; y: number }> {
  if (typeof window === 'undefined') return {};
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return {};

    const parsed = JSON.parse(saved);
    // Validate that all positions are valid numbers
    const validated: Record<string, { x: number; y: number }> = {};
    for (const [id, pos] of Object.entries(parsed)) {
      const position = pos as { x: number; y: number };
      if (
        typeof position.x === 'number' &&
        typeof position.y === 'number' &&
        isFinite(position.x) &&
        isFinite(position.y)
      ) {
        validated[id] = position;
      }
    }
    return validated;
  } catch {
    return {};
  }
}

export function saveNodePosition(nodeId: string, position: { x: number; y: number }) {
  if (typeof window === 'undefined') return;
  // Validate position before saving
  if (
    typeof position.x !== 'number' ||
    typeof position.y !== 'number' ||
    !isFinite(position.x) ||
    !isFinite(position.y)
  ) {
    console.warn('Invalid position, not saving:', position);
    return;
  }
  try {
    const saved = loadSavedPositions();
    saved[nodeId] = position;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch (error) {
    console.warn('Failed to save node position:', error);
  }
}

export function clearSavedPositions() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear saved positions:', error);
  }
}

interface GraphResponse {
  data: {
    bookmarks: Array<{
      id: string;
      title: string;
      url: string;
      domain?: string;
      contentType?: string;
    }>;
    entities?: Array<{
      id: string;
      name: string;
      entityType: string;
      occurrenceCount: number;
    }>;
    concepts?: Array<{
      id: string;
      name: string;
      occurrenceCount: number;
    }>;
    relationships: Array<{
      sourceType: string;
      sourceId: string;
      targetType: string;
      targetId: string;
      relationshipType: string;
      weight: number;
    }>;
  };
}

export function useGraphData() {
  const [data, setData] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { filters } = useGraphStore();

  useEffect(() => {
    async function fetchGraphData() {
      try {
        setIsLoading(true);

        // Fetch graph stats to get all data
        const response = await fetch(`${BACKEND_URL}/api/v1/graph/stats`);

        if (!response.ok) {
          throw new Error('Failed to fetch graph data');
        }

        const result = await response.json();

        // Transform API data into React Flow nodes and edges
        const nodes: Node[] = [];
        const edges: Edge[] = [];
        const seenEdges = new Set<string>(); // Track edges to prevent duplicates

        // Add bookmark nodes
        if (filters.nodeTypes.includes('bookmarks')) {
          // For now, we'll need to fetch bookmarks separately
          const bookmarksResponse = await fetch(`${BACKEND_URL}/api/bookmarks?limit=50`);
          if (bookmarksResponse.ok) {
            const bookmarksData = await bookmarksResponse.json();
            // API returns { data: [...bookmarks...] } not { data: { bookmarks: [...] } }
            bookmarksData.data?.forEach((bookmark: any, index: number) => {
              nodes.push({
                id: bookmark.id,
                type: 'bookmark',
                position: { x: 0, y: 0 }, // Will be set by force layout
                data: {
                  id: bookmark.id,
                  title: bookmark.title || 'Untitled',
                  url: bookmark.url,
                  domain: bookmark.domain,
                  contentType: bookmark.contentType,
                },
              });
            });
          }
        }

        // Add concept nodes
        if (filters.nodeTypes.includes('concepts')) {
          const conceptsResponse = await fetch(`${BACKEND_URL}/api/v1/graph/concepts?limit=20`);
          if (conceptsResponse.ok) {
            const conceptsData = await conceptsResponse.json();
            conceptsData.data?.forEach((concept: any, index: number) => {
              nodes.push({
                id: `concept-${concept.id}`,
                type: 'concept',
                position: { x: 0, y: 0 }, // Will be set by force layout
                data: {
                  id: concept.id,
                  name: concept.name,
                  occurrenceCount: concept.occurrenceCount,
                },
              });
            });
          }
        }

        // Add entity nodes
        if (filters.nodeTypes.includes('entities')) {
          const entitiesResponse = await fetch(`${BACKEND_URL}/api/v1/graph/entities?limit=30`);
          if (entitiesResponse.ok) {
            const entitiesData = await entitiesResponse.json();
            entitiesData.data?.forEach((entity: any, index: number) => {
              nodes.push({
                id: `entity-${entity.id}`,
                type: 'entity',
                position: { x: 0, y: 0 }, // Will be set by force layout
                data: {
                  id: entity.id,
                  name: entity.name,
                  entityType: entity.entityType,
                  occurrenceCount: entity.occurrenceCount,
                },
              });
            });
          }
        }


        // Fetch relationships to connect nodes
        // Create edges between bookmarks and entities/concepts based on relationships
        const bookmarkNodes = nodes.filter(n => n.type === 'bookmark');

        // Fetch relationships for ALL bookmarks (not just first 10)
        // Use Promise.all for parallel fetching to improve performance
        await Promise.all(
          bookmarkNodes.map(async (bookmarkNode) => {
            try {
              const relatedResponse = await fetch(
                `${BACKEND_URL}/api/v1/graph/bookmarks/${bookmarkNode.id}/related?limit=10`
              );

              if (relatedResponse.ok) {
                const relatedData = await relatedResponse.json();

                // Add edges to related bookmarks (deduplicate bidirectional edges)
                relatedData.data?.related?.forEach((rel: any) => {
                  const targetId = rel.bookmark?.id;
                  if (targetId && nodes.find(n => n.id === targetId)) {
                    // Create a unique edge key (sorted to catch both A→B and B→A)
                    const edgeKey = [bookmarkNode.id, targetId].sort().join('-');

                    if (!seenEdges.has(edgeKey)) {
                      seenEdges.add(edgeKey);
                      edges.push({
                        id: edgeKey,
                        source: bookmarkNode.id,
                        target: targetId,
                        type: 'smoothstep',
                        animated: false,
                        label: `${(rel.weight * 100).toFixed(0)}%`,
                        style: {
                          stroke: '#D1D1D6',
                          strokeWidth: Math.max(1, rel.weight * 3),
                        },
                      });
                    }
                  }
                });

                // Add edges to entities mentioned in this bookmark
                relatedData.data?.entities?.forEach((entity: any) => {
                  const entityNodeId = `entity-${entity.entity.id}`;
                  if (nodes.find(n => n.id === entityNodeId)) {
                    edges.push({
                      id: `${bookmarkNode.id}-${entityNodeId}`,
                      source: bookmarkNode.id,
                      target: entityNodeId,
                      type: 'smoothstep',
                      animated: false,
                      style: {
                        stroke: '#10B981', // Green for entities
                        strokeWidth: 1.5,
                      },
                    });
                  }
                });

                // Add edges to concepts this bookmark is about
                relatedData.data?.concepts?.forEach((concept: any) => {
                  const conceptNodeId = `concept-${concept.concept.id}`;
                  if (nodes.find(n => n.id === conceptNodeId)) {
                    edges.push({
                      id: `${bookmarkNode.id}-${conceptNodeId}`,
                      source: bookmarkNode.id,
                      target: conceptNodeId,
                      type: 'smoothstep',
                      animated: false,
                      style: {
                        stroke: '#8B5CF6', // Purple for concepts
                        strokeWidth: 1.5,
                      },
                    });
                  }
                });
              }
            } catch (error) {
              console.warn(`Failed to fetch relationships for bookmark ${bookmarkNode.id}`, error);
            }
          })
        );

        console.log(`[useGraphData] Preparing layout for ${nodes.length} nodes and ${edges.length} edges`);

        // Load saved positions from localStorage
        const savedPositions = loadSavedPositions();

        // Check if we have saved positions for all nodes
        const allNodesSaved = nodes.every(node => savedPositions[node.id]);

        let finalNodes: Node[];

        if (allNodesSaved) {
          // Use saved positions for all nodes (no layout calculation needed)
          console.log(`[useGraphData] Using saved positions for all nodes`);
          finalNodes = nodes.map(node => ({
            ...node,
            position: savedPositions[node.id],
          }));
        } else {
          // Run force layout for new nodes or initial layout
          console.log(`[useGraphData] Running force layout`);
          const layoutedNodes = applyForceLayout(nodes, edges, {
            width: 4000,
            height: 3000,
            iterations: 300,
            bookmarkCharge: -2000,
            conceptEntityCharge: -800,
          });

          // Merge with saved positions (prefer saved for existing nodes)
          finalNodes = layoutedNodes.map(node => {
            const savedPos = savedPositions[node.id];
            if (savedPos) {
              return {
                ...node,
                position: savedPos,
              };
            }
            return node;
          });

          // Save all new positions to localStorage
          finalNodes.forEach(node => {
            if (!savedPositions[node.id]) {
              saveNodePosition(node.id, node.position);
            }
          });

          console.log(`[useGraphData] Layout complete, positions saved`);
        }

        setData({ nodes: finalNodes, edges });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    }

    fetchGraphData();
  }, [filters.nodeTypes]);

  return { data, isLoading, error };
}
