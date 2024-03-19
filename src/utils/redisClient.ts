import { createClient } from 'redis';
import { getParameterStore } from '@/utils/awsParameterStore';

const createRedisClient = async () => {
  const REDIS_CLOUD = await getParameterStore({ key: 'REDIS_CLOUD' });

  return createClient({
    url: REDIS_CLOUD,
    legacyMode: true,
  });
};

const redisClient = createRedisClient();

export { redisClient };
