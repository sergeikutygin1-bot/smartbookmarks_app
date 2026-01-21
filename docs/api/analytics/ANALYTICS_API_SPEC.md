# Smart Bookmarks Analytics API Specification

## Overview

This document defines the REST API endpoints for the analytics framework. All endpoints require authentication and implement row-level security (user_id isolation).

**Base URL:** `/api/v1/analytics`

**Authentication:** JWT Bearer token required for all endpoints

**Rate Limiting:** 60 requests/minute per user

---

## Endpoint Summary

| Endpoint | Method | Purpose | Cache TTL |
|----------|--------|---------|-----------|
| `/summary` | GET | High-level stats dashboard | 5 min |
| `/streaks/current` | GET | Current and longest streak | 1 min |
| `/patterns/saving` | GET | Save time heatmap data | 30 min |
| `/patterns/behavior` | GET | User behavior classification | 1 hour |
| `/graph/metrics` | GET | Knowledge graph health metrics | 10 min |
| `/insights` | GET | Personalized insight feed | 5 min |
| `/trends/bookmarks` | GET | Bookmark creation trend | 10 min |
| `/distributions/content-types` | GET | Content type breakdown | 30 min |
| `/distributions/topics` | GET | Top concepts and entities | 30 min |
| `/recommendations/gaps` | GET | Knowledge gap suggestions | 1 hour |
| `/recommendations/stale` | GET | Stale content for cleanup | 6 hours |
| `/benchmarks/cohort` | GET | Anonymized cohort comparison | 1 day |
| `/milestones` | GET | Achievements and badges | 1 hour |
| `/export` | POST | Generate analytics export | N/A |

---

## 1. Summary Dashboard

### GET `/api/v1/analytics/summary`

**Purpose:** Primary dashboard data for profile page hero section.

**Response:**

```json
{
  "summary": {
    "bookmarks": {
      "total": 487,
      "weekOverWeek": {
        "current": 12,
        "previous": 9,
        "percentChange": 33.3,
        "trend": "up"
      },
      "monthOverMonth": {
        "current": 45,
        "previous": 38,
        "percentChange": 18.4,
        "trend": "up"
      }
    },
    "knowledgeGraph": {
      "entities": 127,
      "concepts": 42,
      "relationships": 1247,
      "density": 0.68,
      "avgNodeDegree": 5.2
    },
    "streak": {
      "current": 42,
      "longest": 42,
      "isRecord": true,
      "nextMilestone": {
        "days": 100,
        "daysRemaining": 58,
        "progress": 0.42
      }
    },
    "lastUpdated": "2026-01-19T10:30:00Z"
  }
}
```

**Cache Strategy:** Redis 5-minute TTL, invalidate on bookmark CRUD

---

## 2. Streak Tracking

### GET `/api/v1/analytics/streaks/current`

**Purpose:** Detailed streak information for gamification.

**Response:**

```json
{
  "streak": {
    "current": {
      "days": 42,
      "startDate": "2025-12-08",
      "endDate": "2026-01-19"
    },
    "longest": {
      "days": 42,
      "startDate": "2025-12-08",
      "endDate": "2026-01-19"
    },
    "history": [
      {
        "days": 21,
        "startDate": "2025-11-01",
        "endDate": "2025-11-21"
      },
      {
        "days": 7,
        "startDate": "2025-10-15",
        "endDate": "2025-10-21"
      }
    ],
    "milestones": [
      {
        "days": 7,
        "unlocked": true,
        "unlockedAt": "2025-12-14T09:15:00Z",
        "badgeId": "streak-7-days"
      },
      {
        "days": 30,
        "unlocked": true,
        "unlockedAt": "2026-01-06T14:22:00Z",
        "badgeId": "streak-30-days"
      },
      {
        "days": 100,
        "unlocked": false,
        "unlockedAt": null,
        "badgeId": "streak-100-days"
      }
    ],
    "freezesRemaining": 2,
    "freezesUsed": 0
  }
}
```

**Implementation Notes:**
- Grace period: 1 missed day = 1 freeze consumed (max 2 per month)
- Weekend mode: Optional setting to exclude Sat/Sun from counting
- Retroactive calculation: Compute historical streaks on first request

---

## 3. Saving Pattern Heatmap

### GET `/api/v1/analytics/patterns/saving?days=90`

