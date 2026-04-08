// ==========================================
// BlogEngine V2 - X (Twitter) Auto Poster
// OAuth 1.0a + API v2 POST /2/tweets
// Edge Runtime対応（Web Crypto API使用）
// ==========================================

export interface XPostResult {
  success: boolean;
  tweetId?: string;
  tweetUrl?: string;
  error?: string;
}

interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

// ----- OAuth 1.0a 署名生成（Edge Runtime対応） -----

/** パーセントエンコード（RFC 3986準拠） */
function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

/** HMAC-SHA1 署名を生成（Web Crypto API） */
async function hmacSha1(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  // ArrayBuffer → Base64
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** ランダムなnonce文字列を生成 */
function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(36)).join("").slice(0, 32);
}

/** OAuth 1.0a Authorization ヘッダーを生成 */
async function buildOAuthHeader(
  method: string,
  url: string,
  creds: XCredentials,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  // 署名ベース文字列の構築
  const sortedParams = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`)
    .join("&");

  const signatureBase = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(sortedParams)}`;
  const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.accessTokenSecret)}`;

  const signature = await hmacSha1(signingKey, signatureBase);
  oauthParams.oauth_signature = signature;

  // Authorization ヘッダー組み立て
  const headerParts = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
    .join(", ");

  return `OAuth ${headerParts}`;
}

// ----- ツイート投稿 -----

// ==========================================
// ブックマーク率向上：投稿パターン定義
// ==========================================

export type TweetStyle =
  | "save-list"     // 【保存版】リスト型
  | "must-know"     // 知らないと損型
  | "conclusion"    // 結論ファースト型
  | "compare"       // 比較表型
  | "checklist"     // チェックリスト型
  | "surprise"      // 意外な事実型
  | "seasonal"      // 季節・時期フック型
  | "empathy"       // 悩み共感→解決型
  | "auto";         // 日替わり自動選択

export type TweetLength = "short" | "long";

export interface TweetStyleInfo {
  id: TweetStyle;
  label: string;
  description: string;
}

export const TWEET_STYLES: TweetStyleInfo[] = [
  { id: "save-list", label: "保存版", description: "【保存版】リスト型" },
  { id: "must-know", label: "知らないと損", description: "知らないと損する〇〇" },
  { id: "conclusion", label: "結論先行", description: "結論ファースト型" },
  { id: "compare", label: "比較表", description: "〇〇 vs △△ 比較型" },
  { id: "checklist", label: "チェックリスト", description: "✅チェックリスト型" },
  { id: "surprise", label: "意外な事実", description: "意外と知らない〇〇" },
  { id: "seasonal", label: "季節", description: "今の時期こそ大事！" },
  { id: "empathy", label: "悩み共感", description: "〇〇で悩んでいませんか？" },
  { id: "auto", label: "AI自動", description: "日替わり自動選択" },
];

/**
 * ブックマークされやすいツイート文面を生成する
 * パターン指定 + 短文/長文切り替え対応
 */
export function buildBookmarkableTweet(
  title: string,
  url: string,
  opts: {
    metaDescription?: string;
    tags?: string[];
    style?: TweetStyle;
    length?: TweetLength;
    articleSummary?: string;
  } = {},
): string {
  const { metaDescription, tags, style = "auto", length = "short" } = opts;
  const allTags = selectBeautyHashtags(title, tags || []);
  const hashtags = allTags.slice(0, 2).join(" ");
  const desc = opts.articleSummary || metaDescription || "";
  const isLong = length === "long";
  const maxLen = isLong ? 800 : 280;

  // スタイル別の生成関数
  const shortPatterns: Record<Exclude<TweetStyle, "auto">, (t: string, d: string) => string> = {
    "save-list": (t, d) =>
      `【保存版】${t}\n\n${d ? d.slice(0, 80) : "気になるポイントをまとめました"}\n\n🔖ブックマークしておくと便利です`,
    "must-know": (t, d) =>
      `知らないと損する${t}の事実\n\n${d ? "✅ " + d.slice(0, 70) : "✅ 調べてみたら意外な発見がありました"}\n\nブックマーク推奨🔖`,
    "conclusion": (t, d) =>
      `結論：${d ? d.slice(0, 80) : t}\n\n理由はブログで詳しく解説しています✍️`,
    "compare": (t, d) =>
      `${t}\n\n${d ? d.slice(0, 70) : "成分・価格・口コミで比較してみました"}\n\n🔖比較結果を保存しておくと便利`,
    "checklist": (t, d) =>
      `✅${t}チェックリスト\n\n${d ? d.slice(0, 70) : "押さえておきたいポイントをまとめました"}\n\n🔖あとで見返す用に保存👆`,
    "surprise": (t, d) =>
      `意外と知らない${t}の事実\n\n${d ? d.slice(0, 80) : "調べてみたら驚きの発見がありました"}`,
    "seasonal": (t, d) =>
      `今の時期こそ大事！${t}\n\n${d ? d.slice(0, 70) : "このタイミングで知っておきたい情報をまとめました"}`,
    "empathy": (t, d) =>
      `${t}で悩んでいませんか？\n\n${d ? d.slice(0, 70) : "口コミや成分を調べてまとめてみました"}\n\n気になる方はプロフから👆`,
  };

  const longPatterns: Record<Exclude<TweetStyle, "auto">, (t: string, d: string) => string> = {
    "save-list": (t, d) =>
      `【保存版】${t}\n\n${d ? d.slice(0, 200) : "気になって徹底的に調べてみました。\n\nポイントをまとめたので、参考にしてみてください。"}\n\n🔖ブックマークしておくと、あとで見返すときに便利です\n\n詳しい解説はブログにまとめています✍️`,
    "must-know": (t, d) =>
      `知らないと損する${t}の事実\n\n${d ? d.slice(0, 200) : "調べてみたら意外なことがたくさんわかりました。"}\n\n✅ 成分や口コミを徹底リサーチ\n✅ 意外と見落としがちなポイントも\n\n🔖この投稿、保存しておくと便利です`,
    "conclusion": (t, d) =>
      `結論から言うと…\n\n${d ? d.slice(0, 200) : t + "について調べた結果をまとめました。"}\n\nなぜそう言えるのか、理由はブログで詳しく解説しています✍️\n\n気になる方はプロフのリンクからどうぞ👆`,
    "compare": (t, d) =>
      `${t}\n\n${d ? d.slice(0, 200) : "成分・価格・口コミで徹底比較してみました。"}\n\n📊 価格帯は？\n📊 成分の違いは？\n📊 口コミ評価は？\n\n🔖比較結果を保存しておくと買い物のときに便利です`,
    "checklist": (t, d) =>
      `✅${t}チェックリスト\n\n${d ? d.slice(0, 200) : "押さえておきたいポイントを調べてまとめました。"}\n\n☑️ まずは基本をチェック\n☑️ 成分表も確認\n☑️ 口コミで実際の評判を調査\n\n🔖あとで見返す用にブックマーク推奨👆`,
    "surprise": (t, d) =>
      `意外と知らない${t}の事実\n\n${d ? d.slice(0, 200) : "調べてみたら驚きの発見がたくさんありました。"}\n\n口コミや成分を調べていくうちに、思っていたのと違う部分が見えてきました。\n\n詳しくはブログにまとめています✍️`,
    "seasonal": (t, d) =>
      `今の時期こそ大事！${t}\n\n${d ? d.slice(0, 200) : "このタイミングで知っておきたい情報を調べてまとめました。"}\n\n季節の変わり目は肌トラブルが増えがち。\n早めの対策が大切です💡\n\n🔖保存して参考にしてみてください`,
    "empathy": (t, d) =>
      `${t}で悩んでいませんか？\n\n${d ? d.slice(0, 200) : "同じ悩みを持つ方の口コミや、成分の観点から調べてみました。"}\n\n一人で悩まず、まずは情報収集から始めてみるのがおすすめです💡\n\n詳しくはプロフのリンクからどうぞ👆`,
  };

  // auto の場合は日替わりでスタイルを選択
  let selectedStyle: Exclude<TweetStyle, "auto"> = style === "auto"
    ? (["save-list", "must-know", "conclusion", "compare", "checklist", "surprise", "seasonal", "empathy"] as const)[new Date().getDate() % 8]
    : style;

  const patterns = isLong ? longPatterns : shortPatterns;
  let tweet = patterns[selectedStyle](title, desc);

  // ハッシュタグ追加
  tweet = `${tweet}\n\n${hashtags}`;

  // 文字数制限
  if (tweet.length > maxLen) {
    if (isLong) {
      // 長文は800文字に収める
      tweet = `${patterns[selectedStyle](title, desc.slice(0, 100))}\n\n${hashtags}`;
    } else {
      // 短文フォールバック
      tweet = `${title}\n\n🔖ブックマークしておくと便利です\n\n${hashtags}`;
    }
  }
  if (!isLong && tweet.length > 280) {
    tweet = `${title}\n\n🔖保存推奨`;
  }

  return tweet.trim();
}

/**
 * 後方互換: 旧buildTweetText()のラッパー
 */
export function buildTweetText(
  title: string,
  url: string,
  metaDescription?: string,
  tags?: string[],
): string {
  return buildBookmarkableTweet(title, url, { metaDescription, tags, style: "auto", length: "short" });
}

/**
 * AI生成版: 記事内容からブックマーク向けツイート文を生成
 */
export async function generateAiTweetText(
  anthropicApiKey: string,
  articleTitle: string,
  articleContent: string,
  opts: { style?: TweetStyle; length?: TweetLength } = {},
): Promise<string> {
  const { style = "auto", length = "short" } = opts;
  const isLong = length === "long";
  const maxLen = isLong ? 800 : 280;

  const styleInstruction = style === "auto"
    ? "最適なパターンを選んでください"
    : `「${TWEET_STYLES.find(s => s.id === style)?.description || style}」パターンで作成してください`;

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: anthropicApiKey });

    // 記事HTMLからテキストを抽出（トークン節約）
    const plainText = articleContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1500);

    // 記事内容があるか、トピックのみかで分岐
    const isStandalone = !plainText;
    const contextLine = isStandalone
      ? `トピック: ${articleTitle}\n\n上記のトピックについて、あなたの美容知識でXのブックマークされやすい投稿文を1つ作成してください。`
      : `記事タイトル: ${articleTitle}\n記事内容（抜粋）: ${plainText}\n\n上記の記事内容から、Xでブックマークされやすい投稿文を1つ作成してください。`;

    const aiRes = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: isLong ? 1200 : 500,
      messages: [{
        role: "user",
        content: `あなたは美容ブログ「みおのミハダノート」の筆者みお（30代女性）です。

