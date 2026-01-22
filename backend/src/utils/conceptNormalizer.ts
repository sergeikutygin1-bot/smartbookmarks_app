// Concept canonical mappings
const CONCEPT_CANONICAL: Record<string, string> = {
  ai: 'Artificial Intelligence',
  'a.i.': 'Artificial Intelligence',
  'artificial intelligence': 'Artificial Intelligence',

  ml: 'Machine Learning',
  'machine learning': 'Machine Learning',

  nlp: 'Natural Language Processing',
  'natural language processing': 'Natural Language Processing',

  dl: 'Deep Learning',
  'deep learning': 'Deep Learning',

  'web dev': 'Web Development',
  'web development': 'Web Development',
  webdev: 'Web Development',

  frontend: 'Frontend Development',
  'front-end': 'Frontend Development',
  'front end': 'Frontend Development',

  backend: 'Backend Development',
  'back-end': 'Backend Development',
  'back end': 'Backend Development',

  devops: 'DevOps',
  'dev ops': 'DevOps',

  'ci/cd': 'CI/CD',
  'continuous integration': 'CI/CD',
  cicd: 'CI/CD',

  'full-stack': 'Full-Stack Development',
  fullstack: 'Full-Stack Development',
  'full stack': 'Full-Stack Development',

  api: 'API Development',
  apis: 'API Development',

  database: 'Database Management',
  databases: 'Database Management',
  db: 'Database Management',

  cloud: 'Cloud Computing',
  'cloud computing': 'Cloud Computing',

  serverless: 'Serverless Architecture',
  'serverless architecture': 'Serverless Architecture',

  microservices: 'Microservices Architecture',
  'micro services': 'Microservices Architecture',

  containers: 'Containerization',
  containerization: 'Containerization',

  oop: 'Object-Oriented Programming',
  'object-oriented programming': 'Object-Oriented Programming',

  fp: 'Functional Programming',
  'functional programming': 'Functional Programming',

  'test-driven development': 'Test-Driven Development',
  tdd: 'Test-Driven Development',

  agile: 'Agile Development',
  'agile development': 'Agile Development',

  scrum: 'Scrum',

  security: 'Security',
  cybersecurity: 'Cybersecurity',

  ux: 'User Experience',
  'user experience': 'User Experience',

  ui: 'User Interface',
  'user interface': 'User Interface',

  'ui/ux': 'UI/UX Design',
  'ui ux': 'UI/UX Design',

  'data science': 'Data Science',
  'data analysis': 'Data Analysis',

  'big data': 'Big Data',
  bigdata: 'Big Data',

  blockchain: 'Blockchain',

  iot: 'Internet of Things',
  'internet of things': 'Internet of Things',

  ar: 'Augmented Reality',
  'augmented reality': 'Augmented Reality',

  vr: 'Virtual Reality',
  'virtual reality': 'Virtual Reality',

  'mobile dev': 'Mobile Development',
  'mobile development': 'Mobile Development',

  ios: 'iOS Development',
  android: 'Android Development',

  'react native': 'React Native',

  flutter: 'Flutter',

  'web3': 'Web3',

  'distributed systems': 'Distributed Systems',
};

// Standard hierarchy (enforced after LLM analysis)
const STANDARD_HIERARCHY: Record<string, string | null> = {
  'Artificial Intelligence': null,
  'Machine Learning': 'Artificial Intelligence',
  'Deep Learning': 'Machine Learning',
  'Natural Language Processing': 'Artificial Intelligence',
  'Computer Vision': 'Artificial Intelligence',

  'Web Development': null,
  'Frontend Development': 'Web Development',
  'Backend Development': 'Web Development',
  'Full-Stack Development': 'Web Development',

  Programming: null,
  'Object-Oriented Programming': 'Programming',
  'Functional Programming': 'Programming',

  'Cloud Computing': null,
  'Serverless Architecture': 'Cloud Computing',
  Containerization: 'Cloud Computing',

  'Software Architecture': null,
  'Microservices Architecture': 'Software Architecture',
  'Distributed Systems': 'Software Architecture',

  'Mobile Development': null,
  'iOS Development': 'Mobile Development',
  'Android Development': 'Mobile Development',
};

/**
 * Normalize concept name using dictionary
 */
export function normalizeConceptName(name: string): string {
  const lower = name.toLowerCase().trim();

  if (CONCEPT_CANONICAL[lower]) {
    return CONCEPT_CANONICAL[lower];
  }

  // Default: Title case
  return name
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Fix concept hierarchy based on standard taxonomy
 */
export function fixConceptHierarchy(concept: string, proposedParent: string | null): string | null {
  const canonical = normalizeConceptName(concept);

  // Check if we have a standard hierarchy for this concept
  if (canonical in STANDARD_HIERARCHY) {
    return STANDARD_HIERARCHY[canonical];
  }

  // Otherwise, use proposed parent (from LLM)
  return proposedParent;
}

/**
 * Deduplicate concepts array by canonical name
 */
export function deduplicateConcepts(concepts: any[]): any[] {
  const map = new Map<string, any>();

  for (const concept of concepts) {
    const normalized = normalizeConceptName(concept.name);
    const key = normalized.toLowerCase();

    if (map.has(key)) {
      const existing = map.get(key);
      existing.relevance = Math.max(existing.relevance, concept.relevance);
    } else {
      map.set(key, {
        ...concept,
        name: normalized,
        normalizedName: normalized.toLowerCase(),
      });
    }
  }

  return Array.from(map.values());
}
