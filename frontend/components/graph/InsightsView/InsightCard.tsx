'use client';

import { TrendingUp, AlertCircle, Sparkles, Lightbulb, ChevronRight } from 'lucide-react';

type InsightType = 'trending_topic' | 'knowledge_gap' | 'surprising_connection' | 'recommendation';

interface Insight {
  id: string;
  title: string;
  description: string;
  type: InsightType;
  confidence: number;
  metadata?: any;
}

interface InsightCardProps {
  insight: Insight;
}

const insightConfig = {
  trending_topic: {
    icon: TrendingUp,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  knowledge_gap: {
    icon: AlertCircle,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
  },
  surprising_connection: {
    icon: Sparkles,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
  recommendation: {
    icon: Lightbulb,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
};

export function InsightCard({ insight }: InsightCardProps) {
  const config = insightConfig[insight.type];
  const Icon = config.icon;

  // Format confidence as percentage
  const confidencePercent = Math.round(insight.confidence * 100);
  const confidenceColor =
    confidencePercent >= 80 ? 'text-green-600' :
    confidencePercent >= 60 ? 'text-blue-600' :
    'text-gray-600';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 mt-1 p-2 rounded-lg ${config.bgColor}`}>
          <Icon className={`w-4 h-4 ${config.color}`} />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-black mb-1">{insight.title}</h4>
          <p className="text-xs text-gray-600 mb-3">{insight.description}</p>

          {/* Metadata display based on type */}
          {insight.metadata && (
            <div className="space-y-2">
              {insight.type === 'trending_topic' && insight.metadata.currentCount && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500">Current:</span>
                  <span className="font-medium text-black">
                    {insight.metadata.currentCount} bookmarks
                  </span>
                  {insight.metadata.previousAverage && (
                    <>
                      <span className="text-gray-400">vs</span>
                      <span className="text-gray-600">
                        {insight.metadata.previousAverage}/week avg
                      </span>
                    </>
                  )}
                </div>
              )}

              {insight.type === 'knowledge_gap' && insight.metadata.suggestedTopics && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-gray-500">Suggested:</span>
                  {insight.metadata.suggestedTopics.map((topic: string) => (
                    <span
                      key={topic}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              )}

              {insight.type === 'surprising_connection' && insight.metadata.connectedTopics && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-gray-500">Connected:</span>
                  {insight.metadata.connectedTopics.map((topic: string) => (
                    <span
                      key={topic}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              )}

              {insight.type === 'recommendation' && insight.metadata.suggested && (
                <div className="text-xs">
                  <span className="text-gray-500">Explore:</span>{' '}
                  <span className="font-medium text-black">{insight.metadata.suggested}</span>
                </div>
              )}
            </div>
          )}

          {/* Confidence Score */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className={`text-xs font-medium ${confidenceColor}`}>
              {confidencePercent}% confidence
            </span>
            <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
              Learn more
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
