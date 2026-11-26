import mongoose from 'mongoose';

const userHistorySchema = new mongoose.Schema({
  // Relation to User document
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // Snapshot of user info for quick inspection
  username: { type: String, default: '' },
  email: { type: String, default: '' },
  // Optional relation to cached Diagram (repo) document
  diagram: { type: mongoose.Schema.Types.ObjectId, ref: 'Diagram', default: null },
  repoKey: { type: String, required: true },
  owner: { type: String, required: true },
  repo: { type: String, required: true },
  visitedAt: { type: Date, default: Date.now },
});

userHistorySchema.index({ user: 1, repoKey: 1 }, { unique: true });

export default mongoose.model('UserHistory', userHistorySchema);
