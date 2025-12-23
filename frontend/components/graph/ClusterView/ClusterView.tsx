'use client';

import { useState, useEffect } from 'react';
import { ClusterCard } from './ClusterCard';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002';

interface Cluster {
  id: string;
  name: string;
  description: string | null;
  bookmarkCount: number;
  coherenceScore: number;
  createdAt: string;
}

export function ClusterView() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchClusters() {
      try {
        setIsLoading(true);
        const response = await fetch(`${BACKEND_URL}/api/v1/graph/clusters`);

        if (!response.ok) {
          throw new Error('Failed to fetch clusters');
        }

        const result = await response.json();
        setClusters(result.data || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setClusters([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchClusters();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading clusters...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">Error loading clusters: {error.message}</div>
      </div>
    );
  }

  if (clusters.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md px-6">
          <h3 className="text-lg font-semibold text-black mb-2">
            No Clusters Yet
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Clusters are automatically generated from your bookmarks. Add more bookmarks
            to see topic-based groupings appear.
          </p>
          <p className="text-xs text-gray-500">
            Clustering runs daily to organize your content into related topics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-black">
            Topic Clusters
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {clusters.length} auto-generated {clusters.length === 1 ? 'cluster' : 'clusters'} from your bookmarks
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {clusters.map((cluster) => (
            <ClusterCard key={cluster.id} cluster={cluster} />
          ))}
        </div>
      </div>
    </div>
  );
}
