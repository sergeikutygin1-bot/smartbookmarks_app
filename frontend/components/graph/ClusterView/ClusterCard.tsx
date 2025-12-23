'use client';

import { useState } from 'react';
import { FolderOpen, ChevronRight } from 'lucide-react';

interface Cluster {
  id: string;
  name: string;
  description: string | null;
  bookmarkCount: number;
  coherenceScore: number;
  createdAt: string;
}

interface ClusterCardProps {
  cluster: Cluster;
}

export function ClusterCard({ cluster }: ClusterCardProps) {
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
      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <FolderOpen className="w-5 h-5 text-gray-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold text-black truncate">
              {cluster.name}
            </h3>
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
            <span className={`${getQualityColor(cluster.coherenceScore)} font-medium`}>
              {qualityLabel(cluster.coherenceScore)}
            </span>
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
          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-500">
                Created {new Date(cluster.createdAt).toLocaleDateString()}
              </div>
              <div className="mt-2 text-xs text-gray-600">
                Coherence score: {(cluster.coherenceScore * 100).toFixed(0)}%
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
