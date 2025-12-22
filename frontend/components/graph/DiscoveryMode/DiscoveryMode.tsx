'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { DiscoveryPanel } from './DiscoveryPanel';
import { BreadcrumbTrail } from './BreadcrumbTrail';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002';

interface PathNode {
  id: string;
  type: 'bookmark' | 'concept' | 'entity';
  name: string;
}

interface RelatedItem {
  id: string;
  type: 'bookmark' | 'concept' | 'entity';
  name: string;
  relationshipType: string;
  weight: number;
}

export function DiscoveryMode() {
  const [path, setPath] = useState<PathNode[]>([]);
  const [currentNode, setCurrentNode] = useState<PathNode | null>(null);
  const [relatedItems, setRelatedItems] = useState<RelatedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Start with a random bookmark
  useEffect(() => {
    async function initializeDiscovery() {
      try {
        setIsLoading(true);

        // Fetch a random bookmark to start
        const response = await fetch(`${BACKEND_URL}/api/bookmarks?limit=1`);
        if (response.ok) {
          const data = await response.json();
          if (data.data && data.data.length > 0) {
            const firstBookmark = data.data[0];
            const startNode: PathNode = {
              id: firstBookmark.id,
              type: 'bookmark',
              name: firstBookmark.title || 'Untitled',
            };
            setCurrentNode(startNode);
            setPath([startNode]);
            await fetchRelatedItems(startNode);
          }
        }
      } catch (error) {
        console.error('Error initializing discovery:', error);
      } finally {
        setIsLoading(false);
      }
    }

    initializeDiscovery();
  }, []);

  async function fetchRelatedItems(node: PathNode) {
    try {
      setIsLoading(true);
      const related: RelatedItem[] = [];

      if (node.type === 'bookmark') {
        // Fetch related bookmarks, entities, and concepts
        const response = await fetch(
          `${BACKEND_URL}/api/v1/graph/bookmarks/${node.id}/related?limit=10`
        );

        if (response.ok) {
          const data = await response.json();

          // Add related bookmarks
          data.data?.related?.forEach((rel: any) => {
            if (rel.bookmark) {
              related.push({
                id: rel.bookmark.id,
                type: 'bookmark',
                name: rel.bookmark.title || 'Untitled',
                relationshipType: rel.relationshipType || 'similar_to',
                weight: rel.weight || 0.8,
              });
            }
          });

          // Add entities
          data.data?.entities?.forEach((ent: any) => {
            if (ent.entity) {
              related.push({
                id: ent.entity.id,
                type: 'entity',
                name: ent.entity.name,
                relationshipType: 'mentions',
                weight: ent.weight || 0.7,
              });
            }
          });

          // Add concepts
          data.data?.concepts?.forEach((con: any) => {
            if (con.concept) {
              related.push({
                id: con.concept.id,
                type: 'concept',
                name: con.concept.name,
                relationshipType: 'about',
                weight: con.weight || 0.75,
              });
            }
          });
        }
      } else if (node.type === 'concept') {
        // Fetch related concepts
        const response = await fetch(
          `${BACKEND_URL}/api/v1/graph/concepts/${node.id}/related?limit=10`
        );

        if (response.ok) {
          const data = await response.json();
          data.data?.forEach((rel: any) => {
            related.push({
              id: rel.id,
              type: 'concept',
              name: rel.name,
              relationshipType: 'related_to',
              weight: 0.8,
            });
          });
        }
      } else if (node.type === 'entity') {
        // Fetch bookmarks mentioning this entity
        const response = await fetch(
          `${BACKEND_URL}/api/v1/graph/entities/${node.id}/bookmarks?limit=10`
        );

        if (response.ok) {
          const data = await response.json();
          data.data?.forEach((bookmark: any) => {
            related.push({
              id: bookmark.id,
              type: 'bookmark',
              name: bookmark.title || 'Untitled',
              relationshipType: 'mentions',
              weight: 0.8,
            });
          });
        }
      }

      setRelatedItems(related);
    } catch (error) {
      console.error('Error fetching related items:', error);
      setRelatedItems([]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleNodeClick(item: RelatedItem) {
    const newNode: PathNode = {
      id: item.id,
      type: item.type,
      name: item.name,
    };

    // Add to path
    setPath([...path, newNode]);
    setCurrentNode(newNode);
    fetchRelatedItems(newNode);
  }

  function handleBreadcrumbClick(index: number) {
    // Navigate back in the path
    const newPath = path.slice(0, index + 1);
    const targetNode = path[index];
    setPath(newPath);
    setCurrentNode(targetNode);
    fetchRelatedItems(targetNode);
  }

  function handleReset() {
    if (path.length > 0) {
      const firstNode = path[0];
      setPath([firstNode]);
      setCurrentNode(firstNode);
      fetchRelatedItems(firstNode);
    }
  }

  if (isLoading && !currentNode) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading discovery mode...</div>
      </div>
    );
  }

  if (!currentNode) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md px-6">
          <h3 className="text-lg font-semibold text-black mb-2">
            No Bookmarks Yet
          </h3>
          <p className="text-sm text-gray-600">
            Add some bookmarks to start exploring connections in discovery mode.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Breadcrumb Trail */}
      <div className="border-b border-gray-200 px-6 py-4">
        <BreadcrumbTrail
          path={path}
          onNodeClick={handleBreadcrumbClick}
          onReset={handleReset}
        />
      </div>

      {/* Discovery Panel */}
      <div className="flex-1 overflow-auto">
        <DiscoveryPanel
          currentNode={currentNode}
          relatedItems={relatedItems}
          onItemClick={handleNodeClick}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
