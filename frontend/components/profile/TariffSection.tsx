'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export default function TariffSection() {
  return (
    <div className="max-w-2xl">
      <Card className="p-8 bg-card border border-border shadow-sm">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-3xl font-serif font-semibold mb-2 tracking-tight">
              Free Plan
            </h2>
            <p className="text-muted-foreground">
              Current subscription
            </p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-semibold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              $0
            </div>
            <div className="text-sm text-muted-foreground">
              per month
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-6 mb-6">
          <h3 className="text-sm uppercase tracking-wide text-muted-foreground font-medium mb-3">
            Features
          </h3>
          <ul className="space-y-2">
            {[
              'Unlimited bookmarks',
              'AI enrichment',
              'Knowledge graph',
              'Semantic search',
              'Entity & concept extraction',
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-primary"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-foreground">
                  {feature}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button
                  disabled
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium uppercase tracking-wide text-sm"
                >
                  Upgrade Plan
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Premium plans coming soon!</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </Card>
    </div>
  );
}
