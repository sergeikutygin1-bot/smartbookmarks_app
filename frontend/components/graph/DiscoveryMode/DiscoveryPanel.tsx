'use client';

import { FileText, Lightbulb, Building2, ExternalLink, ArrowRight } from 'lucide-react';

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

interface DiscoveryPanelProps {
  currentNode: PathNode;
  relatedItems: RelatedItem[];
  onItemClick: (item: RelatedItem) => void;
  isLoading: boolean;
}

const nodeIcons = {
  bookmark: FileText,
  concept: Lightbulb,
  entity: Building2,
};

const nodeColors = {
  bookmark: 'bg-blue-50 text-blue-600 border-blue-200',
  concept: 'bg-purple-50 text-purple-600 border-purple-200',
  entity: 'bg-green-50 text-green-600 border-green-200',
};

const relationshipLabels: Record<string, string> = {
  similar_to: 'Similar bookmark',
  mentions: 'Mentions',
  about: 'About this topic',
  related_to: 'Related concept',
};

export function DiscoveryPanel({
  currentNode,
  relatedItems,
  onItemClick,
  isLoading,
}: DiscoveryPanelProps) {
  const CurrentIcon = nodeIcons[currentNode.type];
  const currentColor = nodeColors[currentNode.type];

  // Group items by type
  const bookmarks = relatedItems.filter((item) => item.type === 'bookmark');
  const concepts = relatedItems.filter((item) => item.type === 'concept');
  const entities = relatedItems.filter((item) => item.type === 'entity');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Current Node - Large Focus */}
      <div className="mb-8">
        <div className="text-center">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full border-2 ${currentColor} mb-4`}>
            <CurrentIcon className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-semibold text-black mb-2">
            {currentNode.name}
          </h2>
          <p className="text-sm text-gray-500 capitalize">
            {currentNode.type}
          </p>
        </div>
      </div>

      {/* Related Items */}
      {isLoading ? (
        <div className="text-center text-gray-500">Loading connections...</div>
      ) : relatedItems.length === 0 ? (
        <div className="text-center text-gray-500">
          No connections found for this item
        </div>
      ) : (
        <div className="space-y-6">
          <div className="text-center mb-6">
            <h3 className="text-lg font-semibold text-black">
              Explore {relatedItems.length} {relatedItems.length === 1 ? 'Connection' : 'Connections'}
            </h3>
          </div>

          {/* Bookmarks Section */}
          {bookmarks.length > 0 && (
            <section>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Related Bookmarks ({bookmarks.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {bookmarks.map((item) => (
                  <RelatedItemCard
                    key={item.id}
                    item={item}
                    onClick={() => onItemClick(item)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Concepts Section */}
          {concepts.length > 0 && (
            <section>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-purple-600" />
                Related Concepts ({concepts.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {concepts.map((item) => (
                  <RelatedItemCard
                    key={item.id}
                    item={item}
                    onClick={() => onItemClick(item)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Entities Section */}
          {entities.length > 0 && (
            <section>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-green-600" />
                Related Entities ({entities.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {entities.map((item) => (
                  <RelatedItemCard
                    key={item.id}
                    item={item}
                    onClick={() => onItemClick(item)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function RelatedItemCard({
  item,
  onClick,
}: {
  item: RelatedItem;
  onClick: () => void;
}) {
  const Icon = nodeIcons[item.type];
  const color = nodeColors[item.type];
  const relationLabel = relationshipLabels[item.relationshipType] || item.relationshipType;
  const strengthPercent = Math.round(item.weight * 100);

  return (
    <button
      onClick={onClick}
      className="w-full bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 transition-all text-left group"
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 p-2 rounded-lg border ${color}`}>
          <Icon className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h5 className="text-sm font-medium text-black truncate">{item.name}</h5>
            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 flex-shrink-0 transition-colors" />
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="capitalize">{relationLabel}</span>
            <span className="text-gray-400">•</span>
            <span className="text-gray-600 font-medium">{strengthPercent}% strength</span>
          </div>
        </div>
      </div>
    </button>
  );
}
