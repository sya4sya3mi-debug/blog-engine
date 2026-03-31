// ==========================================
// BlogEngine V2 - YouTube Captions (字幕取得)
// OAuth 2.0 + YouTube Data API v3 で字幕テキストを取得
// ==========================================

interface CaptionTrack {
  id: string;
  snippet: {
    language: string;
    name: string;
    trackKind: string; // "standard" | "ASR" (自動生成)
  };
}

interface CaptionListResponse {
  items?: CaptionTrack[];
  error?: { message: string; code: number };
}

/**
 * リフレッシュトークンからアクセストークンを取得
 */
async function getAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`OAuth token error: ${data.error} - ${data.error_description}`);
  }
  return data.access_token;
}

/**
 * YouTube動画の字幕テキストを取得
 */
export async function getYouTubeCaptions(
  videoId: string,
  config: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }
): Promise<{ text: string; language: string } | null> {
  try {
    // 1. アクセストークン取得
    const accessToken = await getAccessToken(
      config.clientId,
      config.clientSecret,
      config.refreshToken
    );

    // 2. 字幕トラック一覧を取得
    const listRes = await fetch(
      `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const listData: CaptionListResponse = await listRes.json();

    if (listData.error) {
      console.error(`[Captions] List error: ${listData.error.message}`);
      // 字幕取得が禁止されている場合はnullを返す（動画説明文で代替）
      return null;
    }

    if (!listData.items || listData.items.length === 0) {
      console.log(`[Captions] No captions available for ${videoId}`);
      return null;
    }

    // 3. 日本語字幕を優先、なければ自動生成字幕
    const jaTrack = listData.items.find(
      (t) => t.snippet.language === "ja" && t.snippet.trackKind === "standard"
    );
    const jaAutoTrack = listData.items.find(
      (t) => t.snippet.language === "ja" && t.snippet.trackKind === "ASR"
    );
    const enTrack = listData.items.find(
      (t) => t.snippet.language === "en"
    );
    const anyTrack = listData.items[0];

    const selectedTrack = jaTrack || jaAutoTrack || enTrack || anyTrack;
    if (!selectedTrack) return null;

    // 4. 字幕テキストをダウンロード
    const captionRes = await fetch(
      `https://www.googleapis.com/youtube/v3/captions/${selectedTrack.id}?tfmt=srt`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!captionRes.ok) {
      // 多くの動画で字幕ダウンロードが禁止されている
      console.log(`[Captions] Download blocked for ${videoId} (${captionRes.status})`);
      return null;
    }

    const srtText = await captionRes.text();
    const cleanText = parseSrtToPlainText(srtText);

    return {
      text: cleanText.slice(0, 5000), // 最大5000文字に制限
      language: selectedTrack.snippet.language,
    };
  } catch (err) {
    console.error(`[Captions] Error for ${videoId}:`, err);
    return null;
  }
}

/**
 * YouTube動画の説明文とメタデータを取得（字幕が取れない場合の代替）
 */
export async function getVideoDetails(
  videoId: string,
  apiKey: string
): Promise<{
  title: string;
  description: string;
  channelTitle: string;
  tags: string[];
  viewCount: string;
  publishedAt: string;
} | null> {
  try {
    const params = new URLSearchParams({
      part: "snippet,statistics",
      id: videoId,
      key: apiKey,
    });

    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${params}`
    );

    if (!res.ok) return null;

    const data = await res.json();
    const item = data.items?.[0];
    if (!item) return null;

    return {
      title: item.snippet.title,
      description: item.snippet.description || "",
      channelTitle: item.snippet.channelTitle,
      tags: item.snippet.tags || [],
      viewCount: item.statistics?.viewCount || "0",
      publishedAt: item.snippet.publishedAt,
    };
  } catch {
    return null;
  }
}

/**
 * SRTフォーマットをプレーンテキストに変換
 */
function parseSrtToPlainText(srt: string): string {
  return srt
    .replace(/\d+\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\n/g, "") // タイムスタンプ除去
    .replace(/<[^>]+>/g, "") // HTMLタグ除去
    .replace(/\n{2,}/g, "\n") // 連続改行を1つに
    .trim();
}

/**
 * YouTube動画から記事生成用のコンテキストを構築
 * 字幕が取れれば字幕ベース、取れなければ説明文ベース
 */
export async function buildVideoContext(
  videoId: string,
  config: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    apiKey: string;
  }
): Promise<string> {
  let context = "";

  // 1. 動画メタデータは必ず取得
  const details = await getVideoDetails(videoId, config.apiKey);
  if (!details) return "";

  context += `【動画情報】\n`;
  context += `タイトル: ${details.title}\n`;
  context += `チャンネル: ${details.channelTitle}\n`;
  context += `再生回数: ${Number(details.viewCount).toLocaleString()}回\n`;
  context += `公開日: ${new Date(details.publishedAt).toLocaleDateString("ja-JP")}\n`;

  if (details.tags.length > 0) {
    context += `タグ: ${details.tags.slice(0, 10).join(", ")}\n`;
  }

  if (details.description) {
    context += `\n【動画説明文】\n${details.description.slice(0, 2000)}\n`;
  }

  // 2. OAuth設定があれば字幕取得を試みる
  if (config.clientId && config.clientSecret && config.refreshToken) {
    const captions = await getYouTubeCaptions(videoId, {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: config.refreshToken,
    });

    if (captions) {
      context += `\n【字幕テキスト（${captions.language}）】\n${captions.text}\n`;
    }
  }

  return context;
}
