"""
Entity normalization utilities.

Post-processing layer to enforce canonical entity naming.
Handles common variations (e.g., "react" → "React", "postgres" → "PostgreSQL").

Phase 2: Critical for reducing entity duplication from 40% → <5%.
"""
from enum import Enum
from typing import Dict, List, Optional


class EntityType(str, Enum):
    """Entity types (matches TypeScript enum)."""
    PERSON = "person"
    COMPANY = "company"
    TECHNOLOGY = "technology"
    LOCATION = "location"
    PRODUCT = "product"


# Canonical mappings for common entities (expand as patterns emerge)
TECHNOLOGY_CANONICAL: Dict[str, str] = {
    # JavaScript ecosystem
    'react': 'React', 'reactjs': 'React', 'react.js': 'React',
    'vue': 'Vue.js', 'vuejs': 'Vue.js', 'vue.js': 'Vue.js',
    'angular': 'Angular', 'angularjs': 'Angular',
    'svelte': 'Svelte', 'sveltekit': 'SvelteKit',
    'next': 'Next.js', 'nextjs': 'Next.js', 'next.js': 'Next.js',
    'nuxt': 'Nuxt.js', 'nuxtjs': 'Nuxt.js', 'nuxt.js': 'Nuxt.js',

    # Languages
    'javascript': 'JavaScript', 'js': 'JavaScript',
    'typescript': 'TypeScript', 'ts': 'TypeScript',
    'python': 'Python', 'py': 'Python',
    'rust': 'Rust', 'rustlang': 'Rust',
    'golang': 'Go', 'go': 'Go',

    # Backend
    'node': 'Node.js', 'nodejs': 'Node.js', 'node.js': 'Node.js',
    'express': 'Express.js', 'expressjs': 'Express.js', 'express.js': 'Express.js',
    'fastapi': 'FastAPI',
    'django': 'Django',
    'flask': 'Flask',

    # Databases
    'postgres': 'PostgreSQL', 'postgresql': 'PostgreSQL', 'psql': 'PostgreSQL',
    'mysql': 'MySQL',
    'mongodb': 'MongoDB', 'mongo': 'MongoDB',
    'redis': 'Redis',
    'elasticsearch': 'Elasticsearch', 'elastic': 'Elasticsearch',

    # Cloud & Infrastructure
    'k8s': 'Kubernetes', 'kubernetes': 'Kubernetes',
    'docker': 'Docker',
    'aws': 'AWS', 'amazon web services': 'AWS',
    'gcp': 'Google Cloud', 'google cloud platform': 'Google Cloud',
    'azure': 'Azure', 'microsoft azure': 'Azure',

    # AI/ML
    'tensorflow': 'TensorFlow',
    'pytorch': 'PyTorch',
    'openai': 'OpenAI',
    'langchain': 'LangChain',
}

COMPANY_CANONICAL: Dict[str, str] = {
    'facebook': 'Meta', 'meta': 'Meta',
    'google': 'Google', 'alphabet': 'Alphabet',
    'microsoft': 'Microsoft', 'msft': 'Microsoft',
    'amazon': 'Amazon', 'amzn': 'Amazon',
    'apple': 'Apple',
    'netflix': 'Netflix',
    'openai': 'OpenAI',
    'anthropic': 'Anthropic',
}

PERSON_CANONICAL: Dict[str, str] = {
    # Add common name variations if needed
    # Usually person names are unique enough
}

PRODUCT_CANONICAL: Dict[str, str] = {
    'chatgpt': 'ChatGPT', 'chat gpt': 'ChatGPT',
    'claude': 'Claude',
    'github copilot': 'GitHub Copilot', 'copilot': 'GitHub Copilot',
    'vscode': 'VS Code', 'visual studio code': 'VS Code',
}


def normalize_entity_name(text: str, entity_type: EntityType) -> Optional[str]:
    """
    Normalize entity name to canonical form.

    Args:
        text: Raw entity name
        entity_type: Type of entity

    Returns:
        Canonical name or None if should be filtered out
    """
    if not text or len(text.strip()) < 2:
        return None

    normalized = text.strip()
    normalized_lower = normalized.lower()

    # Filter out generic terms
    generic_terms = [
        'user', 'system', 'data', 'code', 'app', 'software',
        'website', 'api', 'database', 'server', 'client', 'tool',
        'platform', 'service', 'framework', 'library'
    ]
    if normalized_lower in generic_terms:
        return None

    # Apply type-specific canonical mappings
    if entity_type == EntityType.TECHNOLOGY:
        if normalized_lower in TECHNOLOGY_CANONICAL:
            return TECHNOLOGY_CANONICAL[normalized_lower]
        # Preserve casing for technologies not in mapping
        return normalized.replace('  ', ' ')

    elif entity_type == EntityType.COMPANY:
        if normalized_lower in COMPANY_CANONICAL:
            return COMPANY_CANONICAL[normalized_lower]
        # Title case for companies not in mapping
        return to_title_case(normalized)

    elif entity_type == EntityType.PERSON:
        if normalized_lower in PERSON_CANONICAL:
            return PERSON_CANONICAL[normalized_lower]
        # Title case for person names
        return to_title_case(normalized)

    elif entity_type == EntityType.PRODUCT:
        if normalized_lower in PRODUCT_CANONICAL:
            return PRODUCT_CANONICAL[normalized_lower]
        # Preserve casing for products
        return normalized.replace('  ', ' ')

    elif entity_type == EntityType.LOCATION:
        # Title case for locations
        return to_title_case(normalized)

    return normalized


def to_title_case(text: str) -> str:
    """Convert to title case (First Letter Uppercase)."""
    return ' '.join(word.capitalize() for word in text.split())


def deduplicate_entities(entities: List[Dict]) -> List[Dict]:
    """
    Deduplicate entities after normalization.

    Args:
        entities: List of entity dicts with 'normalizedName' key

    Returns:
        Deduplicated list (merged by normalizedName)
    """
    entity_map = {}

    for entity in entities:
        normalized_name = entity.get('normalizedName')
        if not normalized_name:
            continue

        if normalized_name in entity_map:
            # Merge: sum mentions, keep higher confidence
            existing = entity_map[normalized_name]
            existing['mentions'] = existing.get('mentions', 1) + entity.get('mentions', 1)
            existing['confidence'] = max(existing.get('confidence', 0), entity.get('confidence', 0))
        else:
            entity_map[normalized_name] = entity

    # Sort by mentions (most mentioned first)
    return sorted(entity_map.values(), key=lambda e: e.get('mentions', 0), reverse=True)