**Purpose:** Visualize when user saves content (day of week × hour).

**Query Parameters:**
- `days` (optional): Lookback period (default: 90, max: 365)

**Response:**

```json
{
  "heatmap": {
    "data": [
      {
        "dayOfWeek": 0,
        "hour": 14,
        "count": 5,
        "percentage": 2.1,
        "sampleTitles": [
          "Understanding Neural Networks",
          "React 19 Features",
          "Sustainable Architecture"
        ]
      },
      {
        "dayOfWeek": 2,
        "hour": 20,
        "count": 12,
        "percentage": 5.0,
        "sampleTitles": [
          "GraphQL Best Practices",
          "Climate Tech Innovations"
        ]
      }
    ],
    "summary": {
      "peakDay": "Tuesday",
      "peakHour": 20,
      "mostActiveWindow": "Tuesday 8pm-9pm",
      "totalSaves": 240,
      "periodDays": 90
    }
  }
}
```

**SQL Query:** See ANALYTICS_FRAMEWORK.md Section 11, Query #3

**Visualization:** 7×24 grid heatmap (GitHub contribution style)

---

## 4. Behavior Classification

### GET `/api/v1/analytics/patterns/behavior`

**Purpose:** Identify user's learning and saving patterns.

**Response:**

```json
{
  "classification": {
    "readingStyle": {
      "type": "Deep Diver",
      "confidence": 0.85,
      "description": "You prefer in-depth, long-form content",
      "metrics": {
        "longFormPercentage": 72.5,
        "quickReadPercentage": 15.3,
        "avgWordCount": 3200
      }
    },
    "savingStyle": {
      "type": "Batch Saver",
      "confidence": 0.78,
      "description": "You often save multiple items in short bursts",
      "metrics": {
        "avgSaveInterval": 2400,
        "batchSessions": 18,
        "avgBatchSize": 4.2
      }
    },
    "topicStyle": {
      "type": "Cross-Pollinator",
      "confidence": 0.91,
      "description": "You connect diverse topics and ideas",
      "metrics": {
        "domainDiversity": 0.82,
        "topicBridges": 12,
        "clusterCount": 8
      }
    },
    "consistencyStyle": {
      "type": "Steady Learner",
      "confidence": 0.88,
      "description": "You maintain consistent learning habits",
      "metrics": {
        "savesStdDev": 2.3,
        "weeksCovered": 47,
        "avgWeeklySaves": 9.2
      }
    }
  }
}
```

**Classification Types:**

**Reading Style:**
- Deep Diver: 60%+ long-form (>2000 words)
- Quick Scanner: 60%+ quick reads (<500 words)
- Balanced Reader: Mix of both

**Saving Style:**
- Batch Saver: Save interval std dev < 1 hour
- Steady Collector: Save interval std dev > 1 hour

**Topic Style:**
- Cross-Pollinator: Domain diversity > 0.7, 5+ topic bridges
- Specialist: Domain diversity < 0.3, deep concept coverage
- Explorer: Domain diversity > 0.7, shallow concept coverage

---

## 5. Knowledge Graph Metrics

### GET `/api/v1/analytics/graph/metrics`

**Purpose:** Health and growth metrics for knowledge graph.

**Response:**

```json
{
  "graph": {
    "overview": {
      "nodes": {
        "bookmarks": 487,
        "concepts": 42,
        "entities": 127,
        "total": 656
      },
      "edges": {
        "similarTo": 892,
        "about": 614,
        "mentions": 1023,
        "total": 2529
      },
      "density": 0.68,
      "avgDegree": 5.2
    },
    "centrality": {
      "topBookmarks": [
        {
          "id": "uuid-1",
          "title": "Introduction to Machine Learning",
          "score": 0.94,
          "connections": 23
        },
        {
          "id": "uuid-2",
          "title": "GraphQL Schema Design",
          "score": 0.87,
          "connections": 19
        }
      ],
      "topConcepts": [
        {
          "id": "concept-1",
          "name": "Machine Learning",
          "occurrences": 87,
          "connections": 156
        }
      ]
    },
    "clusters": {
      "total": 8,
      "avgCoherence": 0.73,
      "avgSize": 12.4,
      "topClusters": [
        {
          "id": "cluster-1",
          "name": "Web Development",
          "size": 42,
          "coherence": 0.81
        }
      ]
    },
    "growth": {
      "weekOverWeek": {
        "nodes": 15,
        "edges": 87,
        "percentChange": 5.2
      },
      "monthOverMonth": {
        "nodes": 52,
        "edges": 342,
        "percentChange": 18.7
      }
    },
    "health": {
      "orphanedBookmarks": 12,
      "weakConnections": 34,
      "isolatedClusters": 1,
      "overallScore": 0.78
    }
  }
}
```

