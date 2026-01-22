export interface WikidataResult {
  id: string; // Q110212567
  label: string; // React (JavaScript library)
  aliases: string[]; // ["React.js", "ReactJS"]
  description: string;
  confidence: number; // 0-1
}

export class WikidataClient {
  private endpoint = 'https://query.wikidata.org/sparql';

  /**
   * Search Wikidata for an entity
   */
  async search(name: string, entityType: string): Promise<WikidataResult | null> {
    const query = this.buildSPARQLQuery(name, entityType);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'SmartBookmarks/1.0',
        },
        body: `query=${encodeURIComponent(query)}`,
      });

      if (!response.ok) {
        console.warn(`Wikidata API returned ${response.status}`);
        return null;
      }

      const data = await response.json();
      return this.parseResults(data);
    } catch (error) {
      console.error('Wikidata query failed:', error);
      return null;
    }
  }

  /**
   * Build SPARQL query for entity search
   */
  private buildSPARQLQuery(name: string, entityType: string): string {
    // Map entity types to Wikidata instance types
    const instanceMap: Record<string, string> = {
      technology: 'Q7397', // Software
      company: 'Q783794', // Company
      person: 'Q5', // Human
      location: 'Q2221906', // Geographic location
      product: 'Q2424752', // Product
    };

    const instanceOf = instanceMap[entityType] || 'Q35120'; // Entity fallback

    return `
      SELECT ?item ?itemLabel ?itemDescription ?alias
      WHERE {
        ?item wdt:P31 wd:${instanceOf}.
        ?item rdfs:label ?itemLabel.
        FILTER(CONTAINS(LCASE(?itemLabel), "${name.toLowerCase()}"))
        OPTIONAL { ?item skos:altLabel ?alias. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      LIMIT 5
    `;
  }

  /**
   * Parse SPARQL results into WikidataResult
   */
  private parseResults(data: any): WikidataResult | null {
    if (!data.results?.bindings?.length) return null;

    const first = data.results.bindings[0];
    const aliases = data.results.bindings
      .map((b: any) => b.alias?.value)
      .filter((a: string) => a)
      .filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i); // Dedupe

    return {
      id: this.extractWikidataId(first.item.value),
      label: first.itemLabel.value,
      aliases,
      description: first.itemDescription?.value || '',
      confidence: 0.9, // High confidence for Wikidata matches
    };
  }

  /**
   * Extract Wikidata ID from URI
   */
  private extractWikidataId(uri: string): string {
    return uri.split('/').pop() || '';
  }
}
