// ==========================================
// BlogEngine V2 - WordPress REST API Client
// ==========================================

interface WPPostPayload {
  title: string;
  content: string;
  status: "draft" | "publish";
  slug?: string;
  categories?: number[];
  tags?: number[];
  meta?: Record<string, string>;
}

interface WPPostResponse {
  id: number;
  link: string;
  status: string;
  title: { rendered: string };
}

export class WordPressClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(siteUrl: string, username: string, appPassword: string) {
    this.baseUrl = siteUrl.replace(/\/+$/, "");
    this.authHeader = "Basic " + Buffer.from(`${username}:${appPassword}`).toString("base64");
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

  /** 最近の投稿を取得 */
  async getRecentPosts(count: number = 10): Promise<WPPostResponse[]> {
    return this.request(`/posts?per_page=${count}&orderby=date&order=desc&status=any`);
  }
}
