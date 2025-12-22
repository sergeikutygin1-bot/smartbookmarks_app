import { PrismaClient } from '@prisma/client';
import { insightEngineAgent } from '../src/agents/InsightEngineAgent';

const prisma = new PrismaClient();

async function testInsights() {
  try {
    console.log('🧪 Testing Insight Engine Agent...\\n');

    const user = await prisma.user.findFirst();
    if (!user) {
      console.error('❌ No user found');
      process.exit(1);
    }

    console.log(`✓ Using user: ${user.email}\\n`);

    // Generate insights
    console.log('🔮 Generating insights...');
    const insights = await insightEngineAgent.generateInsights(user.id);

    console.log(`\\n✅ Generated ${insights.length} insights:\\n`);

    // Group by type
    const byType = {
      trending_topic: insights.filter((i) => i.insightType === 'trending_topic'),
      knowledge_gap: insights.filter((i) => i.insightType === 'knowledge_gap'),
      surprising_connection: insights.filter((i) => i.insightType === 'surprising_connection'),
      recommendation: insights.filter((i) => i.insightType === 'recommendation'),
    };

    console.log(`📈 Trending Topics (${byType.trending_topic.length}):`);
    byType.trending_topic.forEach((insight) => {
      console.log(`   • ${insight.title}`);
      console.log(`     ${insight.description}`);
      console.log(`     Confidence: ${(insight.confidenceScore * 100).toFixed(0)}%\\n`);
    });

    console.log(`🔍 Knowledge Gaps (${byType.knowledge_gap.length}):`);
    byType.knowledge_gap.forEach((insight) => {
      console.log(`   • ${insight.title}`);
      console.log(`     ${insight.description}`);
      console.log(`     Confidence: ${(insight.confidenceScore * 100).toFixed(0)}%\\n`);
    });

    console.log(`✨ Surprising Connections (${byType.surprising_connection.length}):`);
    byType.surprising_connection.forEach((insight) => {
      console.log(`   • ${insight.title}`);
      console.log(`     ${insight.description}`);
      console.log(`     Confidence: ${(insight.confidenceScore * 100).toFixed(0)}%\\n`);
    });

    console.log(`💡 Recommendations (${byType.recommendation.length}):`);
    byType.recommendation.forEach((insight) => {
      console.log(`   • ${insight.title}`);
      console.log(`     ${insight.description}`);
      console.log(`     Confidence: ${(insight.confidenceScore * 100).toFixed(0)}%\\n`);
    });

    console.log('🎉 Insight generation complete!');
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testInsights();
