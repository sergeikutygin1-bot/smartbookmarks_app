'use client';

import { useState, useEffect } from 'react';
import { Node, Edge } from '@xyflow/react';
import { useGraphStore } from '@/store/graphStore';
import { applyForceLayout } from '@/lib/graph/layout';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002';
const STORAGE_KEY = 'graph-node-positions';
const ENABLE_SEMANTIC_LAYOUT = true; // Feature flag

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

interface PositionData {
  bookmarkPositions: Array<{
    bookmarkId: string;
    position: { x: number; y: number };
    method: 'umap' | 'fallback';
  }>;
  conceptPositions: Array<{
    conceptId: string;
    position: { x: number; y: number };
    connectedBookmarks: string[];
  }>;
  entityPositions: Array<{
    entityId: string;
    position: { x: number; y: number };
    connectedBookmarks: string[];
  }>;
  metadata: {
    totalBookmarks: number;
    enrichedBookmarks: number;
    computeTimeMs: number;
    cacheHit: boolean;
  };
}

/**
 * Apply semantic positions from backend UMAP computation
 */
function applySemanticPositions(
  nodes: Node[],
  positionsData: PositionData
): Node[] {
  // Create position maps for fast lookup
  const bookmarkPosMap = new Map(
    positionsData.bookmarkPositions.map(p => [p.bookmarkId, p.position])
  );
  const conceptPosMap = new Map(
    positionsData.conceptPositions.map(p => [`concept-${p.conceptId}`, p.position])
  );
  const entityPosMap = new Map(
    positionsData.entityPositions.map(p => [`entity-${p.entityId}`, p.position])
  );

  // Load saved positions from localStorage (user adjustments)
  const savedPositions = loadSavedPositions();

  return nodes.map(node => {
    // Priority: localStorage > semantic positions > existing position
    const savedPos = savedPositions[node.id];
    if (savedPos) {
      return { ...node, position: savedPos };
    }

    // Apply semantic positions based on node type
    let semanticPos;
    if (node.type === 'bookmark') {
      semanticPos = bookmarkPosMap.get(node.id);
    } else if (node.type === 'concept') {
      semanticPos = conceptPosMap.get(node.id);
    } else if (node.type === 'entity') {
      semanticPos = entityPosMap.get(node.id);
    }

    if (semanticPos) {
      return { ...node, position: semanticPos };
    }

    // Fallback: keep existing position
    return node;
  });
}

/**
 * Apply force-directed layout (fallback when semantic layout unavailable)
 */
