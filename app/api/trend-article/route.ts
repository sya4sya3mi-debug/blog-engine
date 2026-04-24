// ==========================================
// BlogEngine V2 - Trend → Article Generation
// ハートビート方式でEdge Runtime 25秒制限を回避
// ==========================================

export const runtime = "edge";

import { getConfig } from "@/lib/config";
import { getVideoDetails } from "@/lib/youtube-captions";
import { searchRakutenProducts, buildRakutenAffiliateHtml } from "@/lib/rakuten";
import { buildAuditSummary, factCheckArticle } from "@/lib/fact-check";
import { ARTICLE_GENERATION_SEO_ADDON_BLOCK, COMPLIANCE_BLOCK, STRICT_REFERENCES_BLOCK } from "@/lib/generate";
import { analyzeYouTubeVideo, buildGeminiContext } from "@/lib/gemini";

export async function POST(req: Request) {
  const config = getConfig();

  let body: any;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { trend, extraText } = body;
  if (!trend?.source) {
    return Response.json({ error: "trend data required" }, { status: 400 });
  }

  // ストリーミングレスポンス（ハートビートでタイムアウト回避）
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // ハートビート（3秒ごとにスペースを送信）
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(" ")); } catch {}
      }, 3000);

      try {
        const result = await generateTrendArticle(trend, config, extraText);
        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify(result)));
        controller.close();
      } catch (err) {
        clearInterval(heartbeat);
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(JSON.stringify({ error: errMsg })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/json", "Transfer-Encoding": "chunked" },
  });
}

