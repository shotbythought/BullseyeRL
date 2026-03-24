"use client";

import { getAccessToken } from "@/lib/session/anonymous";

export async function authorizedJsonFetch<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const accessToken = await getAccessToken();
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });

  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload;
}
