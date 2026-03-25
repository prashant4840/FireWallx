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

const keyFor = (ip: string) => `tb:${ip}`;

export const addTemporaryBlock = async (ip: string, cooldownMs = 10 * 60 * 1000) => {
  const redis = getRedis();
  const seconds = Math.max(1, Math.ceil(cooldownMs / 1000));
  await redis.set(keyFor(ip), "1", "EX", seconds);
};

export const isTemporaryBlocked = async (ip: string): Promise<boolean> => {
  const redis = getRedis();
  const exists = await redis.exists(keyFor(ip));
  return Number(exists) === 1;
};
