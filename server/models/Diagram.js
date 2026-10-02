import mongoose from 'mongoose';

const nodeSchema = new mongoose.Schema({
  id: String,
  label: String,
  path: String,
  type: { type: String, enum: ['file', 'folder'] },
  summary: String,
  valid: { type: Boolean, default: true },
});

const edgeSchema = new mongoose.Schema({
  from: String,
  to: String,
});

const diagramSchema = new mongoose.Schema(
  {
    // Cache key: "owner/repo"
    repoKey: { type: String, required: true, unique: true, index: true },
    branch: { type: String, required: true },
    graph: {
      nodes: [nodeSchema],
      edges: [edgeSchema],
    },
    truncated: { type: Boolean, default: false },
    // TTL index: auto-delete documents after 7 days
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 7 },
  }
);

export default mongoose.model('Diagram', diagramSchema);
