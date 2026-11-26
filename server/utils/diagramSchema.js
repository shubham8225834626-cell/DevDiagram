import { z } from 'zod';

export const diagramNodeSchema = z.object({
  id: z.string().trim().min(1, 'Node id is required').max(120),
  label: z.string().trim().min(1, 'Node label is required').max(150),
  path: z.string().trim().min(1, 'Node path is required').max(500),
  type: z.enum(['file', 'folder']),
  summary: z.string().trim().min(1, 'Node summary is required').max(600),
});

export const diagramEdgeSchema = z.object({
  from: z.string().trim().min(1).max(120),
  to: z.string().trim().min(1).max(120),
});

/**
 * Create a strict Zod validator for Gemini diagram output.
 * - Rejects > 30 nodes (max 30)
 * - Rejects duplicate node IDs
 * - Rejects edges referencing unknown node IDs
 * - Rejects fake file paths when realPaths is provided
 */
export function createGeminiDiagramSchema(realPaths = null) {
  const realPathSet =
    realPaths instanceof Set
      ? realPaths
      : Array.isArray(realPaths)
        ? new Set(realPaths)
        : null;

  return z
    .object({
      nodes: z
        .array(diagramNodeSchema)
        .min(1, 'Diagram must contain at least 1 node')
        .max(30, 'Diagram cannot contain more than 30 nodes'),
      edges: z.array(diagramEdgeSchema).max(200),
    })
    .superRefine((data, ctx) => {
      const seenIds = new Set();

      data.nodes.forEach((node, index) => {
        if (seenIds.has(node.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['nodes', index, 'id'],
            message: `Duplicate node id: "${node.id}"`,
          });
        }
        seenIds.add(node.id);

        if (realPathSet && !realPathSet.has(node.path)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['nodes', index, 'path'],
            message: `Fake file path not found in repository tree: "${node.path}"`,
          });
        }
      });

      data.edges.forEach((edge, index) => {
        if (!seenIds.has(edge.from)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['edges', index, 'from'],
            message: `Edge references unknown source node: "${edge.from}"`,
          });
        }
        if (!seenIds.has(edge.to)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['edges', index, 'to'],
            message: `Edge references unknown target node: "${edge.to}"`,
          });
        }
      });
    });
}

/**
 * Validate raw parsed Gemini diagram JSON against strict schema and optional real file tree paths.
 * Returns { nodes, edges } with `valid: true` on each node, or throws an Error with details.
 */
export function validateGeminiDiagram(rawData, realPaths = null) {
  const schema = createGeminiDiagramSchema(realPaths);
  const result = schema.safeParse(rawData);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    const err = new Error(`Invalid diagram output: ${details}`);
    err.issues = result.error.issues;
    throw err;
  }

  return {
    nodes: result.data.nodes.map((n) => ({ ...n, valid: true })),
    edges: result.data.edges,
  };
}
