import {
  S3Client,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export class R2Adapter {
  constructor(options = {}) {
    this.options = {
      accountId: options.accountId ?? "",
      accessKeyId: options.accessKeyId ?? "",
      secretAccessKey: options.secretAccessKey ?? "",
      bucket: options.bucket ?? "",
      endpoint:
        options.endpoint ??
        (options.accountId ? `https://${options.accountId}.r2.cloudflarestorage.com` : ""),
      publicBaseUrl: options.publicBaseUrl ?? "",
      signedUrlTtlSec: Number(options.signedUrlTtlSec ?? 900)
    };

    this.client = this.isConfigured()
      ? new S3Client({
          region: "auto",
          endpoint: this.options.endpoint,
          credentials: {
            accessKeyId: this.options.accessKeyId,
            secretAccessKey: this.options.secretAccessKey
          }
        })
      : null;
  }

  isConfigured() {
    return Boolean(
      this.options.accountId &&
        this.options.accessKeyId &&
        this.options.secretAccessKey &&
        this.options.bucket &&
        this.options.endpoint
    );
  }

  ensureConfigured() {
    if (!this.isConfigured() || !this.client) {
      const error = new Error("Cloudflare R2 is not configured on server.");
      error.code = "R2_NOT_CONFIGURED";
      throw error;
    }
  }

  buildObjectKey(saveId, filename) {
    const safeName = String(filename || "backup.bsave").replace(/[^a-zA-Z0-9_.-]/g, "_");
    return `saves/${saveId}/${safeName}`;
  }

  buildManifestKey(saveId) {
    return `saves/${saveId}/meta.json`;
  }

  async getUploadDescriptor(saveMeta) {
    this.ensureConfigured();
    const key = saveMeta.objectKey;
    const contentType = saveMeta.contentType || "application/x-encrypted-tab-session";
    const command = new PutObjectCommand({
      Bucket: this.options.bucket,
      Key: key,
      ContentType: contentType
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: this.options.signedUrlTtlSec
    });
    return {
      method: "PUT",
      url,
      headers: {
        "Content-Type": contentType
      },
      expiresAt: new Date(Date.now() + this.options.signedUrlTtlSec * 1000).toISOString(),
      objectKey: key
    };
  }

  async getDownloadDescriptor(saveMeta) {
    this.ensureConfigured();
    const key = saveMeta.objectKey;
    const command = new GetObjectCommand({
      Bucket: this.options.bucket,
      Key: key
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: this.options.signedUrlTtlSec
    });
    return {
      method: "GET",
      url,
      headers: {},
      expiresAt: new Date(Date.now() + this.options.signedUrlTtlSec * 1000).toISOString(),
      objectKey: key
    };
  }

  async deleteObject(saveMeta) {
    if (!this.isConfigured() || !saveMeta?.objectKey) {
      return;
    }
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.options.bucket,
          Key: saveMeta.objectKey
        })
      );
    } catch (error) {
      if (error?.name !== "NoSuchKey") {
        throw error;
      }
    }
  }

  async deleteObjects(keys) {
    this.ensureConfigured();
    const filtered = Array.from(new Set((keys ?? []).filter(Boolean)));
    if (filtered.length === 0) {
      return;
    }
    if (filtered.length === 1) {
      await this.deleteObject({ objectKey: filtered[0] });
      return;
    }
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.options.bucket,
        Delete: {
          Objects: filtered.map((key) => ({ Key: key })),
          Quiet: true
        }
      })
    );
  }

  async putJsonObject(key, value) {
    this.ensureConfigured();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        ContentType: "application/json",
        Body: JSON.stringify(value)
      })
    );
  }

  async getJsonObject(key) {
    this.ensureConfigured();
    try {
      const output = await this.client.send(
        new GetObjectCommand({
          Bucket: this.options.bucket,
          Key: key
        })
      );
      const text = await output.Body?.transformToString?.();
      if (!text) {
        return null;
      }
      return JSON.parse(text);
    } catch (error) {
      const keyMissing = error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404;
      if (keyMissing) {
        return null;
      }
      throw error;
    }
  }

  async listManifestKeys(prefix = "saves/") {
    this.ensureConfigured();
    const out = [];
    let continuationToken = undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.options.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken
        })
      );
      const keys = (page.Contents ?? [])
        .map((item) => item.Key)
        .filter((key) => typeof key === "string" && key.endsWith("/meta.json"));
      out.push(...keys);
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return out;
  }
}