function applyForceFallback(nodes: Node[], edges: Edge[]): Node[] {
  const savedPositions = loadSavedPositions();

  // Check if we have saved positions for all nodes
  const allNodesSaved = nodes.every(node => savedPositions[node.id]);

  if (allNodesSaved) {
    // Use saved positions for all nodes (no layout calculation needed)
    console.log(`[useGraphData] Using saved positions for all nodes`);
    return nodes.map(node => ({
      ...node,
      position: savedPositions[node.id],
    }));
  }

  // Run force layout for new nodes or initial layout
  console.log(`[useGraphData] Running force-directed layout`);
  const layoutedNodes = applyForceLayout(nodes, edges, {
    width: 4000,
    height: 3000,
    iterations: 300,
    bookmarkCharge: -2000,
    conceptEntityCharge: -800,
  });

  // Merge with saved positions (prefer saved for existing nodes)
  const finalNodes = layoutedNodes.map(node => {
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

  console.log(`[useGraphData] Force-directed layout complete`);
  return finalNodes;
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

        // Collections to track unique concepts and entities from bookmarks
        const conceptsMap = new Map<string, any>();
        const entitiesMap = new Map<string, any>();

        // Step 1: Fetch bookmarks (only show completed/enriched bookmarks in graph)
        let bookmarkNodes: Node[] = [];
        if (filters.nodeTypes.includes('bookmarks')) {
          const bookmarksResponse = await fetch(`${BACKEND_URL}/api/bookmarks?limit=50&status=completed`);
          if (bookmarksResponse.ok) {
            const bookmarksData = await bookmarksResponse.json();
            bookmarksData.data?.forEach((bookmark: any) => {
              // Only include bookmarks that have completed enrichment
              if (bookmark.status === 'completed') {
                const bookmarkNode = {
                  id: bookmark.id,
                  type: 'bookmark',
                  position: { x: 0, y: 0 }, // Will be set by semantic layout or force fallback
                  zIndex: 10, // Bookmarks on front layer by default
                  data: {
                    id: bookmark.id,
                    title: bookmark.title || 'Untitled',
                    url: bookmark.url,
                    domain: bookmark.domain,
                    contentType: bookmark.contentType,
                  },
                };
                nodes.push(bookmarkNode);
                bookmarkNodes.push(bookmarkNode);
              }
            });
          }
        }

        // Step 2: For each bookmark, fetch its related concepts/entities and create edges
        // This ensures all related nodes are included, not just top N by occurrence
        await Promise.all(
          bookmarkNodes.map(async (bookmarkNode) => {
            try {
              const relatedResponse = await fetch(
                `${BACKEND_URL}/api/v1/graph/bookmarks/${bookmarkNode.id}/related?limit=20`
              );

              if (relatedResponse.ok) {
                const relatedData = await relatedResponse.json();

                // Collect concepts from this bookmark and create edges
                if (filters.nodeTypes.includes('concepts')) {
                  relatedData.data?.concepts?.forEach((conceptRel: any) => {
                    const concept = conceptRel.concept;
                    if (concept) {
                      // Add to concepts map if not already there
                      if (!conceptsMap.has(concept.id)) {
                        conceptsMap.set(concept.id, {
                          id: concept.id,
                          name: concept.name,
                          occurrenceCount: concept.occurrenceCount || 0,
                        });
                      }

                      // Create edge from bookmark to concept
                      const conceptNodeId = `concept-${concept.id}`;
                      edges.push({
                        id: `${bookmarkNode.id}-${conceptNodeId}`,
                        source: bookmarkNode.id,
                        target: conceptNodeId,
                        type: 'smoothstep',
                        animated: false,
                        style: {
                          stroke: '#8B5CF6', // Purple for concepts
                          strokeWidth: 1.5,
                          strokeOpacity: 0.1, // Default 10% opacity
                        },
                        data: {
                          defaultColor: '#8B5CF6',
                          defaultOpacity: 0.1,
                        },
                      });
                    }
                  });
                }

                // Collect entities from this bookmark and create edges
                if (filters.nodeTypes.includes('entities')) {
                  relatedData.data?.entities?.forEach((entityRel: any) => {
                    const entity = entityRel.entity;
                    if (entity) {
                      // Add to entities map if not already there
                      if (!entitiesMap.has(entity.id)) {
                        entitiesMap.set(entity.id, {
                          id: entity.id,
                          name: entity.name,
                          entityType: entity.entityType,
                          occurrenceCount: entity.occurrenceCount || 0,
                        });
                      }

                      // Create edge from bookmark to entity
                      const entityNodeId = `entity-${entity.id}`;
                      edges.push({
                        id: `${bookmarkNode.id}-${entityNodeId}`,
                        source: bookmarkNode.id,
                        target: entityNodeId,
                        type: 'smoothstep',
                        animated: false,
                        style: {
                          stroke: '#10B981', // Green for entities
                          strokeWidth: 1.5,
                          strokeOpacity: 0.1, // Default 10% opacity
                        },
                        data: {
                          defaultColor: '#10B981',
                          defaultOpacity: 0.1,
                        },
                      });
                    }
                  });
                }

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
                          strokeOpacity: 0.1, // Default 10% opacity
                        },
                        data: {
                          defaultColor: '#D1D1D6',
                          defaultOpacity: 0.1,
                        },
                      });
                    }
                  }
                });
              }
            } catch (error) {
              console.warn(`Failed to fetch relationships for bookmark ${bookmarkNode.id}`, error);
            }
          })
        );

        // Step 3: Create concept nodes from collected concepts
        if (filters.nodeTypes.includes('concepts')) {
          conceptsMap.forEach((concept) => {
            nodes.push({
              id: `concept-${concept.id}`,
              type: 'concept',
              position: { x: 0, y: 0 },
              zIndex: 5, // Concepts on back layer (behind bookmarks)
              data: {
                id: concept.id,
                name: concept.name,
                occurrenceCount: concept.occurrenceCount,
              },
            });
          });
        }

        // Step 4: Create entity nodes from collected entities
        if (filters.nodeTypes.includes('entities')) {
          entitiesMap.forEach((entity) => {
            nodes.push({
              id: `entity-${entity.id}`,
              type: 'entity',
              position: { x: 0, y: 0 },
              zIndex: 5, // Entities on back layer (behind bookmarks)
              data: {
                id: entity.id,
                name: entity.name,
                entityType: entity.entityType,
                occurrenceCount: entity.occurrenceCount,
              },
            });
          });
        }

        console.log(`[useGraphData] Collected ${conceptsMap.size} concepts and ${entitiesMap.size} entities from ${bookmarkNodes.length} bookmarks`);
        console.log(`[useGraphData] Preparing layout for ${nodes.length} nodes and ${edges.length} edges`);

        // Fetch semantic positions in parallel if enabled
        let finalNodes: Node[];

        if (ENABLE_SEMANTIC_LAYOUT) {
          try {
            console.log(`[useGraphData] Fetching semantic positions from backend`);
            const positionsResponse = await fetch(`${BACKEND_URL}/api/v1/graph/positions`);

            if (positionsResponse.ok) {
              const positionsResult = await positionsResponse.json();
              const positionsData = positionsResult.data as PositionData;

              console.log(
                `[useGraphData] Semantic layout: ${positionsData.metadata.enrichedBookmarks}/${positionsData.metadata.totalBookmarks} enriched bookmarks, ` +
                `compute time: ${positionsData.metadata.computeTimeMs}ms, cache hit: ${positionsData.metadata.cacheHit}`
              );

              finalNodes = applySemanticPositions(nodes, positionsData);
              console.log(`[useGraphData] Applied semantic layout to ${finalNodes.length} nodes`);
            } else {
              console.warn('[useGraphData] Semantic positions API failed, using force-directed fallback');
              finalNodes = applyForceFallback(nodes, edges);
            }
          } catch (error) {
            console.error('[useGraphData] Error fetching semantic positions, using force-directed fallback:', error);
            finalNodes = applyForceFallback(nodes, edges);
          }
        } else {
          // Feature flag disabled, use force-directed layout
          console.log(`[useGraphData] Semantic layout disabled, using force-directed`);
          finalNodes = applyForceFallback(nodes, edges);
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
