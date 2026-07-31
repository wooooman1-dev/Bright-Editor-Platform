import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PlatformConnection, SecretStore } from "../../../core/connections";
import type { PublicPostCandidate } from "../../../core/content";
import { PublishingPermissionGate } from "../../../core/publishing";
import {
  WordPressPostCatalogAdapter,
  type WordPressPublishedPostCatalogResult,
} from "../../../apps/wordpress/WordPressPostCatalogAdapter";
import { secretStore } from "../connections/connection-runtime";
import {
  PublicPostCatalogError,
  publicPostCatalogErrorMessage,
} from "./PublicPostCatalogError";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type WordPressPostCatalogResult = Readonly<{
  platform: "wordpress";
  platformConnectionId: string;
  state: "success" | "empty";
  posts: readonly PublicPostCandidate[];
  retrievedAt: string;
  warnings: readonly string[];
  cached: boolean;
}>;

export class WordPressPostCatalogApplicationService {
  constructor(
    private readonly adapter = new WordPressPostCatalogAdapter(),
    private readonly secrets: SecretStore = secretStore,
    private readonly root = path.join(process.cwd(), ".bright-studio"),
    private readonly now = () => new Date(),
  ) {}

  async read(input: Readonly<{
    workspaceId: string;
    projectId: string;
    contentId: string;
    connection: PlatformConnection;
    selectedTarget: boolean;
    selectedCategories: readonly Readonly<{ id: string; name: string }>[];
    refresh?: boolean;
  }>): Promise<WordPressPostCatalogResult> {
    try {
      if (!input.selectedTarget) {
        throw new PublicPostCatalogError({
          platform: "wordpress",
          state: "permission_denied",
          message: "선택한 계정은 이 콘텐츠의 발행 대상이 아닙니다.",
        });
      }
      if (input.connection.platform !== "wordpress") {
        throw new PublicPostCatalogError({
          platform: "wordpress",
          state: "connection_error",
          message: "워드프레스 계정이 필요합니다.",
        });
      }

      try {
        new PublishingPermissionGate().authorize({
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          contentId: input.contentId,
          platformConnectionId: input.connection.id,
          workflow: "post.read",
          finalConfirmation: false,
        }, input.connection);
      } catch (error) {
        throw new PublicPostCatalogError({
          platform: "wordpress",
          state: "permission_denied",
          message: publicPostCatalogErrorMessage(error),
          remediation: "워드프레스 연결 계정의 공개 글 조회 권한을 확인해 주세요.",
        });
      }

      const siteUrl = publicString(input.connection, "siteUrl");
      const username = publicString(input.connection, "username");
      if (!siteUrl || !username || !input.connection.secretReference) {
        throw reconnectRequiredError();
      }

      const cachePath = this.cachePath(input.workspaceId, input.connection.id);
      let raw: WordPressPublishedPostCatalogResult | undefined;
      let cached = false;
      if (!input.refresh) {
        const candidate = await readCache(cachePath);
        if (candidate
          && this.now().getTime() - Date.parse(candidate.retrievedAt) < CACHE_TTL_MS) {
          raw = candidate;
          cached = true;
        }
      }

      if (!raw) {
        let applicationPassword: string;
        try {
          applicationPassword = await this.secrets.readSecret(
            input.connection.secretReference,
          );
        } catch {
          throw reconnectRequiredError();
        }
        if (!applicationPassword.trim()) {
          throw reconnectRequiredError();
        }

        raw = await this.adapter.listAllPublishedPosts({
          siteUrl,
          username,
          applicationPassword,
          platformConnectionId: input.connection.id,
          pageSize: 100,
        });
        await mkdir(path.dirname(cachePath), { recursive: true });
        await writeFile(cachePath, JSON.stringify(raw), "utf8");
      }

      const selectedCategories = new Map(
        input.selectedCategories.map((category) => [category.id, category.name]),
      );
      const candidates: PublicPostCandidate[] = [];
      for (const post of raw.posts) {
        for (const categoryId of post.categoryIds) {
          const categoryName = selectedCategories.get(categoryId);
          if (!categoryName) continue;
          candidates.push(Object.freeze({
            externalPostId: post.externalPostId,
            title: post.title,
            publishedUrl: post.publishedUrl,
            categoryId,
            categoryName,
            ...(post.publishedAt ? { publishedAt: post.publishedAt } : {}),
            ...(post.excerpt ? { excerpt: post.excerpt } : {}),
          }));
        }
      }

      return Object.freeze({
        platform: "wordpress",
        platformConnectionId: input.connection.id,
        state: candidates.length ? "success" : "empty",
        posts: Object.freeze(candidates),
        retrievedAt: raw.retrievedAt,
        warnings: raw.warnings,
        cached,
      });
    } catch (error) {
      if (error instanceof PublicPostCatalogError) throw error;
      const detail = publicPostCatalogErrorMessage(error);
      if (/authentication|permission verification failed/i.test(detail)) {
        throw new PublicPostCatalogError({
          platform: "wordpress",
          state: "session_expired",
          message: "워드프레스 인증 또는 공개 글 조회 권한을 다시 확인해 주세요.",
          remediation: "애플리케이션 비밀번호와 공개 글 조회 권한을 확인한 뒤 워드프레스 계정을 다시 연결해 주세요.",
          reconnectRequired: true,
        });
      }
      throw new PublicPostCatalogError({
        platform: "wordpress",
        state: "connection_error",
        message: detail,
        remediation: "워드프레스 연결 상태를 확인한 뒤 다시 시도해 주세요.",
      });
    }
  }

  private cachePath(workspaceId: string, connectionId: string): string {
    return path.join(
      this.root,
      "cache",
      "wordpress-posts",
      safe(workspaceId),
      `${safe(connectionId)}.json`,
    );
  }
}

function reconnectRequiredError(): PublicPostCatalogError {
  return new PublicPostCatalogError({
    platform: "wordpress",
    state: "session_expired",
    message: "워드프레스 연결을 다시 확인해 주세요.",
    remediation: "설정의 플랫폼 연결에서 워드프레스 계정을 다시 연결해 주세요.",
    reconnectRequired: true,
  });
}

async function readCache(
  file: string,
): Promise<WordPressPublishedPostCatalogResult | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as WordPressPublishedPostCatalogResult;
  } catch {
    return undefined;
  }
}

function publicString(
  connection: PlatformConnection,
  key: string,
): string | undefined {
  const value = connection.publicMetadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