**Health Score Calculation:**

```
health_score = (
  (1 - orphaned_ratio) × 0.4 +
  graph_density × 0.3 +
  avg_coherence × 0.2 +
  (1 - isolated_cluster_ratio) × 0.1
)
```

---

## 6. Personalized Insights Feed

### GET `/api/v1/analytics/insights?limit=10&types=milestone,gap,pattern`

**Purpose:** Contextual, actionable insights prioritized by relevance.

**Query Parameters:**
- `limit` (optional): Max insights to return (default: 10, max: 50)
- `types` (optional): Comma-separated types to filter (default: all)
- `dismissed` (optional): Include dismissed insights (default: false)

**Insight Types:**
- `milestone`: Achievements unlocked
- `gap`: Knowledge gaps to fill
- `pattern`: Behavioral patterns detected
- `stale`: Content needing cleanup
- `connection`: Surprising relationships
- `trend`: Usage changes

**Response:**

```json
{
  "insights": [
    {
      "id": "insight-1",
      "type": "milestone",
      "priority": 0.95,
      "title": "42-Day Streak! Your Longest Ever",
      "description": "You've maintained a saving habit for 42 consecutive days. This is your personal record!",
      "actionable": false,
      "metadata": {
        "streakDays": 42,
        "nextMilestone": 100,
        "badgeUnlocked": "streak-42-days"
      },
      "createdAt": "2026-01-19T10:00:00Z",
      "expiresAt": "2026-01-20T10:00:00Z"
    },
    {
      "id": "insight-2",
      "type": "gap",
      "priority": 0.72,
      "title": "Deepen Your TypeScript Knowledge",
      "description": "You have 2 bookmarks about TypeScript but 18 about JavaScript. Consider exploring TypeScript further.",
      "actionable": true,
      "actions": [
        {
          "label": "Find TypeScript Resources",
          "url": "/search?q=typescript",
          "type": "navigate"
        },
        {
          "label": "Dismiss",
          "type": "dismiss"
        }
      ],
      "metadata": {
        "concept": "TypeScript",
        "currentCount": 2,
        "relatedConcept": "JavaScript",
        "relatedCount": 18
      },
      "createdAt": "2026-01-19T09:30:00Z",
      "expiresAt": "2026-01-26T09:30:00Z"
    },
    {
      "id": "insight-3",
      "type": "connection",
      "priority": 0.68,
      "title": "Surprising Connection Detected",
      "description": "Your bookmark 'Climate Tech Innovations' bridges Machine Learning, Energy, and Policy topics.",
      "actionable": true,
      "actions": [
        {
          "label": "View in Graph",
          "url": "/graph?focus=uuid-bookmark-3",
          "type": "navigate"
        }
      ],
      "metadata": {
        "bookmarkId": "uuid-bookmark-3",
        "bookmarkTitle": "Climate Tech Innovations",
        "clustersConnected": ["Machine Learning", "Energy", "Policy"],
        "centralityScore": 0.89
      },
      "createdAt": "2026-01-18T14:20:00Z",
      "expiresAt": "2026-01-25T14:20:00Z"
    }
  ],
  "pagination": {
    "total": 24,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  }
}
```

**Priority Scoring:** See ANALYTICS_FRAMEWORK.md Section 6.3

---

## 7. Bookmark Trend Chart

### GET `/api/v1/analytics/trends/bookmarks?period=30d&comparison=true`

**Purpose:** Time-series data for bookmark creation trends.

**Query Parameters:**
- `period` (optional): `7d`, `30d`, `90d`, `1y`, `all` (default: `30d`)
- `comparison` (optional): Include previous period for comparison (default: false)
- `granularity` (optional): `day`, `week`, `month` (auto-detected based on period)

**Response:**

