// ==========================================
// BlogEngine V2 - YouTube動画 × Gemini分析 → 記事生成
// Gemini AIで動画内容を分析し、Claudeで記事を生成
// ==========================================

export const runtime = "edge";

import { getConfig } from "@/lib/config";
import { analyzeYouTubeVideo, buildGeminiContext } from "@/lib/gemini";
import { getVideoDetails, buildVideoContext } from "@/lib/youtube-captions";
import { searchRakutenProducts, buildRakutenAffiliateHtml } from "@/lib/rakuten";
import { factCheckArticle } from "@/lib/fact-check";
import { COMPLIANCE_BLOCK, REFERENCES_BLOCK } from "@/lib/generate";

export async function POST(req: Request) {
  const config = getConfig();

  let body: any;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { videoUrl, trendData } = body;

  // videoUrl または trendData.sourceUrl からYouTube URLを取得
  const ytUrl = videoUrl || trendData?.sourceUrl || "";
  const videoIdMatch = ytUrl.match(/(?:v=|youtu\.be\/)([^&?#]+)/);
  const videoId = videoIdMatch?.[1];

  if (!videoId) {
    return Response.json({ error: "有効なYouTube URLが必要です" }, { status: 400 });
  }

  // ストリーミングレスポンス（ハートビートでタイムアウト回避）
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(" ")); } catch {}
      }, 3000);

      try {
        const result = await generateYouTubeArticle(videoId, ytUrl, config, trendData);
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

async function generateYouTubeArticle(
  videoId: string,
  videoUrl: string,
  config: any,
  trendData?: any
) {
  // ======== 1. 動画メタデータ取得 ========
  const details = await getVideoDetails(videoId, config.youtubeApiKey);
  if (!details) {
    throw new Error("動画情報の取得に失敗しました。動画が非公開か、URLが正しくない可能性があります。");
  }

  console.log(`[YT-Article] Processing: "${details.title}" by ${details.channelTitle}`);

  // ======== 2. Gemini分析 (フォールバック付き) ========
  let context = "";
  let geminiUsed = false;

  if (config.geminiApiKey) {
    console.log("[YT-Article] Running Gemini video analysis...");

    // 字幕があればGeminiの補足情報として渡す
    let captionsText: string | undefined;
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
      try {
        const fullContext = await buildVideoContext(videoId, {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
          apiKey: config.youtubeApiKey,
        });
        // 字幕部分だけ抽出
        const captionMatch = fullContext.match(/【字幕テキスト（[^）]+）】\n([\s\S]+)/);
        if (captionMatch) captionsText = captionMatch[1].trim();
      } catch {}
    }

    const analysis = await analyzeYouTubeVideo(config.geminiApiKey, videoUrl, {
      supplementaryCaptions: captionsText,
    });

    if (analysis) {
      context = buildGeminiContext(analysis, {
        title: details.title,
        channelTitle: details.channelTitle,
        viewCount: details.viewCount,
        publishedAt: details.publishedAt,
      });
      geminiUsed = true;
      console.log(`[YT-Article] Gemini analysis complete: ${analysis.summary.length} chars summary`);
    } else {
      console.warn("[YT-Article] Gemini analysis failed, falling back to metadata");
    }
  }

  // フォールバック: メタデータ + 字幕
  if (!geminiUsed) {
    console.log("[YT-Article] Using metadata/captions fallback");
    context = await buildVideoContext(videoId, {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
      apiKey: config.youtubeApiKey,
    });
    if (!context) {
      context = `【YouTube動画情報】\nタイトル: ${details.title}\nチャンネル: ${details.channelTitle}\n再生回数: ${Number(details.viewCount).toLocaleString()}回\n`;
      if (details.description) {
        context += `\n【動画説明文】\n${details.description.slice(0, 1500)}\n`;
      }
    }
  }

  // ======== 3. 楽天商品検索 ========
  const searchKeyword = extractProductKeyword(details.title, details.tags);
  let rakutenProducts: { name: string; price: number; url: string; html: string }[] = [];
  let productContext = "";

  const rakutenAppId = process.env.RAKUTEN_APP_ID || "";
  const rakutenAffId = process.env.RAKUTEN_AFFILIATE_ID || "";
  const rakutenAccessKey = process.env.RAKUTEN_ACCESS_KEY || "";

  if (rakutenAppId && rakutenAffId && searchKeyword) {
    try {
      const products = await searchRakutenProducts(
        rakutenAppId, rakutenAffId, searchKeyword, 3, rakutenAccessKey,
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

  // ======== 4. YouTube埋め込みHTML ========
  const youtubeEmbed = `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:24px 0;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <iframe src="https://www.youtube.com/embed/${videoId}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen loading="lazy" title="${details.title.replace(/"/g, "&quot;")}"></iframe>
</div>`;

  // ======== 5. Claude記事生成 ========
  const prompt = buildYouTubeArticlePrompt(context, productContext, details, geminiUsed, youtubeEmbed);

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

  // SSEストリーム読み取り
  let responseText = "";
  const reader = claudeRes.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let sseBuffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    sseBuffer += decoder.decode(value, { stream: true });

    const lines = sseBuffer.split("\n");
    sseBuffer = lines.pop() || "";

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
  if (sseBuffer.trim().startsWith("data: ")) {
    const data = sseBuffer.trim().slice(6);
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === "content_block_delta" && parsed.delta?.text) {
        responseText += parsed.delta.text;
      }
    } catch {}
  }

  // ======== 6. JSON抽出 + 後処理 ========
  let article;
  try {
    const codeBlockMatch = responseText.match(/```json\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      article = JSON.parse(codeBlockMatch[1].trim());
    } else {
      const firstBrace = responseText.indexOf("{");
      const lastBrace = responseText.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        article = JSON.parse(responseText.slice(firstBrace, lastBrace + 1));
      } else {
        throw new Error("JSONが見つかりません");
      }
    }
  } catch (parseErr) {
    // 切り詰められたJSON修復
    try {
      const firstBrace = responseText.indexOf("{");
      if (firstBrace >= 0) {
        let jsonStr = responseText.slice(firstBrace);
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

  // YouTube埋め込みが記事本文に含まれていない場合、導入文の後に挿入
  if (!htmlContent.includes("youtube.com/embed/")) {
    const firstH2 = htmlContent.indexOf("<h2");
    if (firstH2 > 0) {
      htmlContent = htmlContent.slice(0, firstH2) + youtubeEmbed + "\n" + htmlContent.slice(firstH2);
    } else {
      htmlContent = youtubeEmbed + "\n" + htmlContent;
    }
  }

  // 出典リンク
  const channelName = details.channelTitle || "YouTube";
  htmlContent += `\n<div style="margin-top:32px;padding:16px;background:#f8f9fa;border-radius:8px;border-left:4px solid #6c757d;">
    <p style="font-size:13px;font-weight:bold;color:#495057;margin:0 0 8px;">参考情報</p>
    <p style="font-size:12px;color:#6c757d;margin:0;">▶️ YouTube動画：<a href="${videoUrl}" target="_blank" rel="noopener noreferrer" style="color:#0066cc;">${channelName}様</a></p>
    <p style="font-size:11px;color:#999;margin:4px 0 0;">※本記事は上記のYouTube動画の内容を参考に、筆者が独自にまとめたものです。動画の詳細は出典元をご覧ください。</p>
  </div>`;

  // アフィリエイトリンク挿入
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

  const slug = (article.keyword || details.title)
    .replace(/[^a-zA-Z0-9\u3040-\u9fff]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);

  const resultArticle = {
    title: article.title || details.title,
    metaDescription: article.metaDescription || "",
    htmlContent,
    keyword: article.keyword || "",
    slug,
    tags: article.tags || [],
    faqSchema: article.faqSchema || [],
    trendSource: "youtube",
    trendUrl: videoUrl,
    productsFound: rakutenProducts.length,
    geminiAnalysis: geminiUsed,
  };

  // ファクトチェック
  if (config.factCheckEnabled) {
    try {
      const fcResult = await factCheckArticle(config.anthropicApiKey, {
        title: resultArticle.title,
        htmlContent: resultArticle.htmlContent,
        metaDescription: resultArticle.metaDescription,
        keyword: resultArticle.keyword,
        tags: resultArticle.tags,
        themeLabel: details.title,
      });
      if (fcResult.success) {
        resultArticle.title = fcResult.improved.title;
        resultArticle.htmlContent = fcResult.improved.htmlContent;
        resultArticle.metaDescription = fcResult.improved.metaDescription;
        resultArticle.tags = fcResult.improved.tags;
        console.log("[YT-Article FactCheck] " + fcResult.report.changes.length + "件の改善を適用");
      }
    } catch (e: any) {
      console.warn("[YT-Article FactCheck] エラー（元の記事を使用）:", e.message);
    }
  }

  return { success: true, article: resultArticle };
}

function extractProductKeyword(title: string, tags: string[]): string {
  const combined = (title + " " + tags.join(" ")).toLowerCase();
  const terms: Record<string, string> = {
    "美容液": "美容液", "化粧水": "化粧水", "セラム": "セラム",
    "日焼け止め": "日焼け止め", "ファンデ": "ファンデーション",
    "リップ": "リップ", "クレンジング": "クレンジング",
    "シャンプー": "シャンプー", "スキンケア": "スキンケア",
    "保湿": "保湿クリーム", "美白": "美白 美容液",
    "毛穴": "毛穴ケア", "ニキビ": "ニキビケア",
    "レチノール": "レチノール", "ビタミンc": "ビタミンC 美容液",
    "ヒアルロン酸": "ヒアルロン酸", "コラーゲン": "コラーゲン",
    "ヘアオイル": "ヘアオイル", "トリートメント": "トリートメント",
  };
  for (const [t, q] of Object.entries(terms)) {
    if (combined.includes(t)) return q;
  }
  return "美容 おすすめ";
}

function buildYouTubeArticlePrompt(
  context: string,
  productContext: string,
  videoDetails: { title: string; channelTitle: string },
  geminiUsed: boolean,
  youtubeEmbed: string
): string {
  const channelName = videoDetails.channelTitle;

  return `あなたは美容ブロガー「みお」です。30代の女性で、美容とスキンケアが大好きな等身大のブロガーです。

## 記事の目的
話題のYouTube動画の内容を紹介し、自分なりの考察を加えた記事を作成してください。
「この動画を見つけて気になったので、内容をまとめつつ私なりの考えも書いてみました」というスタンスです。

## 参照情報
${context}${productContext}

## YouTube動画埋め込みHTML（記事内に必ず配置すること）
以下のHTMLを記事の導入文の直後（最初のH2の前）に配置してください：
${youtubeEmbed}

## 記事構成（HTML形式・3000-4500文字）
1. 導入文（200文字）: 「最近YouTubeでこんな動画を見つけたんです！」的な自然な書き出し
2. [YouTube動画埋め込み] ← 上記のHTMLをここに配置
3. H2: 動画の内容をざっくりまとめると（600文字）: ${geminiUsed ? "Gemini分析結果を自分の言葉で要約" : "動画のタイトル・概要欄の情報をベースに要約"}
   - H3で2-3個のポイントに分けて解説
4. H2: 紹介されていたアイテム・成分をチェック（500文字）: 動画で言及された製品や成分の解説
   ${productContext ? "- 商品プレースホルダーを配置" : ""}
5. H2: 筆者みおのコメント・考察（500文字）: 動画の内容を受けての自分なりの意見・追加情報
6. H2: まとめ（200文字）: 動画の良さを伝えつつ、読者へのアクション提案

## ルール
- 「〜だと思います」「〜なんですよね」のような親しみやすい口調
- ${geminiUsed
    ? `Gemini AIによる動画分析結果を参考にしています。分析結果を自分の言葉で自然にまとめてください
- 「動画で紹介されていた内容によると」「動画の中で触れられていた」のような表現はOKです`
    : `動画を直接視聴した情報は参照していません。タイトル・説明文・タグの情報のみを使ってください
- 「動画タイトルや概要欄の情報によると」「概要欄で紹介されている情報では」と明示してください
- 「動画で言っていた」「動画で紹介されていた」のような表現は禁止`}
- 原文をそのままコピーしない。必ず自分の言葉で要約・書き直す
- YouTubeチャンネル名は必ず「${channelName}様」と敬称をつけること

${COMPLIANCE_BLOCK}

${REFERENCES_BLOCK}

## 出典表記（必須）
- 出典元メディア名: ${channelName}様（YouTube）
- 記事末尾の「参考情報」セクションはコード側で自動挿入するため、記事本文には不要です

## 重要：黄色マーカー装飾（必ず実行すること）
htmlContent内で読者にとって特に重要な箇所に、以下のHTMLタグで黄色マーカーを引いてください：
<span style="background:linear-gradient(transparent 60%,#fff799 60%)">重要なテキスト</span>
- 1記事あたり3〜5箇所に使用
- 結論・注意点・ポイントなど重要な短いフレーズに使う
- 見出し（h2/h3）やリンクには使わない

## JSON出力
\`\`\`json
{
  "htmlContent": "HTML形式の記事本文（YouTube埋め込み + 黄色マーカー3〜5箇所含む）",
  "title": "SEOタイトル（60文字以内）",
  "metaDescription": "meta description（120-160文字）",
  "keyword": "メインキーワード",
  "tags": ["タグ1","タグ2","タグ3"],
  "faqSchema": [{"question":"Q","answer":"A"},{"question":"Q","answer":"A"}]
}
\`\`\`

## FAQ（よくある質問）の禁止事項
- 使用感を問う質問（「使い心地は？」「効果はありましたか？」）は入れない
- 医学的効果を断言する回答は禁止
- 捏造した数値は禁止`;
}
