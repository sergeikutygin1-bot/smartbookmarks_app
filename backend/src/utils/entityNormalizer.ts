// Technology canonical mappings (expand as patterns emerge)
const TECHNOLOGY_CANONICAL: Record<string, string> = {
  react: 'React',
  reactjs: 'React',
  'react.js': 'React',
  'react js': 'React',

  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  psql: 'PostgreSQL',

  javascript: 'JavaScript',
  js: 'JavaScript',
  ecmascript: 'JavaScript',

  typescript: 'TypeScript',
  ts: 'TypeScript',

  node: 'Node.js',
  nodejs: 'Node.js',
  'node js': 'Node.js',

  k8s: 'Kubernetes',
  kubernetes: 'Kubernetes',
  kube: 'Kubernetes',

  docker: 'Docker',
  'docker container': 'Docker',

  aws: 'Amazon Web Services',
  'amazon web services': 'Amazon Web Services',

  gcp: 'Google Cloud Platform',
  'google cloud': 'Google Cloud Platform',

  ml: 'Machine Learning',
  ai: 'Artificial Intelligence',
  nlp: 'Natural Language Processing',

  redis: 'Redis',
  mongodb: 'MongoDB',
  mongo: 'MongoDB',

  mysql: 'MySQL',
  mariadb: 'MariaDB',

  python: 'Python',
  java: 'Java',
  csharp: 'C#',
  'c#': 'C#',

  nextjs: 'Next.js',
  'next.js': 'Next.js',

  vue: 'Vue.js',
  vuejs: 'Vue.js',
  'vue.js': 'Vue.js',

  angular: 'Angular',
  angularjs: 'AngularJS',

  express: 'Express.js',
  expressjs: 'Express.js',
  'express.js': 'Express.js',

  graphql: 'GraphQL',
  'graph ql': 'GraphQL',

  rest: 'REST',
  'rest api': 'REST API',
  restful: 'RESTful',

  git: 'Git',
  github: 'GitHub',
  gitlab: 'GitLab',

  vscode: 'Visual Studio Code',
  'vs code': 'Visual Studio Code',
  'visual studio code': 'Visual Studio Code',
};

// Company canonical mappings
const COMPANY_CANONICAL: Record<string, string> = {
  facebook: 'Meta Platforms',
  meta: 'Meta Platforms',

  google: 'Google',
  alphabet: 'Alphabet Inc.',

  openai: 'OpenAI',
  'open ai': 'OpenAI',

  microsoft: 'Microsoft',
  msft: 'Microsoft',

  apple: 'Apple',
  aapl: 'Apple',

  amazon: 'Amazon',
  amzn: 'Amazon',

  netflix: 'Netflix',
  nflx: 'Netflix',

  tesla: 'Tesla',
  tsla: 'Tesla',

  nvidia: 'NVIDIA',
  nvda: 'NVIDIA',

  anthropic: 'Anthropic',

  vercel: 'Vercel',

  cloudflare: 'Cloudflare',

  mongodb: 'MongoDB Inc.',

  databricks: 'Databricks',
};

/**
 * Normalize entity name using dictionary lookup
 */
export function normalizeEntityName(name: string, type: string): string {
  const lower = name.toLowerCase().trim();

  // Check type-specific dictionary first
  if (type === 'technology' && TECHNOLOGY_CANONICAL[lower]) {
    return TECHNOLOGY_CANONICAL[lower];
  }

  if (type === 'company' && COMPANY_CANONICAL[lower]) {
    return COMPANY_CANONICAL[lower];
  }

  // Default casing rules
  if (type === 'person' || type === 'location') {
    return toTitleCase(name);
  }

  // Preserve original casing for technology/company/product
  return name.trim();
}

/**
 * Convert string to title case
 */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Deduplicate entities array by canonical name
 */
export function deduplicateEntities(entities: any[]): any[] {
  const map = new Map<string, any>();

  for (const entity of entities) {
    const normalized = normalizeEntityName(entity.name, entity.type);
    const key = `${entity.type}:${normalized.toLowerCase()}`;

    if (map.has(key)) {
      const existing = map.get(key);
      existing.mentions += entity.mentions || 1;
    } else {
      map.set(key, {
        ...entity,
        name: normalized,
        normalizedName: normalized.toLowerCase(),
      });
    }
  }

  return Array.from(map.values());
}
