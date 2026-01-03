'use client';

import { useState } from 'react';
import { GitMerge, AlertCircle, X } from 'lucide-react';

interface MergeSuggestion {
  cluster1: { id: string; name: string; bookmarkCount: number };
  cluster2: { id: string; name: string; bookmarkCount: number };
  similarity: number;
  reason: string;
}

interface MergeSuggestionCardProps {
  suggestion: MergeSuggestion;
  onMerge: (targetId: string, sourceId: string) => void;
  onDismiss: (suggestion: MergeSuggestion) => void;
  isMerging: boolean;
}

export function MergeSuggestionCard({
  suggestion,
  onMerge,
  onDismiss,
  isMerging,
}: MergeSuggestionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleMerge = () => {
    // Merge smaller cluster into larger cluster
    const isCluster1Larger = suggestion.cluster1.bookmarkCount >= suggestion.cluster2.bookmarkCount;
    const targetId = isCluster1Larger ? suggestion.cluster1.id : suggestion.cluster2.id;
    const sourceId = isCluster1Larger ? suggestion.cluster2.id : suggestion.cluster1.id;

    onMerge(targetId, sourceId);
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.95) return 'text-green-600 bg-green-50';
    if (similarity >= 0.90) return 'text-blue-600 bg-blue-50';
    return 'text-yellow-600 bg-yellow-50';
  };

  const totalBookmarks = suggestion.cluster1.bookmarkCount + suggestion.cluster2.bookmarkCount;

  return (
    <div className="bg-white border-2 border-blue-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <GitMerge className="w-5 h-5 text-blue-600" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm font-semibold text-blue-900">
                  Merge Suggestion
                </h4>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSimilarityColor(
                    suggestion.similarity
                  )}`}
                >
                  {Math.round(suggestion.similarity * 100)}% match
                </span>
              </div>
              <p className="text-sm text-gray-700">
                <span className="font-medium">{suggestion.cluster1.name}</span>
                <span className="text-gray-500 mx-2">+</span>
                <span className="font-medium">{suggestion.cluster2.name}</span>
              </p>
            </div>

            <button
              onClick={() => onDismiss(suggestion)}
              className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
              title="Dismiss suggestion"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Reason */}
          <div className="flex items-start gap-2 mb-3 p-2 bg-blue-50 rounded text-xs text-gray-700">
            <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p>{suggestion.reason}</p>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-gray-600 mb-3">
            <span>
              {suggestion.cluster1.bookmarkCount} + {suggestion.cluster2.bookmarkCount} ={' '}
              <strong>{totalBookmarks} bookmarks</strong>
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleMerge}
              disabled={isMerging}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <GitMerge className={`w-4 h-4 ${isMerging ? 'animate-pulse' : ''}`} />
              {isMerging ? 'Merging...' : 'Merge Clusters'}
            </button>

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              {isExpanded ? 'Less info' : 'More info'}
            </button>
          </div>

          {/* Expanded details */}
          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-gray-100 text-xs space-y-2">
              <div>
                <span className="font-medium text-gray-700">Merge direction:</span>{' '}
                <span className="text-gray-600">
                  {suggestion.cluster1.bookmarkCount >= suggestion.cluster2.bookmarkCount
                    ? `"${suggestion.cluster2.name}" will be merged into "${suggestion.cluster1.name}"`
                    : `"${suggestion.cluster1.name}" will be merged into "${suggestion.cluster2.name}"`}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Result:</span>{' '}
                <span className="text-gray-600">
                  The smaller cluster will be deleted, and all its bookmarks will be reassigned.
                  The larger cluster will be kept and updated.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
