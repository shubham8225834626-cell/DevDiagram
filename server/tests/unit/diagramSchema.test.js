import { describe, it, expect } from 'vitest';
import { validateGeminiDiagram } from '../../utils/diagramSchema.js';

const realPaths = [
  'package.json',
  'src/index.js',
  'src/app.js',
  'src/routes/users.js',
  'src/models/User.js',
];

function makeNode(idx, path = realPaths[idx % realPaths.length]) {
  return {
    id: `node-${idx}`,
    label: `Component ${idx}`,
    path,
    type: 'file',
    summary: `Handles component ${idx}.`,
  };
}

describe('Gemini Diagram Output Zod Validation', () => {
  it('accepts valid diagram within node limit and matching real file paths', () => {
    const valid = {
      nodes: [makeNode(1, 'src/index.js'), makeNode(2, 'src/app.js')],
      edges: [{ from: 'node-1', to: 'node-2' }],
    };

    const result = validateGeminiDiagram(valid, realPaths);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toEqual([{ from: 'node-1', to: 'node-2' }]);
    expect(result.nodes[0].valid).toBe(true);
  });

  it('rejects duplicate node IDs', () => {
    const duplicateIds = {
      nodes: [
        makeNode(1, 'src/index.js'),
        { ...makeNode(1, 'src/app.js'), label: 'Duplicate ID' },
      ],
      edges: [],
    };

    expect(() => validateGeminiDiagram(duplicateIds, realPaths)).toThrow(/Duplicate node id/i);
  });

  it('rejects edges pointing to unknown source or target nodes', () => {
    const unknownTarget = {
      nodes: [makeNode(1, 'src/index.js')],
      edges: [{ from: 'node-1', to: 'ghost-node' }],
    };
    expect(() => validateGeminiDiagram(unknownTarget, realPaths)).toThrow(/unknown target node/i);

    const unknownSource = {
      nodes: [makeNode(1, 'src/index.js')],
      edges: [{ from: 'ghost-src', to: 'node-1' }],
    };
    expect(() => validateGeminiDiagram(unknownSource, realPaths)).toThrow(/unknown source node/i);
  });

  it('rejects more than 30 nodes', () => {
    const tooMany = {
      nodes: Array.from({ length: 31 }, (_, i) => makeNode(i + 1)),
      edges: [],
    };

    expect(() => validateGeminiDiagram(tooMany, realPaths)).toThrow(/more than 30 nodes/i);
  });

  it('rejects fake / hallucinated file paths not in repository tree', () => {
    const fakePath = {
      nodes: [makeNode(1, 'src/hallucinated/nonexistent.js')],
      edges: [],
    };

    expect(() => validateGeminiDiagram(fakePath, realPaths)).toThrow(/Fake file path/i);
  });
});
