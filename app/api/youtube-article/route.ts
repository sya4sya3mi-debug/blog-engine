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
      max_tokens: 8000,
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

  // ======== VideoObject + FAQPage スキーマ（構造化データ）========
  const faqItems = (article.faqSchema || []) as { question: string; answer: string }[];
  const videoSchema = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "name": details.title,
    "description": details.description?.slice(0, 300) || article.metaDescription || "",
    "thumbnailUrl": `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    "uploadDate": details.publishedAt || new Date().toISOString(),
    "contentUrl": videoUrl,
    "embedUrl": `https://www.youtube.com/embed/${videoId}`,
    "author": {
      "@type": "Person",
      "name": channelName,
    },
    ...(details.viewCount ? { "interactionStatistic": {
      "@type": "InteractionCounter",
      "interactionType": "https://schema.org/WatchAction",
      "userInteractionCount": Number(details.viewCount),
    }} : {}),
  };
  const faqSchema = faqItems.length >= 2 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqItems.map((f) => ({
      "@type": "Question",
      "name": f.question,
      "acceptedAnswer": { "@type": "Answer", "text": f.answer },
    })),
  } : null;
  const schemaBlock = `\n<script type="application/ld+json">${JSON.stringify(videoSchema)}</script>`
    + (faqSchema ? `\n<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>` : "");
  htmlContent += schemaBlock;

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

  // keywordRomaji（Claudeが生成したローマ字）を優先、なければkeywordを変換
  const romajiRaw = (article.keywordRomaji || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const keywordForSlug = romajiRaw || (article.keyword || "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  const slug = keywordForSlug
    ? `youtube-${videoId}-${keywordForSlug}`
    : `youtube-${videoId}`;

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
  videoDetails: { title: string; channelTitle: string; viewCount?: string; publishedAt?: string },
  geminiUsed: boolean,
  youtubeEmbed: string
): string {
  const channelName = videoDetails.channelTitle;
  const viewCountStr = videoDetails.viewCount
    ? `（再生回数：${Number(videoDetails.viewCount).toLocaleString()}回）`
    : "";
  const publishedStr = videoDetails.publishedAt
    ? `（公開日：${videoDetails.publishedAt.slice(0, 10)}）`
    : "";

  return `あなたは美容ブロガー「みお」です。30代・敏感肌で、美容成分やスキンケアを5年以上研究してきた等身大のブロガーです。Googleで上位表示させるための、読者の検索意図に完全一致したSEO記事を書いてください。

## 参照情報
${context}${productContext}

## YouTube動画埋め込みHTML（必ず配置）
${youtubeEmbed}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SEO戦略（必ず守ること）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 検索意図
この記事を読む人は「${videoDetails.title}」に関して以下の意図を持っている：
- 動画を見る前に内容の要点を知りたい
- 紹介された成分・商品が自分に合うか知りたい
- ${channelName}様の信頼性・専門性を確認したい
これらを全部満たす記事を書くこと。

### キーワード配置ルール
- **冒頭100文字以内**にメインキーワードを必ず含める（Googleが最重視）
- **H2・H3タグ**には必ず検索キーワードを含める（「〜について」「〜の方法」等ではなくキーワードそのもの）
- メインキーワードの出現頻度：本文全体の2〜3%（詰め込みすぎ禁止）

### E-E-A-T（経験・専門性・権威性・信頼性）の強化
- みおの**実体験**を具体的に書く（「私も同じ悩みがあって〜」「実際に使ったことがある〜」）
- ${channelName}様の**専門性・権威性**を示す情報を必ず1段落書く
- 成分解説は**作用機序レベル**（「〇〇がコラーゲン産生を促進するため」等）で書く

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 記事構成（HTML・4500〜6000文字）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### ① 導入文（150文字以内）
- **冒頭1文目**にメインキーワードを含める（例：「〇〇について、人気チャンネルの〜」）
- 「この記事を読むとわかること」を1〜2行で示してから本文へ
- 口調：「〜なんですよね」「〜気になりますよね？」

### ② 「この記事でわかること」ボックス（Featured Snippet狙い・必須）
以下のHTMLで箇条書きボックスを作成：
<div style="background:#f0f9f4;border-left:4px solid #3a8f7a;border-radius:8px;padding:16px 20px;margin:20px 0;">
  <p style="font-weight:bold;font-size:14px;margin:0 0 8px;color:#3a8f7a;">📌 この記事でわかること</p>
  <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.9;">
    <li>動画で紹介された内容のポイント3選</li>
    <li>紹介成分・商品の効果と選び方</li>
    <li>${channelName}様のチャンネルの特徴と信頼性</li>
    <li>みおが実際に試した感想</li>
  </ul>
</div>
※箇条書きの内容は記事の実際の内容に合わせること

### ③ YouTube動画埋め込み
上記のYouTube埋め込みHTMLをここに配置する

### ④ H2：「${channelName}様とはどんなチャンネル？」（200〜300文字）
${viewCountStr}${publishedStr}
- チャンネルの専門ジャンル・視聴者層を書く
- 「〇〇に詳しい」「〇〇で人気の」等、権威性を示す表現を使う
- **E-E-A-T強化**：なぜこのチャンネルが信頼できるかを1〜2文で示す

### ⑤ H2：「動画の要点まとめ｜[メインキーワード]について」（600〜800文字）
${geminiUsed
  ? "Gemini分析の内容をベースに書く。「動画で解説されていたのは〜」「動画内では〜と紹介されていました」と書いてOK"
  : "タイトル・概要欄の情報のみ使用。「概要欄の情報によると〜」「動画タイトルから読み取れる〜」と明示すること"}
- **番号付きリスト（ol）で3〜5つのポイント**を整理 → Featured Snippetに最適
- 各ポイントはH3で見出しをつけ、100〜150文字で解説
- H3には必ずキーワード（成分名・商品名・悩み名）を含める

### ⑥ H2：「[成分名/商品名]の効果・成分解説」（700〜900文字）
${productContext ? productContext : "動画で言及された成分や商品について深掘り解説"}
- **作用機序を具体的に**書く（「〇〇酸が〇〇酵素を阻害することで〜」等）
- 肌悩み別（乾燥・毛穴・シミ・ニキビ等）の効果を整理
- 比較観点（「同成分の他製品との違いは〜」）があるとベター
${productContext ? "- 商品プレースホルダーを適切な位置に配置" : ""}

### ⑦ H2：「みおの実体験レビュー｜実際に[成分/商品]を使ってみた感想」（500〜700文字）
- **具体的な使用シーン・期間・変化**を書く（「朝晩2週間使ったら〜」等）
- 良かった点だけでなく**正直な注意点**も1つ書く（信頼性向上）
- 肌タイプ別（乾燥肌・混合肌・敏感肌）の向き不向きを示す
- 黄色マーカーを2〜3か所使う：<span style="background:linear-gradient(transparent 60%,#fff799 60%)">重要な結論・ポイント</span>

### ⑧ H2：「よくある質問｜[メインキーワード]について」（FAQ・PAA狙い）
Googleの「他のユーザーの質問」（PAA）に掲載されやすい形式で書く：
- Q: [製品/成分]は毎日使っても大丈夫ですか？
- Q: [製品/成分]の効果が出るまでどれくらいかかりますか？
- Q: 敏感肌でも[製品/成分]は使えますか？
→ 各答えは**3〜4文で完結**させる（Googleが引用しやすいよう簡潔に）

### ⑨ H2：「まとめ｜[メインキーワード]を試す前に知っておきたいこと」（200文字）
- 記事全体の結論を1段落で
- 「動画を見て気になった方は〜」という自然なCTAで締める
- 黄色マーカー1か所

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## タイトル・メタの書き方
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### タイトル（titleフィールド）55〜60文字
形式：「[メインキーワード]を[チャンネル名]が徹底解説！動画内容まとめ・成分解析レビュー」
例：「ビタミンC美容液の使い方をプロが徹底解説！動画内容まとめ・おすすめ商品レビュー」
- **数字を入れると良い**（「〇選」「〇つのポイント」）
- 検索ボリュームの高い言葉（「徹底解説」「おすすめ」「口コミ」等）を含める

### metaDescription 120〜160文字
形式：「[キーワード]について[チャンネル名]様のYouTube動画をもとにまとめました。[ポイント]を解説。30代ブロガーみおの実体験レビューもあり。」
- 記事の**具体的な内容**を書く（「〇〇について解説」でなく「〇〇の3つの使い方を解説」）
- 感情を動かす言葉（「気になる」「実際に試した」「正直レビュー」）を入れる

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## タグ選択（許可リストから2〜4個）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
スキンケア / 美白 / シミ対策 / 毛穴ケア / ニキビ / エイジングケア / レチノール / ビタミンC / ナイアシンアミド / セラミド / トラネキサム酸 / 医療脱毛 / 美容クリニック / ハイフ / ボトックス / ダーマペン / ピーリング / シャンプー / ヘアケア / ヘアオイル / 白髪ケア / プチプラ / デパコス / ドラッグストア / 30代 / 40代 / YouTube動画 / 美容YouTube / 動画紹介 / 美容系YouTuber

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ルール・禁止事項
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- YouTubeチャンネル名は必ず「${channelName}様」と敬称
- 原文をそのままコピーしない。必ず自分の言葉で要約・書き直す
- 黄色マーカーは合計3〜5か所（見出し・リンクには使わない）
- 記事末尾の「参考情報」セクションはコード側で自動挿入 → 本文に書かない
- ${geminiUsed
    ? "「動画で紹介されていた」「動画内では」という表現はOK"
    : "「動画で言っていた」「動画で紹介されていた」は禁止。必ず「概要欄の情報によると」と書く"}

${COMPLIANCE_BLOCK}

${REFERENCES_BLOCK}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## JSON出力（必ずこの形式で）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`json
{
  "htmlContent": "HTML形式の記事本文（①〜⑨全セクション含む・黄色マーカー3〜5か所）",
  "title": "SEOタイトル（55〜60文字・数字含む）",
  "metaDescription": "meta description（120〜160文字・具体的内容含む）",
  "keyword": "メインキーワード（英数字・日本語のみ・記号・スペースなし）",
  "keywordRomaji": "メインキーワードのローマ字（半角英数ハイフンのみ・例: vitamin-c-bijin-eki）",
  "tags": ["許可リストから2〜4個"],
  "faqSchema": [
    {"question": "PAA狙いの具体的な質問", "answer": "3〜4文の完結した回答"},
    {"question": "PAA狙いの具体的な質問", "answer": "3〜4文の完結した回答"},
    {"question": "PAA狙いの具体的な質問", "answer": "3〜4文の完結した回答"}
  ]
}
\`\`\`

### FAQ禁止事項
- 「使い心地は？」「効果はありましたか？」等の主観的質問は入れない
- 医学的効果を断言する回答は禁止
- 捏造した数値・研究は禁止`;
}
