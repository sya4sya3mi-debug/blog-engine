// ==========================================
// BlogEngine V2 - WordPress REST API Client
// ==========================================

interface WPPostPayload {
  title: string;
  content: string;
  status: "draft" | "publish" | "future";
  date?: string;
  slug?: string;
  categories?: number[];
  tags?: number[];
  meta?: Record<string, string>;
  featured_media?: number;
}

interface WPPostResponse {
  id: number;
  link: string;
  status: string;
  slug: string;
  title: { rendered: string };
  featured_media?: number;
}

export class WordPressClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(siteUrl: string, username: string, appPassword: string) {
    this.baseUrl = siteUrl.replace(/\/+$/, "");
    // Edge Runtime対応: btoa()を使用（Buffer.fromはEdgeで使えない場合がある）
    this.authHeader = "Basic " + (typeof btoa !== "undefined"
      ? btoa(`${username}:${appPassword}`)
      : Buffer.from(`${username}:${appPassword}`).toString("base64"));
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/wp-json/wp/v2${endpoint}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authHeader,
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WordPress API error (${res.status}): ${body}`);
    }

    return res.json() as Promise<T>;
  }

  /** 記事を投稿する */
  async createPost(payload: WPPostPayload): Promise<WPPostResponse> {
    return this.request<WPPostResponse>("/posts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /** 既存記事を更新する */
  async updatePost(postId: number, payload: Partial<WPPostPayload>): Promise<WPPostResponse> {
    return this.request<WPPostResponse>(`/posts/${postId}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /** カテゴリ一覧を取得 */
  async getCategories(): Promise<{ id: number; name: string; slug: string }[]> {
    return this.request("/categories?per_page=100");
  }

  /** カテゴリをスラッグで検索、なければ作成 */
  async findOrCreateCategory(name: string, slug: string): Promise<number> {
    const cats = await this.request<{ id: number; slug: string }[]>(
      `/categories?slug=${encodeURIComponent(slug)}`
    );
    if (cats.length > 0) return cats[0].id;

    const created = await this.request<{ id: number }>("/categories", {
      method: "POST",
      body: JSON.stringify({ name, slug }),
    });
    return created.id;
  }

  /** タグをスラッグで検索、なければ作成 */
  async findOrCreateTag(name: string): Promise<number> {
    const slug = encodeURIComponent(name);
    const tags = await this.request<{ id: number }[]>(`/tags?search=${slug}`);
    const exact = tags.find((t: any) => t.name === name);
    if (exact) return exact.id;

    const created = await this.request<{ id: number }>("/tags", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    return created.id;
  }

  /** 複数タグを一括で検索/作成 */
  async findOrCreateTags(names: string[]): Promise<number[]> {
    const ids: number[] = [];
    for (const name of names) {
      try {
        const id = await this.findOrCreateTag(name);
        ids.push(id);
      } catch {
        // タグ作成失敗は無視して続行
      }
    }
    return ids;
  }

  /** 既存タグのみを検索（新規作成しない） */
  async findExistingTag(name: string): Promise<number | null> {
    const tags = await this.request<{ id: number; name: string }[]>(
      `/tags?search=${encodeURIComponent(name)}`
    );
    const exact = tags.find((t) => t.name === name);
    return exact ? exact.id : null;
  }

  /** 複数タグを既存のみで検索（新規作成しない・許可リストでフィルタ） */
  async findExistingTags(names: string[], allowlist?: string[]): Promise<number[]> {
    const filtered = allowlist
      ? names.filter((n) => allowlist.includes(n))
      : names;
    const ids: number[] = [];
    for (const name of filtered) {
      try {
        const id = await this.findExistingTag(name);
        if (id !== null) ids.push(id);
      } catch {
        // 検索失敗は無視して続行
      }
    }
    return ids;
  }

  /** 接続テスト */
  async testConnection(): Promise<{ ok: boolean; name?: string; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/wp-json/wp/v2/users/me`, {
        headers: { Authorization: this.authHeader },
      });
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }
      const user = (await res.json()) as { name: string };
      return { ok: true, name: user.name };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  /** ユーザーのGravatar URLと名前を取得 */
  async getAuthorProfile(): Promise<{ name: string; avatarUrl: string }> {
    const res = await fetch(`${this.baseUrl}/wp-json/wp/v2/users/me?context=edit`, {
      headers: { Authorization: this.authHeader },
    });
    if (!res.ok) throw new Error(`プロフィール取得失敗 (${res.status})`);
    const user = (await res.json()) as { name: string; avatar_urls?: Record<string, string> };
    const avatarUrl = (user.avatar_urls?.["96"] || user.avatar_urls?.["48"] || "").replace(/^http:\/\//i, "https://");
    return { name: user.name, avatarUrl };
  }

  /** 最近の投稿を取得 */
  async getRecentPosts(count: number = 10): Promise<WPPostResponse[]> {
    return this.request(`/posts?per_page=${count}&orderby=date&order=desc&status=any`);
  }

  /** 画像URLからWordPressメディアライブラリにアップロード */
  async uploadMediaFromUrl(
    imageUrl: string,
    filename: string,
    altText: string,
  ): Promise<{ id: number; url: string }> {
    // 1. DALL-E の一時URLから画像バイナリを取得
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      throw new Error(`画像のダウンロードに失敗しました (${imageRes.status})`);
    }
    const imageBuffer = await imageRes.arrayBuffer();

    // 2. WordPress REST API にアップロード
    const url = `${this.baseUrl}/wp-json/wp/v2/media`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${filename}"`,
        Authorization: this.authHeader,
      },
      body: imageBuffer,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WordPress メディアアップロードエラー (${res.status}): ${body}`);
    }

    const media = (await res.json()) as { id: number; source_url: string };

    // 3. alt テキストを設定
    try {
      await this.request(`/media/${media.id}`, {
        method: "POST",
        body: JSON.stringify({ alt_text: altText }),
      });
    } catch {
      // alt設定失敗は無視
    }

    return { id: media.id, url: media.source_url };
  }

  /** ArrayBufferからWordPressメディアライブラリにアップロード（写真用） */
  async uploadMediaFromBuffer(
    buffer: ArrayBuffer,
    filename: string,
    altText: string,
    contentType: string = "image/jpeg",
  ): Promise<{ id: number; url: string }> {
    const url = `${this.baseUrl}/wp-json/wp/v2/media`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        Authorization: this.authHeader,
      },
      body: buffer,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WordPress メディアアップロードエラー (${res.status}): ${body}`);
    }

    const media = (await res.json()) as { id: number; source_url: string };

    try {
      await this.request(`/media/${media.id}`, {
        method: "POST",
        body: JSON.stringify({ alt_text: altText }),
      });
    } catch {}

    return { id: media.id, url: media.source_url };
  }

  /** キーワードで既存投稿を検索（内部リンク用） */
  async searchPosts(keyword: string, count: number = 5): Promise<{ id: number; link: string; title: string; slug: string }[]> {
    const posts = await this.request<{ id: number; link: string; title: { rendered: string }; slug: string }[]>(
      `/posts?search=${encodeURIComponent(keyword)}&per_page=${count}&status=publish`
    );
    return posts.map((p) => ({
      id: p.id,
      link: p.link,
      title: p.title?.rendered || "",
      slug: p.slug || "",
    }));
  }
}
