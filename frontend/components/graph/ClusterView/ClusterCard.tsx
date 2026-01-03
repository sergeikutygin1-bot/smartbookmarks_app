'use client';

import { useState } from 'react';
import { FolderOpen, ChevronRight, Plus } from 'lucide-react';

interface Cluster {
  id: string;
  name: string;
  description: string | null;
  bookmarkCount: number;
  newBookmarkCount?: number;
  coherenceScore: number;
  createdAt: string;
}

interface ClusterCardProps {
  cluster: Cluster;
  isUnclustered?: boolean;
  onCreateCluster?: () => void;
  isCreating?: boolean;
}

export function ClusterCard({ cluster, isUnclustered = false, onCreateCluster, isCreating = false }: ClusterCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Color based on coherence score (quality indicator)
  const getQualityColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-blue-600';
    return 'text-gray-600';
  };

  const qualityLabel = (score: number) => {
    if (score >= 0.8) return 'High coherence';
    if (score >= 0.6) return 'Medium coherence';
    return 'Low coherence';
  };

  return (
    <div
      className={`bg-white border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${
        isUnclustered
          ? 'border-yellow-300 bg-yellow-50'
          : 'border-gray-200'
      }`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <FolderOpen
            className={`w-5 h-5 ${isUnclustered ? 'text-yellow-600' : 'text-gray-600'}`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-black truncate">
                {cluster.name}
              </h3>
              {cluster.newBookmarkCount && cluster.newBookmarkCount > 0 && !isUnclustered && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 flex-shrink-0">
                  +{cluster.newBookmarkCount} new
                </span>
              )}
            </div>
            <ChevronRight
              className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${
                isExpanded ? 'rotate-90' : ''
              }`}
            />
          </div>

          {cluster.description && (
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              {cluster.description}
            </p>
          )}

          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">
              {cluster.bookmarkCount} {cluster.bookmarkCount === 1 ? 'bookmark' : 'bookmarks'}
            </span>
            {!isUnclustered && (
              <span className={`${getQualityColor(cluster.coherenceScore)} font-medium`}>
                {qualityLabel(cluster.coherenceScore)}
              </span>
            )}
            {isUnclustered && cluster.bookmarkCount >= 5 && (
              <span className="text-yellow-600 font-medium">
                Ready to cluster
              </span>
            )}
          </div>

          {/* Cluster visualization preview - simple dots representing bookmarks */}
          <div className="mt-3 flex gap-1.5 flex-wrap">
            {Array.from({ length: Math.min(cluster.bookmarkCount, 12) }).map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-gray-300"
              />
            ))}
            {cluster.bookmarkCount > 12 && (
              <span className="text-xs text-gray-400 ml-1">
                +{cluster.bookmarkCount - 12}
              </span>
            )}
          </div>

          {/* Expanded view - could show more details later */}
          {isExpanded && !isUnclustered && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-500">
                Created {new Date(cluster.createdAt).toLocaleDateString()}
              </div>
              <div className="mt-2 text-xs text-gray-600">
                Coherence score: {(cluster.coherenceScore * 100).toFixed(0)}%
              </div>
            </div>
          )}

          {/* Unclustered card expanded view with action button */}
          {isExpanded && isUnclustered && (
            <div className="mt-3 pt-3 border-t border-yellow-200">
              <p className="text-xs text-gray-600 mb-3">
                These bookmarks don't fit into existing clusters. Create a new cluster to group them by topic.
              </p>
              {cluster.bookmarkCount >= 3 && onCreateCluster && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateCluster();
                  }}
                  disabled={isCreating}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-yellow-600 text-white text-sm font-medium rounded-md hover:bg-yellow-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className={`w-4 h-4 ${isCreating ? 'animate-spin' : ''}`} />
                  {isCreating ? 'Creating Cluster...' : 'Create Cluster from These Bookmarks'}
                </button>
              )}
              {cluster.bookmarkCount < 3 && (
                <p className="text-xs text-yellow-700 italic">
                  Need at least 3 bookmarks to create a cluster (currently have {cluster.bookmarkCount})
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
