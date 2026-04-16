// ==========================================
// BlogEngine V2 - Gemini API Client
// YouTube動画の映像・音声をGemini AIで分析・要約
// ==========================================

export interface GeminiVideoAnalysis {
  summary: string;            // 500-1000文字の日本語要約
  keyTopics: string[];        // 主要トピック
  productsMentioned: string[];// 紹介された製品名
  beautyCategory: string;     // 美容カテゴリ
  keyTakeaways: string[];     // 3-5個のポイント
  sentiment: string;          // positive / neutral / negative
  targetAudience: string;     // ターゲット層
  rawResponse: string;        // デバッグ用の生レスポンス
}

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.0-flash";
const REQUEST_TIMEOUT_MS = 60000; // 動画分析は時間がかかるため60秒

/**
 * YouTube動画をGemini AIで分析
 */
export async function analyzeYouTubeVideo(
  apiKey: string,
  videoUrl: string,
  options?: {
    model?: string;
    supplementaryCaptions?: string;
    maxOutputTokens?: number;
  }
): Promise<GeminiVideoAnalysis | null> {
  if (!apiKey) {
    console.warn("[Gemini] API key not configured, skipping video analysis");
    return null;
  }

  const model = options?.model || DEFAULT_MODEL;
  const maxTokens = options?.maxOutputTokens || 4096;

  console.log(`[Gemini] Analyzing video: ${videoUrl} with model: ${model}`);

  // プロンプト構築
  let promptText = `あなたは美容分野に詳しいコンテンツアナリストです。
以下のYouTube動画を分析し、美容ブログ記事を書くために必要な情報を抽出してください。

## 分析指示
1. 動画の内容を500〜1000文字で日本語で要約してください
2. 動画で取り上げている主要トピックをリストアップしてください
3. 動画内で紹介・言及されている具体的な製品名をすべてリストアップしてください
4. この動画が属する美容カテゴリを1つ選んでください（例: スキンケア、メイクアップ、ヘアケア、美容医療、ボディケア、その他）
5. 動画の要点を3〜5個の箇条書きにしてください
6. 動画のトーン（positive/neutral/negative）を判定してください
7. ターゲット視聴者層を推定してください（例: 20代女性、30代以上の女性、美容初心者 等）

## 重要な注意事項
- 動画の内容を正確に反映してください。推測や捏造は禁止です
- 製品名は正確に記載してください（ブランド名＋製品名）
- 医学的効果の断言は避けてください`;

  if (options?.supplementaryCaptions) {
    promptText += `\n\n## 補足：動画の字幕テキスト（参考情報）\n${options.supplementaryCaptions.slice(0, 3000)}`;
  }

  promptText += `\n\n## 出力フォーマット（JSON）
必ず以下のJSON形式で出力してください。JSONのみを出力し、他のテキストは含めないでください。
\`\`\`json
{
  "summary": "動画の要約（500-1000文字）",
  "keyTopics": ["トピック1", "トピック2", ...],
  "productsMentioned": ["製品名1", "製品名2", ...],
  "beautyCategory": "カテゴリ名",
  "keyTakeaways": ["ポイント1", "ポイント2", ...],
  "sentiment": "positive",
  "targetAudience": "ターゲット層"
}
\`\`\``;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(
      `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  fileData: {
                    mimeType: "video/*",
                    fileUri: videoUrl,
                  },
                },
                { text: promptText },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.3,
          },
        }),
      }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[Gemini] API error ${res.status}: ${errText.slice(0, 300)}`);
      return null;
    }

    const data = await res.json();
    const rawText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!rawText) {
      console.error("[Gemini] Empty response from API");
      return null;
    }

    console.log(`[Gemini] Got response: ${rawText.length} chars`);

    // JSON抽出
    const analysis = parseGeminiResponse(rawText);
    if (!analysis) {
      console.error("[Gemini] Failed to parse response JSON");
      return null;
    }

    return { ...analysis, rawResponse: rawText };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[Gemini] Request timed out");
    } else {
      console.error("[Gemini] Error:", err);
    }
    return null;
  }
}

/**
 * GeminiレスポンスからJSON抽出
 */
function parseGeminiResponse(text: string): Omit<GeminiVideoAnalysis, "rawResponse"> | null {
  try {
    // 方法1: ```json ... ``` ブロック
    const codeBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return validateAnalysis(JSON.parse(codeBlockMatch[1].trim()));
    }

    // 方法2: 最初の { から最後の } まで
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return validateAnalysis(JSON.parse(text.slice(firstBrace, lastBrace + 1)));
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 分析結果のバリデーション・正規化
 */
function validateAnalysis(data: any): Omit<GeminiVideoAnalysis, "rawResponse"> | null {
  if (!data || typeof data !== "object") return null;

  return {
    summary: typeof data.summary === "string" ? data.summary : "",
    keyTopics: Array.isArray(data.keyTopics) ? data.keyTopics.filter((t: any) => typeof t === "string") : [],
    productsMentioned: Array.isArray(data.productsMentioned) ? data.productsMentioned.filter((p: any) => typeof p === "string") : [],
    beautyCategory: typeof data.beautyCategory === "string" ? data.beautyCategory : "その他",
    keyTakeaways: Array.isArray(data.keyTakeaways) ? data.keyTakeaways.filter((t: any) => typeof t === "string") : [],
    sentiment: ["positive", "neutral", "negative"].includes(data.sentiment) ? data.sentiment : "neutral",
    targetAudience: typeof data.targetAudience === "string" ? data.targetAudience : "",
  };
}

/**
 * Gemini分析結果を記事生成用コンテキストに変換
 */
export function buildGeminiContext(
  analysis: GeminiVideoAnalysis,
  videoMeta: {
    title: string;
    channelTitle: string;
    viewCount?: string;
    publishedAt?: string;
  }
): string {
  let context = `【YouTube動画情報】\n`;
  context += `タイトル: ${videoMeta.title}\n`;
  context += `チャンネル: ${videoMeta.channelTitle}\n`;
  if (videoMeta.viewCount) {
    context += `再生回数: ${Number(videoMeta.viewCount).toLocaleString()}回\n`;
  }
  if (videoMeta.publishedAt) {
    context += `公開日: ${new Date(videoMeta.publishedAt).toLocaleDateString("ja-JP")}\n`;
  }

  context += `\n【Gemini AIによる動画分析結果】\n`;
  context += `カテゴリ: ${analysis.beautyCategory}\n`;
  context += `トーン: ${analysis.sentiment}\n`;
  context += `ターゲット: ${analysis.targetAudience}\n`;

  context += `\n【動画の要約】\n${analysis.summary}\n`;

  if (analysis.keyTopics.length > 0) {
    context += `\n【主要トピック】\n${analysis.keyTopics.map((t) => `- ${t}`).join("\n")}\n`;
  }

  if (analysis.productsMentioned.length > 0) {
    context += `\n【紹介されている製品】\n${analysis.productsMentioned.map((p) => `- ${p}`).join("\n")}\n`;
  }

  if (analysis.keyTakeaways.length > 0) {
    context += `\n【要点まとめ】\n${analysis.keyTakeaways.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n`;
  }

  return context;
}
