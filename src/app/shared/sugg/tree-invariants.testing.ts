import type { ConceptEdge } from '../../aplus/discovery-graph/concept-graph.model';

/**
 * The owner's hex rules (K174, K176) as a check over a map's edges: a hex has at most six children,
 * each idea at most one parent, and nothing goes into the map's root. Only parent-child (hierarchy)
 * links count; a lateral link relates two ideas and is neither. Returns every breach, so an empty
 * list means the map keeps the rules.
 */
export function treeInvariants(edges: readonly Pick<ConceptEdge, 'sourceConceptId' | 'targetConceptId' | 'class'>[], rootId: string): string[] {
  const children = new Map<string, number>();
  const parents = new Map<string, number>();
  for (const e of edges) {
    if (e.class !== 'hierarchy') continue;
    children.set(e.sourceConceptId, (children.get(e.sourceConceptId) ?? 0) + 1);
    parents.set(e.targetConceptId, (parents.get(e.targetConceptId) ?? 0) + 1);
  }
  const breaches: string[] = [];
  for (const [id, n] of children) if (n > 6) breaches.push(`${id} has ${n} children`);
  for (const [id, n] of parents) if (n > 1) breaches.push(`${id} has ${n} parents`);
  if (parents.has(rootId)) breaches.push(`the root ${rootId} has a parent`);
  return breaches;
}
