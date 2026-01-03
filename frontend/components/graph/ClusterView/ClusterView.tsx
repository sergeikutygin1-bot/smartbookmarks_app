'use client';

import { useState, useEffect } from 'react';
import { ClusterCard } from './ClusterCard';
import { MergeSuggestionCard } from './MergeSuggestionCard';
import { RefreshCw } from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002';

interface Cluster {
  id: string;
  name: string;
  description: string | null;
  bookmarkCount: number;
  newBookmarkCount?: number;
  coherenceScore: number;
  createdAt: string;
}

interface MergeSuggestion {
  cluster1: { id: string; name: string; bookmarkCount: number };
  cluster2: { id: string; name: string; bookmarkCount: number };
  similarity: number;
  reason: string;
}

export function ClusterView() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [unclusteredCount, setUnclusteredCount] = useState(0);
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingCluster, setIsCreatingCluster] = useState(false);
  const [isReorganizing, setIsReorganizing] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
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
        setClusters(result.data?.clusters || []);
        setUnclusteredCount(result.data?.unclusteredCount || 0);
        setError(null);

        // Fetch merge suggestions if we have clusters
        if (result.data?.clusters?.length >= 2) {
          fetchMergeSuggestions();
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setClusters([]);
        setUnclusteredCount(0);
      } finally {
        setIsLoading(false);
      }
    }

    fetchClusters();
  }, []);

  // Fetch merge suggestions
  const fetchMergeSuggestions = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/graph/clusters/merge-suggestions`);
      if (response.ok) {
        const result = await response.json();
        setMergeSuggestions(result.data?.suggestions || []);
      }
    } catch (err) {
      console.error('Error fetching merge suggestions:', err);
    }
  };

  // Handler for creating cluster from unclustered bookmarks
  const handleCreateCluster = async () => {
    try {
      setIsCreatingCluster(true);
      const response = await fetch(`${BACKEND_URL}/api/v1/graph/clusters/create-from-unclustered`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minClusterSize: 3 }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create cluster');
      }

      const result = await response.json();

      // Refresh clusters
      const clustersResponse = await fetch(`${BACKEND_URL}/api/v1/graph/clusters`);
      if (clustersResponse.ok) {
        const clustersData = await clustersResponse.json();
        setClusters(clustersData.data?.clusters || []);
        setUnclusteredCount(clustersData.data?.unclusteredCount || 0);
      }
    } catch (err) {
      console.error('Error creating cluster:', err);
      setError(err instanceof Error ? err : new Error('Failed to create cluster'));
    } finally {
      setIsCreatingCluster(false);
    }
  };

  // Handler for reorganizing all clusters
  const handleReorganize = async () => {
    if (!confirm('This will recreate all clusters from scratch. Your current clusters will be replaced. Continue?')) {
      return;
    }

    try {
      setIsReorganizing(true);
      const response = await fetch(`${BACKEND_URL}/api/v1/graph/clusters/reorganize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minClusterSize: 3 }),
      });

      if (!response.ok) {
        throw new Error('Failed to reorganize clusters');
      }

      // Refresh clusters
      const clustersResponse = await fetch(`${BACKEND_URL}/api/v1/graph/clusters`);
      if (clustersResponse.ok) {
        const clustersData = await clustersResponse.json();
        setClusters(clustersData.data?.clusters || []);
        setUnclusteredCount(clustersData.data?.unclusteredCount || 0);
        // Refresh merge suggestions
        fetchMergeSuggestions();
      }
    } catch (err) {
      console.error('Error reorganizing clusters:', err);
      setError(err instanceof Error ? err : new Error('Failed to reorganize clusters'));
    } finally {
      setIsReorganizing(false);
    }
  };

  // Handler for merging clusters
  const handleMerge = async (targetId: string, sourceId: string) => {
    try {
      setIsMerging(true);
      const response = await fetch(`${BACKEND_URL}/api/v1/graph/clusters/${targetId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceClusterId: sourceId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to merge clusters');
      }

      // Refresh clusters
      const clustersResponse = await fetch(`${BACKEND_URL}/api/v1/graph/clusters`);
      if (clustersResponse.ok) {
        const clustersData = await clustersResponse.json();
        setClusters(clustersData.data?.clusters || []);
        setUnclusteredCount(clustersData.data?.unclusteredCount || 0);
        // Refresh merge suggestions
        fetchMergeSuggestions();
      }
    } catch (err) {
      console.error('Error merging clusters:', err);
      setError(err instanceof Error ? err : new Error('Failed to merge clusters'));
    } finally {
      setIsMerging(false);
    }
  };

  // Handler for dismissing merge suggestion
  const handleDismissSuggestion = (suggestion: MergeSuggestion) => {
    const suggestionId = `${suggestion.cluster1.id}-${suggestion.cluster2.id}`;
    setDismissedSuggestions(prev => new Set(prev).add(suggestionId));
  };

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
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-black">
              Topic Clusters
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {clusters.length} auto-generated {clusters.length === 1 ? 'cluster' : 'clusters'} from your bookmarks
            </p>
          </div>

          {/* Reorganize All button - only show if clusters exist */}
          {clusters.length > 0 && (
            <button
              onClick={handleReorganize}
              disabled={isReorganizing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isReorganizing ? 'animate-spin' : ''}`} />
              {isReorganizing ? 'Reorganizing...' : 'Reorganize All Clusters'}
            </button>
          )}
        </div>

        {/* Merge Suggestions Section */}
        {mergeSuggestions.length > 0 && (
          <div className="mb-6">
            <h3 className="text-md font-semibold text-gray-900 mb-3">
              Merge Suggestions ({mergeSuggestions.filter(s => !dismissedSuggestions.has(`${s.cluster1.id}-${s.cluster2.id}`)).length})
            </h3>
            <div className="space-y-3">
              {mergeSuggestions
                .filter(suggestion => !dismissedSuggestions.has(`${suggestion.cluster1.id}-${suggestion.cluster2.id}`))
                .map((suggestion, index) => (
                  <MergeSuggestionCard
                    key={`${suggestion.cluster1.id}-${suggestion.cluster2.id}-${index}`}
                    suggestion={suggestion}
                    onMerge={handleMerge}
                    onDismiss={handleDismissSuggestion}
                    isMerging={isMerging}
                  />
                ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* Show unclustered card if there are unclustered bookmarks */}
          {unclusteredCount > 0 && (
            <ClusterCard
              key="unclustered"
              cluster={{
                id: 'unclustered',
                name: 'Unclustered',
                description: "Bookmarks that don't fit into existing clusters yet",
                bookmarkCount: unclusteredCount,
                coherenceScore: 0,
                createdAt: new Date().toISOString(),
              }}
              isUnclustered={true}
              onCreateCluster={handleCreateCluster}
              isCreating={isCreatingCluster}
            />
          )}

          {clusters.map((cluster) => (
            <ClusterCard key={cluster.id} cluster={cluster} />
          ))}
        </div>
      </div>
    </div>
  );
}
