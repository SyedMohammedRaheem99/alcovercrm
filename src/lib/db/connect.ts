import mongoose from 'mongoose';

/**
 * Serverless-safe MongoDB connection.
 *
 * On Vercel every request may run in a fresh Lambda invocation, but the module
 * scope is reused between warm invocations. Caching the connection promise on
 * `globalThis` means a warm Lambda reuses the existing pool instead of opening a
 * new one per request — which would otherwise exhaust the Atlas free-tier
 * connection limit within minutes of real traffic.
 */

const MONGODB_URI = process.env.MONGODB_URI;

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var _mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global._mongooseCache ?? { conn: null, promise: null };
global._mongooseCache = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (!MONGODB_URI) {
    throw new Error(
      'MONGODB_URI is not set. Copy .env.example to .env.local and add your MongoDB connection string.',
    );
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      // Keep the pool small — the Atlas free tier allows a limited number of
      // concurrent connections and several Lambdas may be warm at once.
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Clear the cached promise so the next request retries instead of
    // permanently reusing a rejected promise.
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}

/** Strict mode keeps unknown keys out of queries — an extra guard against injection. */
mongoose.set('strictQuery', true);

export default connectDB;