```json
{
  "trend": {
    "current": [
      {
        "date": "2026-01-01",
        "count": 3,
        "cumulative": 442
      },
      {
        "date": "2026-01-02",
        "count": 2,
        "cumulative": 444
      }
    ],
    "comparison": [
      {
        "date": "2025-12-01",
        "count": 2,
        "cumulative": 397
      },
      {
        "date": "2025-12-02",
        "count": 1,
        "cumulative": 398
      }
    ],
    "summary": {
      "currentPeriod": {
        "total": 45,
        "avg": 1.5,
        "max": 7,
        "min": 0
      },
      "comparisonPeriod": {
        "total": 38,
        "avg": 1.3,
        "max": 5,
        "min": 0
      },
      "percentChange": 18.4
    },
    "granularity": "day",
    "period": "30d"
  }
}
```

**Auto-Granularity Logic:**
- `7d`: Daily
- `30d`: Daily
- `90d`: Weekly
- `1y`: Monthly
- `all`: Adaptive (monthly if >2 years, weekly if >6 months, daily otherwise)

---

## 8. Content Type Distribution

### GET `/api/v1/analytics/distributions/content-types`

**Purpose:** Breakdown of saved content by type.

**Response:**

```json
{
  "distribution": {
    "types": [
      {
        "type": "article",
        "count": 342,
        "percentage": 70.2,
        "avgWordCount": 1850,
        "color": "#3B82F6"
      },
      {
        "type": "video",
        "count": 87,
        "percentage": 17.9,
        "avgDuration": 720,
        "color": "#EF4444"
      },
      {
        "type": "social",
        "count": 35,
        "percentage": 7.2,
        "avgWordCount": 280,
        "color": "#8B5CF6"
      },
      {
        "type": "pdf",
        "count": 18,
        "percentage": 3.7,
        "avgWordCount": 4200,
        "color": "#10B981"
      },
      {
        "type": "other",
        "count": 5,
        "percentage": 1.0,
        "color": "#6B7280"
      }
    ],
    "total": 487,
    "diversityScore": 0.42
  }
}
```

**Diversity Score:** Shannon entropy normalized to 0-1 scale

```
diversity = -Σ(p_i * log(p_i)) / log(n)
where p_i = proportion of type i, n = number of types
```

---

## 9. Topic Distribution

### GET `/api/v1/analytics/distributions/topics?limit=20&type=concepts`

**Purpose:** Top concepts and entities by occurrence.

**Query Parameters:**
- `limit` (optional): Max items to return (default: 20, max: 100)
- `type` (optional): `concepts`, `entities`, `both` (default: `both`)
- `minOccurrences` (optional): Filter by minimum occurrence count (default: 1)

**Response:**

```json
{
  "topics": {
    "concepts": [
      {
        "id": "concept-1",
        "name": "Machine Learning",
        "occurrences": 87,
        "bookmarkCount": 42,
        "firstSeen": "2025-03-15T10:22:00Z",
        "lastSeen": "2026-01-18T16:45:00Z",
        "trend": "up",
        "percentageOfTotal": 18.3
      },
      {
        "id": "concept-2",
        "name": "Web Development",
        "occurrences": 64,
        "bookmarkCount": 38,
        "firstSeen": "2025-02-10T09:15:00Z",
        "lastSeen": "2026-01-17T14:30:00Z",
        "trend": "stable",
        "percentageOfTotal": 13.5
      }
    ],
    "entities": [
      {
        "id": "entity-1",
        "name": "OpenAI",
        "type": "company",
        "occurrences": 23,
        "bookmarkCount": 15,
        "firstSeen": "2025-04-12T11:00:00Z",
        "lastSeen": "2026-01-16T12:20:00Z",
        "trend": "up",
        "percentageOfTotal": 4.8
      },
      {
        "id": "entity-2",
        "name": "React",
        "type": "technology",
        "occurrences": 45,
        "bookmarkCount": 28,
        "firstSeen": "2025-02-20T13:45:00Z",
        "lastSeen": "2026-01-15T10:10:00Z",
        "trend": "stable",
        "percentageOfTotal": 9.5
      }
    ]
  },
  "summary": {
    "totalConcepts": 42,
    "totalEntities": 127,
    "avgConceptOccurrence": 11.2,
    "avgEntityOccurrence": 3.8
  }
}
```

**Trend Detection:**
- `up`: Last 7d occurrences > previous 7d average
- `down`: Last 7d occurrences < previous 7d average
- `stable`: Within 20% of previous 7d average
- `new`: First seen in last 14 days

