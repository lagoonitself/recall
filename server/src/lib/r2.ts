import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';

export function createR2(env: NodeJS.ProcessEnv = process.env) {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env;
  const bucket = env.R2_BUCKET || 'recall-files';
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY)
    throw new Error('R2 credentials are required');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  return {
    signPut: (key: string, contentType: string, contentLength: number) =>
      getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: contentType,
          ContentLength: contentLength,
        }),
        { expiresIn: 600, signableHeaders: new Set(['content-type', 'content-length']) },
      ),
    signGet: (key: string, ttl = 600) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttl }),
    head: (key: string) => client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
    getStream: async (key: string) =>
      (await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))).Body as Readable,
    put: (key: string, body: Buffer | Readable, contentType: string) =>
      client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })),
    deletePrefix: async (prefix: string) => {
      let token: string | undefined;
      do {
        const result = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
        );
        const objects = (result.Contents ?? []).flatMap(({ Key }) => (Key ? [{ Key }] : []));
        if (objects.length) {
          const deleted = await client.send(
            new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }),
          );
          if (deleted.Errors?.length) throw new Error('R2 object deletion failed');
        }
        token = result.NextContinuationToken;
      } while (token);
    },
  };
}
export type R2 = ReturnType<typeof createR2>;
