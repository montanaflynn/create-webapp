"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import * as apiKeys from "@/lib/services/api-keys";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/services/errors";

async function requireUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  return session.user.id;
}

export type SerializedApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type CreateKeyResult =
  | { ok: true; secret: string; key: SerializedApiKey }
  | { ok: false; error: string };

export type RevokeKeyResult = { ok: true } | { ok: false; error: string };

export async function createKey(input: {
  name: string;
  scopes: string[];
}): Promise<CreateKeyResult> {
  const userId = await requireUserId();
  try {
    const { key, secret } = await apiKeys.createApiKey(userId, {
      name: input.name,
      // Service filters out anything that isn't a known scope.
      scopes: input.scopes as apiKeys.Scope[],
    });
    revalidatePath("/settings");
    return { ok: true, secret, key: serialize(key) };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
}

export async function revokeKey(id: string): Promise<RevokeKeyResult> {
  const userId = await requireUserId();
  try {
    await apiKeys.revokeApiKey(userId, id);
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    if (e instanceof NotFoundError) {
      return { ok: false, error: "Key not found." };
    }
    throw e;
  }
}

function serialize(k: apiKeys.ApiKey): SerializedApiKey {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
  };
}
