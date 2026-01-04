import { useQuery } from '@tanstack/react-query';

interface Concept {
  id: string;
  name: string;
  occurrenceCount: number;
  parentConceptId?: string;
}

interface Entity {
  id: string;
  name: string;
  entityType: 'person' | 'company' | 'technology' | 'product' | 'location';
  occurrenceCount: number;
}

/**
 * Fetch all concepts for the current user
 * Used for filter dropdowns
 *
 * @param limit - Maximum number of concepts to fetch (default: 100)
 * @returns Query result with array of concepts
 */
export function useAllConcepts(limit: number = 100) {
  return useQuery<Concept[]>({
    queryKey: ['concepts', limit],
    queryFn: async () => {
      const response = await fetch(
        `/api/graph/concepts?limit=${limit}`
      );
      if (!response.ok) throw new Error('Failed to fetch concepts');
      const result = await response.json();
      return result.data;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes (concepts list is stable)
  });
}

/**
 * Fetch all entities for the current user
 * Used for filter dropdowns
 *
 * @param type - Optional filter by entity type
 * @param limit - Maximum number of entities to fetch (default: 100)
 * @returns Query result with array of entities
 */
export function useAllEntities(type?: string, limit: number = 100) {
  return useQuery<Entity[]>({
    queryKey: ['entities', type, limit],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (type) params.append('type', type);

      const response = await fetch(
        `/api/graph/entities?${params}`
      );
      if (!response.ok) throw new Error('Failed to fetch entities');
      const result = await response.json();
      return result.data;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}
