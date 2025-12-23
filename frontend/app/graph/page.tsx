'use client';

import { GraphCanvas } from '@/components/graph/GraphView/GraphCanvas';
import { ClusterView } from '@/components/graph/ClusterView/ClusterView';
import { InsightsView } from '@/components/graph/InsightsView/InsightsView';
import { DiscoveryMode } from '@/components/graph/DiscoveryMode/DiscoveryMode';
import { useGraphStore } from '@/store/graphStore';

type ViewMode = 'graph' | 'clusters' | 'insights' | 'discovery';

const VIEW_TABS: { id: ViewMode; label: string; description: string }[] = [
  { id: 'graph', label: 'Graph', description: 'Network visualization' },
  { id: 'clusters', label: 'Clusters', description: 'Topic groups' },
  { id: 'insights', label: 'Insights', description: 'Trends & patterns' },
  { id: 'discovery', label: 'Discovery', description: 'Explore connections' },
];

export default function GraphPage() {
  const { filters, setFilter } = useGraphStore();
  const currentView = filters.view;

  return (
    <div className="h-screen w-full bg-white">
      <div className="border-b border-gray-200">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-semibold text-black">Knowledge Graph</h1>
          <p className="text-sm text-gray-600 mt-1">
            Explore connections between your bookmarks
          </p>
        </div>

        {/* View Mode Tabs */}
        <div className="px-6 flex gap-1">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter('view', tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                currentView === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900 border-b-2 border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* View Content */}
      <div className="h-[calc(100vh-140px)]">
        {currentView === 'graph' && <GraphCanvas />}
        {currentView === 'clusters' && <ClusterView />}
        {currentView === 'insights' && <InsightsView />}
        {currentView === 'discovery' && <DiscoveryMode />}
      </div>
    </div>
  );
}