---

## 10. Knowledge Gap Recommendations

### GET `/api/v1/analytics/recommendations/gaps?limit=10`

**Purpose:** Suggest topics for deeper exploration.

**Response:**

```json
{
  "gaps": [
    {
      "id": "gap-1",
      "type": "shallow_coverage",
      "concept": {
        "id": "concept-5",
        "name": "TypeScript",
        "currentBookmarks": 2,
        "occurrences": 5
      },
      "recommendation": {
        "title": "Deepen Your TypeScript Knowledge",
        "description": "You have 2 bookmarks about TypeScript but it's mentioned 5 times across your library. Consider exploring further.",
        "suggestedBookmarkCount": 5,
        "priority": 0.78
      },
      "relatedConcepts": [
        {
          "name": "JavaScript",
          "bookmarkCount": 18,
          "relationship": "parent"
        },
        {
          "name": "Type Systems",
          "bookmarkCount": 3,
          "relationship": "sibling"
        }
      ]
    },
    {
      "id": "gap-2",
      "type": "missing_subconcept",
      "concept": {
        "id": "concept-8",
        "name": "React Hooks",
        "currentBookmarks": 0,
        "parentConcept": "React"
      },
      "recommendation": {
        "title": "Learn About React Hooks",
        "description": "You have 28 bookmarks about React but none specifically about Hooks, a fundamental feature.",
        "suggestedBookmarkCount": 3,
        "priority": 0.85
      },
      "relatedConcepts": [
        {
          "name": "React",
          "bookmarkCount": 28,
          "relationship": "parent"
        }
      ]
    },
    {
      "id": "gap-3",
      "type": "perspective_diversity",
      "concept": {
        "id": "concept-12",
        "name": "Climate Change",
        "currentBookmarks": 8,
        "occurrences": 15
      },
      "recommendation": {
        "title": "Diversify Climate Change Perspectives",
        "description": "All your climate change bookmarks are from tech blogs. Consider exploring policy, science, or economics perspectives.",
        "suggestedBookmarkCount": 3,
        "priority": 0.62
      },
      "sourceDiversity": {
        "dominantDomain": "techcrunch.com",
        "percentage": 75.0,
        "uniqueDomains": 2
      }
    }
  ],
  "summary": {
    "totalGaps": 18,
    "byType": {
      "shallow_coverage": 7,
      "missing_subconcept": 5,
      "perspective_diversity": 4,
      "incomplete_entity": 2
    }
  }
}
```

---

## 11. Stale Content Recommendations

### GET `/api/v1/analytics/recommendations/stale?limit=20`

**Purpose:** Identify bookmarks that may need archiving or updating.

**Response:**

```json
{
  "staleContent": [
    {
      "id": "stale-1",
      "bookmark": {
        "id": "uuid-bookmark-42",
        "title": "Introduction to AngularJS",
        "url": "https://example.com/angularjs",
        "createdAt": "2023-05-10T14:20:00Z",
        "ageDays": 619
      },
      "reason": "orphaned",
      "description": "No connections to other bookmarks despite being saved 619 days ago",
      "recommendation": "Archive or delete if no longer relevant",
      "severity": "medium",
      "metadata": {
        "connectionCount": 0,
        "lastViewed": null,
        "relatedTopics": []
      }
    },
    {
      "id": "stale-2",
      "bookmark": {
        "id": "uuid-bookmark-87",
        "title": "React 16 New Features",
        "url": "https://example.com/react-16",
        "createdAt": "2024-08-15T09:30:00Z",
        "ageDays": 157
      },
      "reason": "outdated_topic",
      "description": "About React 16, but you now have 12 bookmarks about React 18+",
      "recommendation": "Archive and save updated content",
      "severity": "low",
      "metadata": {
        "connectionCount": 3,
        "supersededBy": ["React 18 Features", "React 19 Roadmap"],
        "relatedConcept": "React"
      }
    },
    {
      "id": "stale-3",
      "bookmark": {
        "id": "uuid-bookmark-103",
        "title": "Machine Learning Basics",
        "url": "https://example.com/duplicate-ml",
        "createdAt": "2025-11-22T16:45:00Z",
        "ageDays": 58
      },
      "reason": "duplicate",
      "description": "95% similar to 'Introduction to Machine Learning' (saved earlier)",
      "recommendation": "Remove duplicate",
      "severity": "high",
      "metadata": {
        "similarityScore": 0.95,
        "duplicateOf": {
          "id": "uuid-bookmark-1",
          "title": "Introduction to Machine Learning",
          "createdAt": "2025-03-10T10:15:00Z"
        }
      }
    }
  ],
  "summary": {
    "totalStale": 24,
    "byReason": {
      "orphaned": 12,
      "outdated_topic": 7,
      "duplicate": 3,
      "broken_link": 2
    },
    "bySeverity": {
      "high": 5,
      "medium": 12,
      "low": 7
    }
  }
}
```

