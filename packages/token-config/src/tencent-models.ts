import { createHash, createHmac } from "node:crypto";
import { TokenConfigError, fail } from "./errors.js";
import { isRecord } from "./json-file.js";
import type { TokenProfileModel } from "./types.js";

const host = "tokenhub.tencentcloudapi.com";
const service = "tokenhub";
const action = "DescribeModelList";
const version = "2026-03-22";
const contentType = "application/json; charset=utf-8";
const pageSize = 100;

export type TencentFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

async function defaultFetch(
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
  const response = await fetch(input, init);
  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json() as Promise<unknown>,
  };
}

let tencentFetch: TencentFetch = defaultFetch;

export function setTencentFetch(fn: TencentFetch | undefined): void {
  tencentFetch = fn ?? defaultFetch;
}

function sha256Hex(message: string): string {
  return createHash("sha256").update(message, "utf8").digest("hex");
}

function hmac(key: Buffer | string, message: string): Buffer {
  return createHmac("sha256", key).update(message, "utf8").digest();
}

function authorization(
  secretId: string,
  secretKey: string,
  timestamp: number,
  payload: string,
): string {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const hashedPayload = sha256Hex(payload);
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join("\n");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const secretDate = hmac(`TC3${secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = createHmac("sha256", secretSigning)
    .update(stringToSign, "utf8")
    .digest("hex");
  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function tencentCredentials(): {
  secretId: string;
  secretKey: string;
  region: string;
} {
  const secretId = process.env.TENCENTCLOUD_SECRET_ID?.trim();
  const secretKey = process.env.TENCENTCLOUD_SECRET_KEY?.trim();
  if (!secretId || !secretKey) {
    fail("缺少 TENCENTCLOUD_SECRET_ID 或 TENCENTCLOUD_SECRET_KEY");
  }
  const region = process.env.TENCENTCLOUD_REGION?.trim() || "ap-guangzhou";
  return { secretId, secretKey, region };
}

function mapModels(set: unknown): TokenProfileModel[] {
  if (!Array.isArray(set)) {
    fail("无法解析腾讯云模型列表响应");
  }

  const models: TokenProfileModel[] = [];
  for (const item of set) {
    if (!isRecord(item)) {
      continue;
    }
    const id = item.ModelId;
    if (typeof id !== "string" || id.trim() === "") {
      continue;
    }
    const displayName = item.DisplayName;
    const modelName = item.ModelName;
    const name =
      typeof displayName === "string" && displayName.trim() !== ""
        ? displayName.trim()
        : typeof modelName === "string" && modelName.trim() !== ""
          ? modelName.trim()
          : id.trim();
    models.push({ id: id.trim(), name });
  }
  return models;
}

async function describePage(
  offset: number,
): Promise<{ models: TokenProfileModel[]; rawCount: number; total: number }> {
  const { secretId, secretKey, region } = tencentCredentials();
  const payload = JSON.stringify({ Limit: pageSize, Offset: offset });
  const timestamp = Math.floor(Date.now() / 1000);

  let parsed: unknown;
  try {
    const response = await tencentFetch(`https://${host}/`, {
      method: "POST",
      headers: {
        Authorization: authorization(secretId, secretKey, timestamp, payload),
        "Content-Type": contentType,
        Host: host,
        "X-TC-Action": action,
        "X-TC-Timestamp": String(timestamp),
        "X-TC-Version": version,
        "X-TC-Region": region,
      },
      body: payload,
    });
    if (!response.ok) {
      fail(`请求腾讯云模型列表失败: HTTP ${response.status}`);
    }
    parsed = await response.json();
  } catch (error) {
    if (error instanceof TokenConfigError) {
      throw error;
    }
    fail("请求腾讯云模型列表失败");
  }

  if (!isRecord(parsed)) {
    fail("无法解析腾讯云模型列表响应");
  }
  const body = parsed.Response;
  if (!isRecord(body)) {
    fail("无法解析腾讯云模型列表响应");
  }
  if (isRecord(body.Error)) {
    const message =
      typeof body.Error.Message === "string" && body.Error.Message.trim() !== ""
        ? body.Error.Message
        : "未知错误";
    fail(`请求腾讯云模型列表失败: ${message}`);
  }

  const total = body.TotalCount;
  if (typeof total !== "number" || !Number.isFinite(total)) {
    fail("无法解析腾讯云模型列表响应");
  }

  const set = body.ModelSet;
  if (!Array.isArray(set)) {
    fail("无法解析腾讯云模型列表响应");
  }

  return { models: mapModels(set), rawCount: set.length, total };
}

export async function fetchTencentModels(): Promise<TokenProfileModel[]> {
  tencentCredentials();

  const models: TokenProfileModel[] = [];
  let offset = 0;
  while (true) {
    const page = await describePage(offset);
    models.push(...page.models);
    offset += page.rawCount;
    if (page.rawCount === 0 || offset >= page.total) {
      break;
    }
  }

  if (models.length === 0) {
    fail("腾讯云模型列表为空");
  }
  return models;
}