async function generateTrendArticle(trend: any, config: any, extraText?: string) {
  const sourceType = trend.source === "youtube" ? "YouTube動画"
    : trend.source === "pubmed" ? "学術論文" : "ニュース記事";

  // ======== 1. コンテキスト構築 ========
  let context = "";

  if (trend.source === "youtube") {
    const videoIdMatch = trend.sourceUrl?.match(/v=([^&]+)/);
    const videoId = videoIdMatch?.[1];
    if (videoId && process.env.YOUTUBE_API_KEY) {
      try {
        const details = await getVideoDetails(videoId, process.env.YOUTUBE_API_KEY);
        if (details) {
          // Gemini APIキーがあれば動画分析を試みる
          if (process.env.GEMINI_API_KEY) {
            try {
              const analysis = await analyzeYouTubeVideo(
                process.env.GEMINI_API_KEY,
                trend.sourceUrl,
                { supplementaryCaptions: extraText }
              );
              if (analysis) {
                context = buildGeminiContext(analysis, {
                  title: details.title,
                  channelTitle: details.channelTitle,
                  viewCount: details.viewCount,
                  publishedAt: details.publishedAt,
                });
                console.log("[Trend] Gemini analysis applied for YouTube video");
              }
            } catch (gemErr) {
              console.warn("[Trend] Gemini analysis failed, using metadata:", gemErr);
            }
          }
          // Geminiが使えない場合のフォールバック
          if (!context) {
            context = `【YouTube動画情報】\nタイトル: ${details.title}\nチャンネル: ${details.channelTitle}\n再生回数: ${Number(details.viewCount).toLocaleString()}回\n`;
            if (details.tags.length > 0) context += `タグ: ${details.tags.slice(0, 8).join(", ")}\n`;
            if (details.description) context += `\n【動画説明文】\n${details.description.slice(0, 1000)}\n`;
          }
        }
      } catch {}
    }
  }

  if (!context) {
    context = `【トレンド情報】\nタイトル: ${trend.titleJa || trend.title}\nソース: ${sourceType}\n`;
    if (trend.summaryJa || trend.summary) context += `概要: ${trend.summaryJa || trend.summary}\n`;
    if (trend.keywords?.length > 0) context += `キーワード: ${trend.keywords.join(", ")}\n`;
    if (trend.metadata?.journal) context += `掲載誌: ${trend.metadata.journal}\n`;
  }

  // ======== 1.5. 追加情報（文字起こし等）========
  if (extraText?.trim()) {
    context += `\n【ユーザー提供の追加情報（文字起こし・メモ）】\n${extraText.trim()}\n`;
  }

  // ======== 2. 楽天商品検索 ========
  const searchKeywords = extractSearchKeywords(trend);
  let rakutenProducts: { name: string; price: number; url: string; html: string }[] = [];
  let productContext = "";

  const rakutenAppId = process.env.RAKUTEN_APP_ID || "";
  const rakutenAffId = process.env.RAKUTEN_AFFILIATE_ID || "";
  const rakutenAccessKey = process.env.RAKUTEN_ACCESS_KEY || "";

  if (rakutenAppId && rakutenAffId && searchKeywords.length > 0) {
    try {
      const products = await searchRakutenProducts(
        rakutenAppId, rakutenAffId, searchKeywords[0], 3, rakutenAccessKey,
        { minPrice: 1000, maxPrice: 20000 }
      );
      for (const p of products.slice(0, 2)) {
        rakutenProducts.push({
          name: p.itemName,
          price: p.itemPrice,
          url: p.affiliateUrl,
          html: buildRakutenAffiliateHtml(p),
        });
      }
    } catch {}
  }

  if (rakutenProducts.length > 0) {
    productContext = `\n\n【関連おすすめ商品（楽天市場）】\n`;
    rakutenProducts.forEach((p, i) => {
      productContext += `${i + 1}. ${p.name}（¥${p.price.toLocaleString()}）\n`;
    });
    productContext += `\nこれらの商品を記事内で自然に紹介してください。各商品の紹介箇所に <p class="product-rec-slot" data-index="0">【商品リンク】</p> のようなプレースホルダーを入れてください（data-indexは商品の番号0始まり）。\n`;
  }

  // ======== 3. Claude API（ストリーミング） ========
  const prompt = buildOptimizedPrompt(context, productContext, sourceType, trend, extraText);

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 6000,
      stream: true,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!claudeRes.ok) {
    const err = await claudeRes.text();
    throw new Error(`Claude API error: ${err.slice(0, 200)}`);
  }

  let responseText = "";
  const reader = claudeRes.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let sseBuffer = ""; // SSEバッファ（チャンク途中切れ対策）
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    sseBuffer += decoder.decode(value, { stream: true });

    // 完全な行だけ処理（途中の行はバッファに残す）
    const lines = sseBuffer.split("\n");
    sseBuffer = lines.pop() || ""; // 最後の不完全な行をバッファに戻す

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "content_block_delta" && parsed.delta?.text) {
            responseText += parsed.delta.text;
          }
        } catch {}
      }
    }
  }
  // バッファに残ったデータも処理
  if (sseBuffer.trim().startsWith("data: ")) {
    const data = sseBuffer.trim().slice(6);
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === "content_block_delta" && parsed.delta?.text) {
        responseText += parsed.delta.text;
      }
    } catch {}
  }

  // ======== 4. JSON抽出 + アフィリエイト挿入 ========
  let article;
  try {
    // 方法1: ```json ... ``` ブロック
    const codeBlockMatch = responseText.match(/```json\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      article = JSON.parse(codeBlockMatch[1].trim());
    } else {
      // 方法2: 最初の { から最後の } まで
      const firstBrace = responseText.indexOf("{");
      const lastBrace = responseText.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        const jsonStr = responseText.slice(firstBrace, lastBrace + 1);
        article = JSON.parse(jsonStr);
      } else {
        throw new Error("JSONが見つかりません");
      }
    }
  } catch (parseErr) {
    // 方法3: 切り詰められたJSONを修復
    try {
      const firstBrace = responseText.indexOf("{");
      if (firstBrace >= 0) {
        let jsonStr = responseText.slice(firstBrace);
        // 閉じられていないブラケットを補完
        let openBraces = 0, openBrackets = 0, inString = false, escaped = false;
        for (let i = 0; i < jsonStr.length; i++) {
          const c = jsonStr[i];
          if (escaped) { escaped = false; continue; }
          if (c === "\\") { escaped = true; continue; }
          if (c === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (c === "{") openBraces++;
          if (c === "}") openBraces--;
          if (c === "[") openBrackets++;
          if (c === "]") openBrackets--;
        }
        // 開いた文字列を閉じる
        if (inString) jsonStr += '"';
        while (openBrackets > 0) { jsonStr += "]"; openBrackets--; }
        while (openBraces > 0) { jsonStr += "}"; openBraces--; }
        article = JSON.parse(jsonStr);
      } else {
        throw parseErr;
      }
    } catch {
      throw new Error("記事JSONの解析に失敗: " + responseText.slice(0, 200));
    }
  }

  let htmlContent = article.htmlContent || "";

  // 出典リンクを記事末尾に自動挿入（ソース種別を明示）
  const sourceUrl = trend.sourceUrl || "";
  if (sourceUrl) {
    let sourceIcon = "📄";
    let sourceLabel = "ニュース記事";
    let sourceName = trend.metadata?.source || sourceType;
    let sourceNote = "※本記事は上記の情報を参考に、筆者が独自にまとめたものです。最新情報は出典元をご確認ください。";

    if (trend.source === "youtube") {
      sourceIcon = "▶️";
      sourceLabel = "YouTube動画";
      const channelName = trend.metadata?.channelTitle || "YouTube";
      sourceName = `${channelName}様`;
      sourceNote = "※本記事は上記のYouTube動画の内容を参考に、筆者が独自にまとめたものです。動画の詳細は出典元をご覧ください。";
    } else if (trend.source === "pubmed") {
      sourceIcon = "🔬";
      sourceLabel = "学術論文";
      sourceName = trend.metadata?.journal || "PubMed";
      sourceNote = "※本記事は上記の学術論文を参考に、一般向けにわかりやすくまとめたものです。詳細は原論文をご確認ください。";
    }

    htmlContent += `\n<div style="margin-top:32px;padding:16px;background:#f8f9fa;border-radius:8px;border-left:4px solid #6c757d;">
      <p style="font-size:13px;font-weight:bold;color:#495057;margin:0 0 8px;">参考情報</p>
      <p style="font-size:12px;color:#6c757d;margin:0;">${sourceIcon} ${sourceLabel}：<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" style="color:#0066cc;">${sourceName}</a></p>
      <p style="font-size:11px;color:#999;margin:4px 0 0;">${sourceNote}</p>
    </div>`;
  }

  if (rakutenProducts.length > 0) {
    htmlContent = `<div style="font-size:11px;color:#999;margin-bottom:16px;">PR：本記事にはアフィリエイト広告が含まれています</div>\n` + htmlContent;
    for (let i = 0; i < rakutenProducts.length; i++) {
      htmlContent = htmlContent.replace(
        new RegExp(`<p class="product-rec-slot"[^>]*data-index="${i}"[^>]*>[^<]*</p>`, "g"),
        rakutenProducts[i].html
      );
    }
    htmlContent = htmlContent.replace(/<p class="product-rec-slot"[^>]*>[^<]*<\/p>/g, "");
    htmlContent += `\n<div style="margin-top:32px;padding:20px;background:#fdf2f8;border-radius:12px;text-align:center;">
      <p style="font-size:15px;font-weight:bold;color:#333;margin-bottom:12px;">この記事で紹介した商品をチェック</p>
      ${rakutenProducts[0].html}
    </div>`;
  }

  const articleTitle = trend.titleJa || trend.title;
  const slug = (article.keyword || articleTitle).replace(/[^a-zA-Z0-9\u3040-\u9fff]/g, "-").replace(/-+/g, "-").slice(0, 60);

  const resultArticle = {
    title: article.title || articleTitle,
    metaDescription: article.metaDescription || "",
    htmlContent,
    keyword: article.keyword || "",
    slug,
    tags: article.tags || [],
    faqSchema: article.faqSchema || [],
    seoNotes: article.seoNotes || undefined,
    internalLinks: article.internalLinks || undefined,
    externalSources: article.externalSources || undefined,
    imageSeo: article.imageSeo || undefined,
    auditSummary: undefined as { score: number; topRisks: string[]; nextFixes: string[] } | undefined,
    trendSource: trend.source,
    trendUrl: trend.sourceUrl,
    productsFound: rakutenProducts.length,
  };

  // ファクトチェック（薬機法・品質チェック）
  if (config.factCheckEnabled) {
    try {
      const fcResult = await factCheckArticle(config.anthropicApiKey, {
        title: resultArticle.title,
        htmlContent: resultArticle.htmlContent,
        metaDescription: resultArticle.metaDescription,
        keyword: resultArticle.keyword || "",
        tags: resultArticle.tags,
        themeLabel: trend.titleJa || trend.title || resultArticle.keyword || "",
      });
      if (fcResult.success) {
        resultArticle.title = fcResult.improved.title;
        resultArticle.htmlContent = fcResult.improved.htmlContent;
        resultArticle.metaDescription = fcResult.improved.metaDescription;
        resultArticle.tags = fcResult.improved.tags;
        resultArticle.auditSummary = buildAuditSummary(fcResult.report);
        console.log("[Trend FactCheck] " + fcResult.report.changes.length + "件の改善を適用");
      } else {
        console.warn("[Trend FactCheck] レビュー失敗（元の記事を使用）:", fcResult.error);
      }
    } catch (e: any) {
      console.warn("[Trend FactCheck] エラー（元の記事を使用）:", e.message);
    }
  }

  return { success: true, article: resultArticle };
}

function extractSearchKeywords(trend: any): string[] {
  const keywords: string[] = [];
  const title = (trend.titleJa || trend.title || "").toLowerCase();
  const terms: Record<string, string> = {
    "美容液": "美容液", "化粧水": "化粧水", "セラム": "セラム",
    "日焼け止め": "日焼け止め", "ファンデ": "ファンデーション",
    "リップ": "リップ", "クレンジング": "クレンジング",
    "シャンプー": "シャンプー", "スキンケア": "スキンケア",
    "保湿": "保湿クリーム", "美白": "美白 美容液",
    "毛穴": "毛穴ケア", "ニキビ": "ニキビケア",
    "レチノール": "レチノール", "ビタミンc": "ビタミンC 美容液",
    "ヒアルロン酸": "ヒアルロン酸", "コラーゲン": "コラーゲン",
    "エイジングケア": "エイジングケア", "ヘアオイル": "ヘアオイル",
    "sunscreen": "日焼け止め", "retinol": "レチノール",
    "hyaluronic": "ヒアルロン酸", "serum": "美容液",
    "collagen": "コラーゲン",
  };
  for (const [t, q] of Object.entries(terms)) {
    if (title.includes(t)) { keywords.push(q); break; }
  }
  if (keywords.length === 0) {
    if (trend.category === "スキンケア") keywords.push("スキンケア おすすめ");
    else if (trend.category === "新作コスメ") keywords.push("コスメ 新作");
    else if (trend.category === "ヘアケア") keywords.push("シャンプー おすすめ");
    else keywords.push("美容液 おすすめ");
  }
  return keywords.slice(0, 1);
}

function buildOptimizedPrompt(context: string, productContext: string, sourceType: string, trend: any, extraText?: string): string {
  const category = trend.category || "美容";
  const hasExtra = !!(extraText?.trim());
  return `あなたは美容ブロガー「みお」です。30代の女性で、美容とスキンケアが大好きな等身大のブロガーです。

## 記事の目的
以下の${sourceType}で話題の内容を読者にわかりやすく紹介する「${category}トレンド記事」を作成してください。
${hasExtra && trend.source === "youtube" ? `\n## 記事の切り口（重要）\nこのYouTube動画をきっかけに知った情報を紹介する記事です。「この動画を見つけて気になったので調べてみた」「すごく参考になったので紹介したくなった」というニュアンスで書いてください。追加情報（文字起こし・メモ）に記載された内容を記事のベースにしてください。` : ""}

## 参照情報
${context}${productContext}

## 記事構成（HTML形式・2500-4000文字）
1. 導入文（150文字）: 読者に寄り添う書き出し
2. H2: トレンドの概要（300文字）: なぜ注目されているか
3. H2: ポイント解説（500文字）: H3で3つのポイント
${productContext ? "4. H2: おすすめ商品（400文字）: 商品プレースホルダーを配置" : ""}
5. H2: まとめ（150文字）

## ルール
- 「〜だと思います」のような親しみやすい口調
- 実際に使った体験談は書かない。「話題になっている」「注目されている」と客観的に
- 原文をそのままコピーしない。必ず自分の言葉で要約・書き直す

${COMPLIANCE_BLOCK}

${STRICT_REFERENCES_BLOCK}

${ARTICLE_GENERATION_SEO_ADDON_BLOCK}

## 出典表記（必須）
- 記事内で情報を引用・参照した箇所には必ず出典元を明記すること
- YouTubeチャンネル名に言及する場合は必ず「〇〇様」と敬称をつけること（例：「KATE様のチャンネル」「美容太郎様」）
- 出典元メディア名: ${trend.metadata?.source || trend.metadata?.journal || trend.metadata?.channelTitle || sourceType}
- 記事末尾に「参考情報」セクションを設け、出典元のメディア名を記載（URLはコード側で自動挿入するため不要）
- 論文の場合：「〇〇誌に掲載された研究（著者名, 発表年）によると」
- ニュースの場合：「〇〇（メディア名）の報道によると」

## YouTube動画ソースの場合の厳守ルール（重要）
${trend.source === "youtube" ? (hasExtra ?
`- 追加情報（文字起こし・メモ）の内容を記事の主要な根拠として活用してください
- 「この動画を見つけたのがきっかけで、すごく気になったので情報をまとめてみました」という導入がベスト
- 追加情報に具体的な商品名・成分名・方法がある場合、それを中心に記事を構成
- 「動画で紹介されていた情報をもとに」「動画の中で触れられていた内容では」という表現はOK
- ただし動画の音声そのものを引用しているかのような「〇〇さんが『〜〜』と言っていた」のような直接引用は避ける
- 出典表記：「〇〇様のチャンネル（YouTube）の動画を参考にまとめました」` :
`- あなたは動画を視聴していません。動画のタイトル・説明文・タグのテキスト情報のみを参照しています
- 絶対に使ってはいけない表現：「動画で言っていた通り」「動画内で紹介されていた」「動画で説明されていた」「〇〇さんも言っていた」「動画を見ると」「動画によると」
- 代わりに使うべき表現：「動画タイトルや概要欄の情報によると」「〇〇様のチャンネルが取り上げているテーマとして」「動画の概要欄で紹介されている情報では」
- 動画の音声・映像の内容には一切言及しないでください。テキストとして確認できる情報（タイトル・説明文・タグ）だけを参考にしてください
- 出典表記：「〇〇様のチャンネル（YouTube）のテーマを参考に情報をまとめました」`) : "- YouTube以外のソースなのでこのルールは適用外"}

## 重要：黄色マーカー装飾（必ず実行すること）
htmlContent内で読者にとって特に重要な箇所に、以下のHTMLタグで黄色マーカーを引いてください：
<span style="background:linear-gradient(transparent 60%,#fff799 60%)">重要なテキスト</span>
- 1記事あたり3〜5箇所に使用（多すぎNG）
- 結論・注意点・価格・ポイントなど重要な短いフレーズに使う
- 見出し（h2/h3）やリンクには使わない

## JSON出力
\`\`\`json
{
  "htmlContent": "HTML形式の記事本文（黄色マーカーを3〜5箇所含むこと）",
  "title": "SEOタイトル（60文字以内）",
  "metaDescription": "meta description（120-160文字）",
  "keyword": "メインキーワード",
  "tags": ["タグ1","タグ2","タグ3"],
  "faqSchema": [{"question":"Q","answer":"A"},{"question":"Q","answer":"A"}]
}
\`\`\`

## FAQ（よくある質問）の禁止事項
- 使用感を問う質問（「使い心地は？」「効果はありましたか？」）は入れない
- 医学的効果を断言する回答は禁止（「シミが消えます」→「シミへのアプローチが期待できます」）
- 捏造した数値（「〇〇%の人が効果を実感」等）は禁止`;
}
