import {
  LambdaClient,
  InvokeCommand,
  InvokeCommandInput,
} from '@aws-sdk/client-lambda';
import { getParameterStore } from '@/utils/awsParameterStore';

/**
 * Function to manually call Lambda to resize and change format the image.
 * @param s3ObjectKey - S3 path of the original source image file.
 * @returns void
 */
export const lambdaManualImageConvert = async (s3ObjectKey: string) => {
  try {
    const AWS_S3_BUCKET_REGION = await getParameterStore({
      key: 'AWS_S3_BUCKET_REGION',
    });

    const client = new LambdaClient({ region: AWS_S3_BUCKET_REGION });

    const isDev = process.env.NODE_ENV === 'development';

    const params: InvokeCommandInput = {
      FunctionName: isDev ? 'imageConvertFunction-dev' : 'imageConvertFunction',
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ s3ObjectKey }),
    };

    const command = new InvokeCommand(params);

    const data = await client.send(command);

    console.log('Lambda 호출 성공:', data.Payload);

    return;
  } catch (err) {
    console.error('Lambda 호출 실패:', err);
  }
};
