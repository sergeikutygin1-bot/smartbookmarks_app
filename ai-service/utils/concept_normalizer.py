"""
Concept normalization utilities.

Post-processing layer to enforce canonical concept naming and hierarchy.
Handles common variations (e.g., "ai" → "Artificial Intelligence", "ml" → "Machine Learning").

Phase 2: Critical for reducing concept duplication and enforcing standard taxonomy.
"""
from typing import Dict, List, Optional, Tuple


# Canonical mappings for common concepts (expand as patterns emerge)
CONCEPT_CANONICAL: Dict[str, str] = {
    # AI/ML
    'ai': 'Artificial Intelligence',
    'a.i.': 'Artificial Intelligence',
    'artificial intelligence': 'Artificial Intelligence',
    'ml': 'Machine Learning',
    'machine learning': 'Machine Learning',
    'deep learning': 'Deep Learning',
    'neural networks': 'Neural Networks',
    'nlp': 'Natural Language Processing',
    'natural language processing': 'Natural Language Processing',
    'computer vision': 'Computer Vision',
    'cv': 'Computer Vision',

    # Web Development
    'web development': 'Web Development',
    'web dev': 'Web Development',
    'frontend': 'Frontend Development',
    'frontend development': 'Frontend Development',
    'front-end': 'Frontend Development',
    'backend': 'Backend Development',
    'backend development': 'Backend Development',
    'back-end': 'Backend Development',
    'fullstack': 'Full-Stack Development',
    'full-stack': 'Full-Stack Development',
    'full stack': 'Full-Stack Development',

    # Software Engineering
    'software engineering': 'Software Engineering',
    'software development': 'Software Engineering',
    'programming': 'Software Engineering',
    'coding': 'Software Engineering',

    # Data
    'data science': 'Data Science',
    'data engineering': 'Data Engineering',
    'data analysis': 'Data Analysis',
    'analytics': 'Data Analysis',
    'big data': 'Big Data',

    # Cloud
    'cloud computing': 'Cloud Computing',
    'cloud': 'Cloud Computing',
    'devops': 'DevOps',
    'dev ops': 'DevOps',

    # Other
    'cybersecurity': 'Cybersecurity',
    'security': 'Cybersecurity',
    'blockchain': 'Blockchain',
    'crypto': 'Blockchain',
}

# Standard concept hierarchy (2 levels max)
# Format: {child: parent}
STANDARD_HIERARCHY: Dict[str, Optional[str]] = {
    # Top-level concepts (no parent)
    'Artificial Intelligence': None,
    'Software Engineering': None,
    'Web Development': None,
    'Data Science': None,
    'Cloud Computing': None,
    'Cybersecurity': None,
    'Blockchain': None,

    # AI subtopics
    'Machine Learning': 'Artificial Intelligence',
    'Deep Learning': 'Machine Learning',
    'Neural Networks': 'Machine Learning',
    'Natural Language Processing': 'Artificial Intelligence',
    'Computer Vision': 'Artificial Intelligence',

    # Web Dev subtopics
    'Frontend Development': 'Web Development',
    'Backend Development': 'Web Development',
    'Full-Stack Development': 'Web Development',

    # Data subtopics
    'Data Engineering': 'Data Science',
    'Data Analysis': 'Data Science',
    'Big Data': 'Data Science',

    # Cloud subtopics
    'DevOps': 'Cloud Computing',
}


def normalize_concept_name(name: str) -> Optional[str]:
    """
    Normalize concept name to canonical form.

    Args:
        name: Raw concept name

    Returns:
        Canonical name or None if should be filtered out
    """
    if not name or len(name.strip()) < 2:
        return None

    normalized = name.strip().lower()

    # Filter out overly generic terms
    generic_terms = [
        'topic', 'concept', 'idea', 'thing', 'stuff',
        'content', 'information', 'data', 'general'
    ]
    if normalized in generic_terms:
        return None

    # Check canonical mapping
    if normalized in CONCEPT_CANONICAL:
        return CONCEPT_CANONICAL[normalized]

    # Not in mapping - clean and title case
    cleaned = ' '.join(normalized.split())  # Clean whitespace
    return cleaned.title()  # Title case for display


def fix_concept_hierarchy(
    concept_name: str,
    proposed_parent: Optional[str]
) -> Tuple[str, Optional[str]]:
    """
    Enforce standard concept hierarchy.

    Args:
        concept_name: Canonical concept name
        proposed_parent: Parent suggested by LLM

    Returns:
        Tuple of (canonical_name, correct_parent)
    """
    # If concept is in standard hierarchy, use standard parent
    if concept_name in STANDARD_HIERARCHY:
        standard_parent = STANDARD_HIERARCHY[concept_name]
        return (concept_name, standard_parent)

    # If proposed parent is valid, use it
    if proposed_parent and proposed_parent in STANDARD_HIERARCHY:
        return (concept_name, proposed_parent)

    # No standard hierarchy, keep proposed
    return (concept_name, proposed_parent)


def deduplicate_concepts(concepts: List[Dict]) -> List[Dict]:
    """
    Deduplicate concepts after normalization.

    Args:
        concepts: List of concept dicts with 'normalizedName' key

    Returns:
        Deduplicated list (merged by normalizedName)
    """
    concept_map = {}

    for concept in concepts:
        normalized_name = concept.get('normalizedName')
        if not normalized_name:
            continue

        if normalized_name in concept_map:
            # Merge: keep higher relevance
            existing = concept_map[normalized_name]
            existing['relevance'] = max(
                existing.get('relevance', 0),
                concept.get('relevance', 0)
            )
            existing['confidence'] = max(
                existing.get('confidence', 0),
                concept.get('confidence', 0)
            )
        else:
            concept_map[normalized_name] = concept

    # Sort by relevance (most relevant first)
    return sorted(
        concept_map.values(),
        key=lambda c: c.get('relevance', 0),
        reverse=True
    )
