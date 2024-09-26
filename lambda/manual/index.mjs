import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import sharp from 'sharp';
import util from 'util';

/**
 * Define the handler function.
 * This handler function detects a change event in the s3 bucket and convert the image.
 * 🚨 The address of the srcBucket must be selected and compressed and distributed according to the dev or prod environment.
 */
export const handler = async (event, context) => {
  // Source image path received from lambdaManualImageConvert function
  const s3ObjectKeyFullUrl = event.s3ObjectKey;

  const s3 = new S3Client({ region: 'ap-northeast-2' });

  // ex) "https://toollit-image-dev-bucket.s3.ap-northeast-2.amazonaws.com/
  const srcBucketBaseUrl = s3ObjectKeyFullUrl.match(/^https:\/\/[^/]+\/?/)[0];

  // ex) "projectRepresentativeImage/14/1727097953040.jpeg"
  const objectKey = s3ObjectKeyFullUrl.replace(srcBucketBaseUrl, '');

  // Read options from the event parameter and get the source bucket
  console.log(
    'Reading options from event:\n',
    util.inspect(event, { depth: 5 })
  );

  // For dev environment
  const srcBucket = 'toollit-image-dev-bucket';

  // For prod environment
  // const srcBucket = 'toollit-image-bucket';

  const srcKey = decodeURIComponent(objectKey.replace(/\+/g, ' '));

  // Convert .jpg, .jpeg, .png extensions to .webp with regular expressions
  const convertObjectKeyExtensions = (objectKey) => {
    return objectKey.replace(/\.(jpg|jpeg|png)$/i, '.webp');
  };

  const dstBucket = srcBucket + '-resized';

  const dstKey = convertObjectKeyExtensions(srcKey);

  const dstBucketBaseUrl = srcBucketBaseUrl.replace(srcBucket, dstBucket);

  const dstObjectKeyUrl = dstBucketBaseUrl + dstKey;

  // Infer the image type from the file suffix
  const typeMatch = srcKey.match(/\.([^.]*)$/);
  if (!typeMatch) {
    console.log('Could not determine the image type.');
    return;
  }

  // Check that the image type is supported
  const imageType = typeMatch[1].toLowerCase();
  if (
    imageType != 'jpg' &&
    imageType != 'jpeg' &&
    imageType != 'png' &&
    imageType != 'webp'
  ) {
    console.log(`Unsupported image type: ${imageType}`);
    return;
  }

  // Get the image from the source bucket. GetObjectCommand returns a stream.
  try {
    const params = {
      Bucket: srcBucket,
      Key: srcKey,
    };
    var response = await s3.send(new GetObjectCommand(params));
    var stream = response.Body;

    // Convert stream to buffer to pass to sharp resize function.
    if (stream instanceof Readable) {
      var content_buffer = Buffer.concat(await stream.toArray());
    } else {
      throw new Error('Unknown object stream type');
    }
  } catch (err) {
    console.log(err);
    return;
  }

  // Set resizing image width and height. If the height is null or undefined, resize automatically while maintaining the ratio according to the width.
  let width;
  let height;

  // Project representative image size settings
  if (dstKey.includes('projectRepresentativeImage/')) {
    width = 324;
    height = 130;
  }

  // Project content image size settings
  if (dstKey.includes('projectContentImage/')) {
    width = 666;
    height = null;
  }

  // Profile image size settings
  if (dstKey.includes('profileImage/')) {
    width = 150;
    height = 150;
  }

  // Use the sharp module to resize the image and save in a buffer.
  try {
    var output_buffer = await sharp(content_buffer)
      .resize(width, height, { withoutEnlargement: true })
      .toFormat('webp', { quality: 100 })
      .toBuffer();
  } catch (err) {
    console.log(err);
    return;
  }

  // Upload the thumbnail image to the destination bucket
  // The dstKey should not start with a slash.
  try {
    const destParams = {
      Bucket: dstBucket,
      Key: dstKey,
      Body: output_buffer,
      ContentType: 'image/webp',
    };

    const putResult = await s3.send(new PutObjectCommand(destParams));
  } catch (err) {
    console.log(err);
    return;
  }

  console.log(
    `Successfully resized the image and changed the file extension to webp and uploaded it to the resized bucket. ${srcBucket}/${srcKey} => ${dstBucket}/${dstKey}`
  );
  console.log(`result image url: ${dstObjectKeyUrl}`);
};