**Staleness Criteria:**

| Reason | Detection Logic | Severity |
|--------|----------------|----------|
| `orphaned` | No relationships + age > 90 days | Medium |
| `outdated_topic` | Concept version superseded | Low |
| `duplicate` | Embedding similarity > 0.90 | High |
| `broken_link` | HTTP status 404/410 (future) | High |
| `low_relevance` | Not in top 20 concepts | Low |

---

## 12. Cohort Benchmarking

### GET `/api/v1/analytics/benchmarks/cohort?metric=saves_per_week`

**Purpose:** Anonymized comparison to similar users.

**Query Parameters:**
- `metric` (optional): `saves_per_week`, `graph_density`, `streak_length`, `topic_diversity` (default: `saves_per_week`)

**Response:**

```json
{
  "benchmark": {
    "metric": "saves_per_week",
    "user": {
      "value": 9.2,
      "percentile": 68,
      "rank": "Above Average"
    },
    "cohort": {
      "definition": "Users who joined in Q4 2025",
      "size": 1247,
      "distribution": {
        "p10": 2.1,
        "p25": 4.3,
        "p50": 6.8,
        "p75": 10.5,
        "p90": 15.2,
        "mean": 7.4,
        "stdDev": 4.1
      }
    },
    "interpretation": {
      "message": "You save more than 68% of users who joined around the same time",
      "encouragement": "Great consistency! You're building a solid knowledge library.",
      "nextTier": {
        "percentile": 75,
        "value": 10.5,
        "gap": 1.3
      }
    }
  }
}
```

**Privacy Protection:**
- Minimum 100 users in cohort (return generic message if smaller)
- No individual user data exposed
- Percentiles rounded to nearest 5%
- Opt-out respected (user setting)

**Cohort Definitions:**
- **Join Date Cohort:** Users who signed up in same quarter
- **Usage Cohort:** Users with similar activity levels
- **Topic Cohort:** Users with similar primary interests (future)

---

## 13. Milestones & Achievements

### GET `/api/v1/analytics/milestones`

**Purpose:** Track badges, achievements, and unlockable rewards.

**Response:**

```json
{
  "milestones": {
    "unlocked": [
      {
        "id": "badge-first-save",
        "category": "getting_started",
        "title": "First Save",
        "description": "Saved your first bookmark",
        "icon": "bookmark",
        "rarity": "common",
        "unlockedAt": "2025-02-08T09:12:00Z",
        "shareUrl": "https://smartbookmarks.app/share/badge/first-save"
      },
      {
        "id": "badge-100-bookmarks",
        "category": "volume",
        "title": "Century Club",
        "description": "Saved 100 bookmarks",
        "icon": "trophy",
        "rarity": "uncommon",
        "unlockedAt": "2025-08-22T14:35:00Z",
        "shareUrl": "https://smartbookmarks.app/share/badge/100-bookmarks"
      },
      {
        "id": "badge-42-day-streak",
        "category": "consistency",
        "title": "Dedication Master",
        "description": "Maintained a 42-day saving streak",
        "icon": "flame",
        "rarity": "rare",
        "unlockedAt": "2026-01-19T10:00:00Z",
        "shareUrl": "https://smartbookmarks.app/share/badge/42-day-streak"
      }
    ],
    "inProgress": [
      {
        "id": "badge-500-bookmarks",
        "category": "volume",
        "title": "Knowledge Vault",
        "description": "Save 500 bookmarks",
        "icon": "vault",
        "rarity": "rare",
        "progress": {
          "current": 487,
          "target": 500,
          "percentage": 97.4
        },
        "estimatedUnlock": "2026-01-26T00:00:00Z"
      },
      {
        "id": "badge-100-day-streak",
        "category": "consistency",
        "title": "Centurion",
        "description": "Maintain a 100-day saving streak",
        "icon": "flame-gold",
        "rarity": "epic",
        "progress": {
          "current": 42,
          "target": 100,
          "percentage": 42.0
        },
        "estimatedUnlock": "2026-03-28T00:00:00Z"
      }
    ],
    "locked": [
      {
        "id": "badge-1000-bookmarks",
        "category": "volume",
        "title": "Grand Library",
        "description": "Save 1000 bookmarks",
        "icon": "library",
        "rarity": "legendary",
        "hint": "Keep saving! You're at 48.7%"
      }
    ]
  },
  "stats": {
    "totalBadges": 42,
    "unlockedCount": 12,
    "inProgressCount": 8,
    "lockedCount": 22,
    "rarityBreakdown": {
      "common": 3,
      "uncommon": 5,
      "rare": 3,
      "epic": 1,
      "legendary": 0
    }
  }
}
```

