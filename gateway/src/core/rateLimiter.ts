import RedisModule from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const RedisCtor = (RedisModule as unknown as { default?: any }).default ?? RedisModule;
let redisClient: any = null;

const getRedis = () => {
  if (!redisClient) {
    redisClient = new RedisCtor(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  }
  return redisClient;
};

export const checkDistributedRateLimit = async (
  ip: string,
  path: string,
  maxPerWindow = Number(process.env.GLOBAL_RPS_LIMIT ?? 100),
  windowSec = Number(process.env.GLOBAL_RPS_WINDOW_SEC ?? 1)
) => {
  const key = `rl:${ip}:${path}`;

  try {
    const redis = getRedis();
    const hits = await redis.incr(key);
    if (hits === 1) {
      await redis.expire(key, windowSec);
    }

    return {
      exceeded: hits > maxPerWindow,
      remaining: Math.max(0, maxPerWindow - hits),
      hits
    };
  } catch {
    return {
      exceeded: false,
      remaining: maxPerWindow,
      hits: 0
    };
  }
};
