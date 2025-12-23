'use client';

import { useState, useEffect } from 'react';
import { Node, Edge } from '@xyflow/react';
import { useGraphStore } from '@/store/graphStore';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002';

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
                position: { x: Math.random() * 800, y: Math.random() * 600 },
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
                position: { x: Math.random() * 800 + 300, y: Math.random() * 600 },
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
                position: { x: Math.random() * 800 + 600, y: Math.random() * 600 },
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
        const conceptNodes = nodes.filter(n => n.type === 'concept');
        const entityNodes = nodes.filter(n => n.type === 'entity');

        // Fetch relationships for each bookmark to connect to entities and concepts
        for (const bookmarkNode of bookmarkNodes.slice(0, 10)) { // Limit to first 10 for performance
          try {
            const relatedResponse = await fetch(
              `${BACKEND_URL}/api/v1/graph/bookmarks/${bookmarkNode.id}/related?limit=5`
            );

            if (relatedResponse.ok) {
              const relatedData = await relatedResponse.json();

              // Add edges to related bookmarks
              relatedData.data?.related?.forEach((rel: any) => {
                const targetId = rel.bookmark?.id;
                if (targetId && nodes.find(n => n.id === targetId)) {
                  edges.push({
                    id: `${bookmarkNode.id}-${targetId}`,
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
                      stroke: '#E5E5E5',
                      strokeWidth: 1,
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
                      stroke: '#F0F0F0',
                      strokeWidth: 1,
                    },
                  });
                }
              });
            }
          } catch (error) {
            console.warn(`Failed to fetch relationships for bookmark ${bookmarkNode.id}`, error);
          }
        }

        setData({ nodes, edges });
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
