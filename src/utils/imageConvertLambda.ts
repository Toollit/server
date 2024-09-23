import {
  LambdaClient,
  InvokeCommand,
  InvokeCommandInput,
} from '@aws-sdk/client-lambda';
import { getParameterStore } from '@/utils/awsParameterStore';
import { TextDecoder } from 'util';

export const imageConvertLambda = async (s3ObjectKey: string) => {
  try {
    const AWS_S3_BUCKET_REGION = await getParameterStore({
      key: 'AWS_S3_BUCKET_REGION',
    });

    const client = new LambdaClient({ region: AWS_S3_BUCKET_REGION });

    const isDev = process.env.NODE_ENV === 'development';

    const params: InvokeCommandInput = {
      FunctionName: isDev ? 'imageConvertFunction-dev' : 'imageConvertFunction',
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        s3ObjectKey, // 원본 이미지 파일의 S3 경로
        // destinationBucket: '', // 리사이즈된 이미지를 저장할 S3 버킷 이름
        // destinationPath: '', // 리사이즈된 이미지를 저장할 S3 경로
      }),
    };

    const command = new InvokeCommand(params);

    const data = await client.send(command);

    console.log('Lambda 호출 성공:', data.Payload);

    return JSON.parse(new TextDecoder('utf-8').decode(data.Payload));
  } catch (err) {
    console.error('Lambda 호출 실패:', err);
  }
};