${contextLine}

${styleInstruction}

ルール：
- ${maxLen}文字以内
- ${isStandalone ? "トピックについて有益な美容情報を投稿" : "記事の「一番有益な情報」を抜き出して要約"}
- リスト・数字・チェックマーク（✅）を積極活用
- 「保存しておくと便利」「あとで読み返す」動機を作る
- 🔖を自然に使う
- URLは絶対に入れない（リプライで補足するため）
- 「使ってみた」「試した」「実際に使って」は禁止 → 「調べてみた」「口コミを見て」を使う
- 「読者さんからよく聞かれる」「DMから質問」は禁止（事実に反するため）
- ハッシュタグは2個まで（末尾に配置）
- 明るく親しみやすい口調

投稿文のみ出力してください（他のテキスト不要）：`,
      }],
    });

    const text = aiRes.content[0].type === "text" ? aiRes.content[0].text.trim() : "";
    if (text && text.length <= maxLen + 50) {
      return text;
    }
    // 長すぎる場合はフォールバック
    return buildBookmarkableTweet(articleTitle, "", { metaDescription: plainText.slice(0, 100), style, length });
  } catch (e: any) {
    console.error("[AI Tweet] Error:", e.message);
    return buildBookmarkableTweet(articleTitle, "", { style, length });
  }
}

/**
 * X (Twitter) にツイートを投稿する
 */
export async function postToX(
  creds: XCredentials,
  tweetText: string,
  replyToId?: string,
): Promise<XPostResult> {
  // api.x.com を使用（2026年の新Developer Console対応）
  const url = "https://api.x.com/2/tweets";

  try {
    console.log("[X Post] Attempting to post tweet...");
    console.log("[X Post] API Key prefix:", creds.apiKey.slice(0, 8) + "...");
    console.log("[X Post] Tweet length:", tweetText.length);
    if (replyToId) console.log("[X Post] Reply to:", replyToId);

    const authHeader = await buildOAuthHeader("POST", url, creds);

    const tweetBody: any = { text: tweetText };
    if (replyToId) {
      tweetBody.reply = { in_reply_to_tweet_id: replyToId };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tweetBody),
    });

    const responseBody = await res.text();
    console.log("[X Post] Response status:", res.status);
    console.log("[X Post] Response body:", responseBody.slice(0, 500));

    if (!res.ok) {
      return { success: false, error: `X API error (${res.status}): ${responseBody}` };
    }

    let data: any;
    try {
      data = JSON.parse(responseBody);
    } catch {
      return { success: false, error: `X API returned invalid JSON: ${responseBody.slice(0, 200)}` };
    }

    const tweetId = data.data?.id;
    if (!tweetId) {
      return { success: false, error: `X API returned no tweet ID: ${responseBody.slice(0, 200)}` };
    }

    const tweetUrl = `https://x.com/i/web/status/${tweetId}`;
    console.log(`[X Post] Success: ${tweetUrl}`);

    return { success: true, tweetId, tweetUrl };
  } catch (e: any) {
    console.error("[X Post] Exception:", e.message, e.stack);
    return { success: false, error: `Exception: ${e.message}` };
  }
}

