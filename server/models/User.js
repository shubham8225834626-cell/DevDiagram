import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  // Unique provider-scoped identifier, e.g. "google:12345" or "github:67890"
  authId: { type: String, required: true, unique: true, index: true },
  provider: { type: String, enum: ['google', 'github'], required: true },
  name: { type: String, required: true },
  username: { type: String, default: '' },
  email: { type: String, default: '' },
  avatar: { type: String, default: '' },
  // AES-256-GCM encrypted GitHub OAuth access token — never selected or returned by default
  githubAccessTokenEncrypted: { type: String, default: '', select: false },
  lastLoginAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('User', userSchema);