**Badge Categories:**
- `getting_started`: Onboarding milestones
- `volume`: Total bookmarks saved
- `consistency`: Streaks and regular usage
- `expertise`: Deep topic knowledge
- `discovery`: Topic diversity
- `social`: Sharing and collaboration (future)
- `special`: Limited-time events

**Rarity Tiers:**
- `common`: 80%+ of users unlock
- `uncommon`: 50-80% unlock
- `rare`: 20-50% unlock
- `epic`: 5-20% unlock
- `legendary`: <5% unlock

---

## 14. Analytics Export

### POST `/api/v1/analytics/export`

**Purpose:** Generate downloadable analytics reports.

**Request Body:**

```json
{
  "format": "pdf",
  "period": "1y",
  "sections": [
    "summary",
    "trends",
    "graph_metrics",
    "top_topics",
    "milestones"
  ],
  "options": {
    "includeBenchmarks": false,
    "includeRawData": true,
    "anonymize": false
  }
}
```

**Parameters:**
- `format`: `json`, `csv`, `pdf` (default: `json`)
- `period`: `7d`, `30d`, `90d`, `1y`, `all` (default: `all`)
- `sections`: Array of sections to include
- `options`: Export customization

**Response:**

```json
{
  "export": {
    "id": "export-uuid-123",
    "status": "processing",
    "estimatedCompletionTime": "2026-01-19T10:35:00Z",
    "downloadUrl": null,
    "expiresAt": null
  }
}
```

**After Processing (webhook or polling):**

```json
{
  "export": {
    "id": "export-uuid-123",
    "status": "completed",
    "downloadUrl": "https://smartbookmarks.app/api/v1/exports/export-uuid-123/download",
    "expiresAt": "2026-01-26T10:32:00Z",
    "fileSize": 2457600,
    "format": "pdf"
  }
}
```

**Export Formats:**

**JSON:**
```json
{
  "user": {
    "id": "user-uuid",
    "exportDate": "2026-01-19T10:32:00Z"
  },
  "period": {
    "start": "2025-01-19T00:00:00Z",
    "end": "2026-01-19T23:59:59Z"
  },
  "summary": { /* full summary object */ },
  "trends": { /* full trend data */ },
  "rawData": {
    "bookmarks": [ /* all bookmarks with metadata */ ],
    "concepts": [ /* all concepts */ ],
    "entities": [ /* all entities */ ]
  }
}
```

**CSV:** Separate files for each section (zipped)
- `summary.csv`
- `bookmark_trend.csv`
- `content_types.csv`
- `top_concepts.csv`
- `top_entities.csv`
- `milestones.csv`

**PDF:** Formatted report with:
- Cover page with logo and date range
- Executive summary (1 page)
- Charts and visualizations (3-5 pages)
- Detailed tables (2-3 pages)
- Appendix with methodology

---

## Error Responses

All endpoints use standard HTTP status codes and return errors in this format:

```json
{
  "error": {
    "code": "INSUFFICIENT_DATA",
    "message": "Not enough bookmarks to generate insights. Save at least 10 bookmarks to unlock analytics.",
    "details": {
      "currentBookmarks": 4,
      "requiredBookmarks": 10
    },
    "timestamp": "2026-01-19T10:30:00Z"
  }
}
```