// ----- メディアアップロード（画像添付用） -----

/**
 * 画像URLからバイナリを取得してX API v1.1にアップロードし、media_idを返す
 */
async function uploadImageToX(
  creds: XCredentials,
  imageUrl: string,
): Promise<string | null> {
  try {
    console.log("[X Media] Downloading image:", imageUrl.slice(0, 100));
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      console.error("[X Media] Failed to download image:", imgRes.status);
      return null;
    }
    const imgBuffer = await imgRes.arrayBuffer();
    const imgBytes = new Uint8Array(imgBuffer);

    // 画像サイズチェック（5MB制限）
    if (imgBytes.length > 5 * 1024 * 1024) {
      console.error("[X Media] Image too large:", imgBytes.length);
      return null;
    }

    // Base64エンコード（チャンク処理でメモリ効率化）
    const CHUNK = 8192;
    let base64 = "";
    for (let i = 0; i < imgBytes.length; i += CHUNK) {
      const chunk = imgBytes.subarray(i, Math.min(i + CHUNK, imgBytes.length));
      let binary = "";
      for (let j = 0; j < chunk.length; j++) {
        binary += String.fromCharCode(chunk[j]);
      }
      base64 += btoa(binary);
    }

    // 正しいBase64にするためチャンク結合後に再エンコード
    // → チャンク単位のbtoa結合はパディング問題があるので、全体を一括変換
    let fullBinary = "";
    for (let i = 0; i < imgBytes.length; i++) {
      fullBinary += String.fromCharCode(imgBytes[i]);
    }
    base64 = btoa(fullBinary);

    // X API v1.1 media upload（multipart/form-data）
    const uploadUrl = "https://upload.twitter.com/1.1/media/upload.json";
    const authHeader = await buildOAuthHeader("POST", uploadUrl, creds);

    // multipart/form-data で送信（percentEncodeを回避）
    const boundary = "----BlogEngine" + Date.now();
    const bodyParts = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="media_data"\r\n\r\n`,
      `${base64}\r\n`,
      `--${boundary}--\r\n`,
    ];
    const bodyStr = bodyParts.join("");

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: bodyStr,
    });

    const uploadBody = await uploadRes.text();
    console.log("[X Media] Upload status:", uploadRes.status, "body:", uploadBody.slice(0, 200));

    if (!uploadRes.ok) {
      console.error("[X Media] Upload failed:", uploadBody.slice(0, 300));
      // フォールバック: application/x-www-form-urlencoded で再試行
      console.log("[X Media] Retrying with form-urlencoded...");
      const authHeader2 = await buildOAuthHeader("POST", uploadUrl, creds);
      const formBody = `media_data=${encodeURIComponent(base64)}`;
      const retryRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: authHeader2,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody,
      });
      const retryBody = await retryRes.text();
      console.log("[X Media] Retry status:", retryRes.status);
      if (!retryRes.ok) {
        console.error("[X Media] Retry also failed:", retryBody.slice(0, 300));
        return null;
      }
      const retryData = JSON.parse(retryBody);
      console.log("[X Media] Retry success, media_id:", retryData.media_id_string);
      return retryData.media_id_string;
    }

    const uploadData = JSON.parse(uploadBody);
    const mediaId = uploadData.media_id_string;
    console.log("[X Media] Upload success, media_id:", mediaId);
    return mediaId;
  } catch (e: any) {
    console.error("[X Media] Exception:", e.message);
    return null;
  }
}

/**
 * 記事公開後にXに自動投稿する（画像付き）
 */
export async function postArticleToX(
  creds: XCredentials,
  articleTitle: string,
  articleUrl: string,
  metaDescription?: string,
  tags?: string[],
  imageUrl?: string,
  customText?: string,
): Promise<XPostResult> {
  const tweetText = customText || buildTweetText(articleTitle, articleUrl, metaDescription, tags);

  // 本体ツイートはテキスト中心。画像があれば添付し、URLはリプライでOGP表示させる
  const url = "https://api.x.com/2/tweets";
  try {
    const authHeader = await buildOAuthHeader("POST", url, creds);
    const body: any = { text: tweetText };
    if (imageUrl) {
      const mediaId = await uploadImageToX(creds, imageUrl);
      if (mediaId) {
        body.media = { media_ids: [mediaId] };
        console.log("[X Post] Media attached:", mediaId);
      } else {
        console.warn("[X Post] Media upload failed, posting without image");
      }
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const responseBody = await res.text();
    console.log("[X Post] Response status:", res.status);

    if (!res.ok) {
      return { success: false, error: `X API error (${res.status}): ${responseBody}` };
    }

    const data = JSON.parse(responseBody);
    const tweetId = data.data?.id;
    if (!tweetId) {
      return { success: false, error: `X API returned no tweet ID` };
    }

    // リプライでブログURLを投稿（OGPカードが自動表示 → タップでブログに飛べる）
    if (articleUrl && tweetId) {
      try {
        console.log("[X Reply] Posting blog URL as reply (OGP card will show)...");
        await new Promise((r) => setTimeout(r, 2000));
        const replyText = `📖 記事はこちら👇\n${articleUrl}`;
        await postToX(creds, replyText, tweetId);
        console.log("[X Reply] Blog URL reply posted successfully");
      } catch (replyErr: any) {
        console.error("[X Reply] Failed to post reply:", replyErr.message);
      }
    }

    const tweetUrl = `https://x.com/i/web/status/${tweetId}`;
    return { success: true, tweetId, tweetUrl };
  } catch (e: any) {
    return { success: false, error: `Exception: ${e.message}` };
  }
}

