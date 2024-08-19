import { createClient } from 'redis';
import { getParameterStore } from '@/utils/awsParameterStore';

const createRedisClient = async () => {
  const REDIS_CLOUD = await getParameterStore({ key: 'REDIS_CLOUD' }).catch(
    (err) => {
      throw new Error(
        `Error during aws getParameterStore REDIS_CLOUD data fetch: ${err}`
      );
    }
  );

  return createClient({
    url: REDIS_CLOUD,
    legacyMode: true,
  });
};

const redisClient = createRedisClient();

export { redisClient };