**Common Error Codes:**

| Code | HTTP Status | Description |
|------|------------|-------------|
| `INSUFFICIENT_DATA` | 200 | <10 bookmarks (return partial data) |
| `INVALID_PERIOD` | 400 | Invalid date range or period format |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT token |
| `RATE_LIMIT_EXCEEDED` | 429 | >60 req/min |
| `EXPORT_TOO_LARGE` | 413 | Export exceeds 100MB limit |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Caching Strategy

| Endpoint | Cache Location | TTL | Invalidation Trigger |
|----------|---------------|-----|---------------------|
| `/summary` | Redis | 5 min | Bookmark CRUD |
| `/streaks/current` | Redis | 1 min | Bookmark create |
| `/patterns/saving` | Redis | 30 min | Never (historical) |
| `/patterns/behavior` | Redis | 1 hour | Bookmark create (debounced) |
| `/graph/metrics` | Redis | 10 min | Relationship create |
| `/insights` | Redis | 5 min | Insight dismiss action |
| `/trends/bookmarks` | Redis | 10 min | Bookmark CRUD |
| `/distributions/*` | Redis | 30 min | Bookmark CRUD |
| `/recommendations/*` | Redis | 1-6 hours | Depends on type |
| `/benchmarks/cohort` | Redis | 1 day | Never (batch job) |
| `/milestones` | Redis | 1 hour | Badge unlock |

**Cache Key Format:** `analytics:{userId}:{endpoint}:{params_hash}`

**Invalidation Logic:**
- On bookmark create/delete: Clear summary, trends, distributions
- On relationship create: Clear graph metrics
- On concept/entity create: Clear distributions, recommendations
- Manual refresh: Clear all analytics caches for user

---

## Rate Limiting

**Default Limits:**
- 60 requests/minute per user
- 1000 requests/hour per user
- 10,000 requests/day per user

**Export Limits:**
- 5 exports per day per user
- Maximum 1 concurrent export

**Headers:**

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1642598400
```

---

## Webhooks (Future)

**Event Types:**
- `milestone.unlocked`: New badge earned
- `insight.created`: New high-priority insight
- `export.completed`: Analytics export ready
- `streak.broken`: Streak interrupted (grace period)

**Webhook Payload:**

```json
{
  "event": "milestone.unlocked",
  "userId": "user-uuid",
  "timestamp": "2026-01-19T10:00:00Z",
  "data": {
    "badgeId": "badge-42-day-streak",
    "title": "Dedication Master",
    "rarity": "rare"
  }
}
```

---

## SDK Examples

### JavaScript/TypeScript

```typescript
import { SmartBookmarksClient } from '@smartbookmarks/sdk';

const client = new SmartBookmarksClient({
  apiKey: process.env.SMARTBOOKMARKS_API_KEY,
});

// Get analytics summary
const summary = await client.analytics.getSummary();
console.log(`Total bookmarks: ${summary.bookmarks.total}`);

// Get current streak
const streak = await client.analytics.getStreak();
console.log(`Current streak: ${streak.current.days} days`);

// Get personalized insights
const insights = await client.analytics.getInsights({ limit: 5 });
insights.insights.forEach(insight => {
  console.log(`[${insight.type}] ${insight.title}`);
});

// Export analytics
const exportJob = await client.analytics.export({
  format: 'pdf',
  period: '1y',
});
console.log(`Export ID: ${exportJob.id}`);
```

### Python

```python
from smartbookmarks import SmartBookmarksClient

client = SmartBookmarksClient(api_key=os.getenv('SMARTBOOKMARKS_API_KEY'))

# Get analytics summary
summary = client.analytics.get_summary()
print(f"Total bookmarks: {summary['bookmarks']['total']}")

# Get saving patterns
patterns = client.analytics.get_saving_patterns(days=90)
peak_hour = patterns['summary']['peakHour']
print(f"You save most at {peak_hour}:00")

# Get knowledge gaps
gaps = client.analytics.get_knowledge_gaps(limit=5)
for gap in gaps['gaps']:
    print(f"Deepen: {gap['concept']['name']}")
```

---

## Appendix: Database Queries

All SQL queries referenced in this API spec are available in `/docs/ANALYTICS_FRAMEWORK.md` Section 11.

For query optimization tips and indexing strategies, see `/docs/Backend_documentation.MD`.