// ==========================================
// 美容系ハッシュタグ自動選定
// 拡散力の高いタグをタイトル・記事内容から自動選択
// ==========================================

/** 記事タイトルとタグからX拡散に最適な美容ハッシュタグを2〜3個選定 */
function selectBeautyHashtags(title: string, articleTags: string[]): string[] {
  const titleLower = title.toLowerCase();
  const selected: string[] = [];

  // カテゴリ別の拡散力が高いハッシュタグ（X美容界隈で実際に使われているもの）
  const categoryTags: { keywords: string[]; tags: string[] }[] = [
    // スキンケア系
    { keywords: ["スキンケア", "化粧水", "美容液", "保湿", "セラム", "乳液"],
      tags: ["#スキンケア", "#美肌", "#スキンケア好きさんと繋がりたい"] },
    // コスメ・メイク系
    { keywords: ["コスメ", "ファンデ", "リップ", "アイシャドウ", "メイク", "下地", "マスカラ"],
      tags: ["#コスメ好きさんと繋がりたい", "#コスメ購入品", "#今日のメイク"] },
    // 美容医療系
    { keywords: ["医療脱毛", "ハイフ", "ボトックス", "クリニック", "美容医療", "施術", "レーザー", "ピーリング"],
      tags: ["#美容医療", "#美容クリニック", "#自分磨き"] },
    // ヘアケア系
    { keywords: ["シャンプー", "トリートメント", "ヘアケア", "ヘアオイル", "髪"],
      tags: ["#ヘアケア", "#美髪", "#サラツヤ髪"] },
    // 美白・UV系
    { keywords: ["美白", "日焼け止め", "UV", "紫外線", "ブライトニング"],
      tags: ["#美白ケア", "#UVケア", "#透明感"] },
    // 毛穴・ニキビ系
    { keywords: ["毛穴", "ニキビ", "角質", "肌荒れ"],
      tags: ["#毛穴ケア", "#ニキビケア", "#肌荒れ改善"] },
    // エイジングケア系
    { keywords: ["エイジング", "しわ", "たるみ", "レチノール", "アンチエイジング"],
      tags: ["#エイジングケア", "#美魔女", "#年齢肌"] },
    // プチプラ・デパコス
    { keywords: ["プチプラ", "ドラッグストア", "1000円"],
      tags: ["#プチプラコスメ", "#プチプラスキンケア", "#ドラコス"] },
    { keywords: ["デパコス", "ブランド", "シャネル", "ディオール"],
      tags: ["#デパコス", "#ご褒美コスメ", "#デパコス購入品"] },
    // 新作・ランキング
    { keywords: ["新作", "新商品", "限定", "春コスメ"],
      tags: ["#新作コスメ", "#コスメレビュー", "#春コスメ"] },
    { keywords: ["ランキング", "おすすめ", "比較", "ベスコス"],
      tags: ["#おすすめコスメ", "#ベスコス", "#コスメレビュー"] },
  ];

  // タイトルからカテゴリマッチ
  for (const cat of categoryTags) {
    if (cat.keywords.some((kw) => titleLower.includes(kw.toLowerCase()))) {
      // マッチしたカテゴリから1つ選択（日替わり）
      const dayIdx = new Date().getDate() % cat.tags.length;
      const tag = cat.tags[dayIdx];
      if (!selected.includes(tag)) selected.push(tag);
      if (selected.length >= 2) break;
    }
  }

  // 記事タグからも1つ追加（カテゴリマッチで2個未満の場合）
  if (selected.length < 2) {
    for (const t of articleTags) {
      const tag = `#${t.replace(/\s+/g, "")}`;
      if (!selected.includes(tag) && tag.length <= 20) {
        selected.push(tag);
        break;
      }
    }
  }

  // まだ足りなければ汎用美容タグを追加
  const universalTags = ["#美容", "#美容好きさんと繋がりたい", "#コスメ好きさんと繋がりたい", "#自分磨き", "#美活"];
  const dayOffset = new Date().getDate() % universalTags.length;
  while (selected.length < 2) {
    const tag = universalTags[(dayOffset + selected.length) % universalTags.length];
    if (!selected.includes(tag)) selected.push(tag);
    else break;
  }

  // 最大3個に制限
  return selected.slice(0, 3);
}
