'use client';

import { TrendingUp, AlertCircle, Sparkles, Lightbulb } from 'lucide-react';
import { InsightCard } from './InsightCard';
import { TrendChart } from './TrendChart';

// Synthetic insights data - will be replaced with API data later
const syntheticInsights = {
  trends: [
    {
      id: '1',
      title: 'Frontend Development Trending',
      description: 'You\'ve saved 6 React-related bookmarks this week, up from 2/week average',
      type: 'trending_topic' as const,
      confidence: 0.85,
      metadata: {
        topic: 'React',
        currentCount: 6,
        previousAverage: 2,
        trend: 'up',
      },
    },
    {
      id: '2',
      title: 'Growing Interest in AI',
      description: 'AI and embeddings content increased 200% in the last month',
      type: 'trending_topic' as const,
      confidence: 0.92,
      metadata: {
        topic: 'Artificial Intelligence',
        growth: 200,
        period: 'last month',
      },
    },
  ],
  gaps: [
    {
      id: '3',
      title: 'Missing: Testing & QA',
      description: 'You have many development bookmarks but none about testing or quality assurance',
      type: 'knowledge_gap' as const,
      confidence: 0.78,
      metadata: {
        relatedTopics: ['React', 'TypeScript', 'Node.js'],
        suggestedTopics: ['Jest', 'Testing Library', 'Cypress'],
      },
    },
    {
      id: '4',
      title: 'DevOps Gap',
      description: 'Strong backend knowledge but limited DevOps and deployment content',
      type: 'knowledge_gap' as const,
      confidence: 0.81,
      metadata: {
        relatedTopics: ['Docker', 'PostgreSQL'],
        suggestedTopics: ['Kubernetes', 'CI/CD', 'GitHub Actions'],
      },
    },
  ],
  connections: [
    {
      id: '5',
      title: 'Performance Optimization Pattern',
      description: 'Your React, PostgreSQL, and Redis bookmarks all discuss performance optimization',
      type: 'surprising_connection' as const,
      confidence: 0.88,
      metadata: {
        connectedTopics: ['React', 'PostgreSQL', 'Redis'],
        theme: 'Performance Optimization',
      },
    },
  ],
  recommendations: [
    {
      id: '6',
      title: 'Explore Next.js Advanced Patterns',
      description: 'Based on your React expertise, you might enjoy advanced Next.js topics',
      type: 'recommendation' as const,
      confidence: 0.76,
      metadata: {
        basedOn: ['React', 'TypeScript'],
        suggested: 'Next.js Server Components',
      },
    },
    {
      id: '7',
      title: 'Vector Database Deep Dive',
      description: 'Your interest in AI embeddings suggests exploring specialized vector databases',
      type: 'recommendation' as const,
      confidence: 0.83,
      metadata: {
        basedOn: ['Vector Embeddings', 'PostgreSQL'],
        suggested: 'Pinecone, Weaviate, Qdrant',
      },
    },
  ],
};

// Sample data for trend chart
const trendData = [
  { week: 'Week 1', React: 2, AI: 0, Backend: 3 },
  { week: 'Week 2', React: 3, AI: 1, Backend: 2 },
  { week: 'Week 3', React: 4, AI: 2, Backend: 4 },
  { week: 'Week 4', React: 6, AI: 4, Backend: 3 },
];

export function InsightsView() {
  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-black">Knowledge Insights</h2>
          <p className="text-sm text-gray-600 mt-1">
            Discover patterns, trends, and opportunities in your bookmarks
          </p>
        </div>

        {/* Trending Topics Section */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-semibold text-black">Trending Topics</h3>
          </div>

          {/* Trend Chart */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <h4 className="text-sm font-medium text-black mb-3">Weekly Activity</h4>
            <TrendChart data={trendData} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {syntheticInsights.trends.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </section>

        {/* Knowledge Gaps Section */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-orange-600" />
            <h3 className="text-base font-semibold text-black">Knowledge Gaps</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {syntheticInsights.gaps.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </section>

        {/* Surprising Connections Section */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <h3 className="text-base font-semibold text-black">Surprising Connections</h3>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {syntheticInsights.connections.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </section>

        {/* Recommendations Section */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-5 h-5 text-green-600" />
            <h3 className="text-base font-semibold text-black">Recommendations</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {syntheticInsights.recommendations.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
