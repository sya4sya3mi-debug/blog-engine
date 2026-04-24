// ==========================================
// BlogEngine V2 - 既存記事リライトエンドポイント
// SEO改善 / 商品追加 / 総合改善
// タイムアウト対策: Edge Runtime + ストリーミングレスポンス
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { WordPressClient } from "@/lib/wordpress";
import { rewriteArticle, type RewriteMode } from "@/lib/generate";
import { replaceInternalLinkPlaceholders, rankRelatedPosts, buildRelatedPostsContext } from "@/lib/internal-links";
import { replaceAffiliatePlaceholders } from "@/lib/affiliate";
import { searchRakutenProducts, buildRakutenAffiliateHtml } from "@/lib/rakuten";

export const runtime = "nodejs";
export const maxDuration = 300;

// GET: 公開記事一覧（リライト候補）— 直近100件を高速取得
export async function GET() {
  try {
    const config = getConfig();
    const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);
    const recent = await wp.getRecentPosts(100);
    const posts = recent
      .filter((p) => p.status === "publish")
      .map((p) => ({
        id: p.id,
        title: p.title?.rendered || "",
        slug: p.slug,
        link: p.link,
      }));

    return NextResponse.json({ posts, total: posts.length });
  } catch (e: any) {
    return NextResponse.json({ error: `取得エラー: ${e.message}` }, { status: 500 });
  }
}

// POST: リライト実行（ストリーミング — タイムアウト対策）
export async function POST(req: NextRequest) {
  const config = getConfig();
  const body = await req.json() as {
    postId: number;
    mode: RewriteMode;
    keyword?: string;
    themeLabel?: string;
    products?: string[];
    autoUpdate?: boolean;
  };

  const { postId, mode, keyword, themeLabel, products, autoUpdate } = body;

  if (!postId || !mode) {
    return NextResponse.json({ error: "postId と mode は必須です" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // ハートビート（タイムアウト防止）
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(" ")); } catch {}
      }, 3000);

      try {
        const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);

        // 1. 既存記事取得
        const existing = await wp.getPost(postId);

        // 2. 内部リンクモードの場合: 全記事の関連度分析を実行
        let relatedPostsContext: string | undefined;
        if (mode === "internal-links") {
          try {
            // 全公開記事を取得（本文含む）して関連度スコアリング
            const allPublished = await wp.getRecentPosts(100);
            const allPostsWithContent = await Promise.all(
              allPublished
                .filter((p) => p.status === "publish" && p.id !== postId)
                .map(async (p) => {
                  try {
                    const full = await wp.getPost(p.id);
                    return { id: p.id, title: full.title, link: p.link, slug: p.slug, content: full.content };
                  } catch {
                    return { id: p.id, title: p.title?.rendered || "", link: p.link, slug: p.slug, content: "" };
                  }
                })
            );
            const ranked = rankRelatedPosts(existing.title, existing.content, allPostsWithContent, 8);
            relatedPostsContext = buildRelatedPostsContext(ranked);
          } catch {
            relatedPostsContext = undefined;
          }
        }

        // 3. Claude でリライト
        const article = await rewriteArticle(
          config.anthropicApiKey,
          existing.content,
          existing.title,
          mode,
          { keyword, themeLabel, products, relatedPostsContext },
        );

        let htmlContent = article.htmlContent;

        // 4. 内部リンクプレースホルダー置換（internal-linksモードではClaudeが直接URL埋め込み済みなのでスキップ可）
        try {
          const existingPosts = await wp.getRecentPosts(50);
          const postData = existingPosts.map((p) => ({
            slug: p.slug,
            link: p.link,
            title: p.title?.rendered || "",
          }));
          htmlContent = replaceInternalLinkPlaceholders(htmlContent, config.wpSiteUrl, postData);
        } catch {
          htmlContent = replaceInternalLinkPlaceholders(htmlContent, config.wpSiteUrl);
        }

        // 5. アフィリエイトプレースホルダー置換（楽天自動検索）
        const placeholderCheck = /<p\s+class="affiliate-placeholder">/;
        if (placeholderCheck.test(htmlContent)) {
          const rakutenAppId = process.env.RAKUTEN_APP_ID;
          const rakutenAffiliateId = process.env.RAKUTEN_AFFILIATE_ID;
          const rakutenAccessKey = process.env.RAKUTEN_ACCESS_KEY;
          if (rakutenAppId && rakutenAffiliateId) {
            try {
              const searchKw = keyword || article.keyword || existing.title.slice(0, 20);
              const found = await searchRakutenProducts(
                rakutenAppId, rakutenAffiliateId, searchKw, 5, rakutenAccessKey,
                { maxResults: 3, expandKeywords: true },
              );
              if (found.length > 0) {
                const autoLinks = found.map((p) => ({ themeId: "auto", html: buildRakutenAffiliateHtml(p) }));
                htmlContent = replaceAffiliatePlaceholders(htmlContent, autoLinks);
              }
            } catch {}
          }
          htmlContent = htmlContent.replace(/<p\s+class="affiliate-placeholder">[^<]*<\/p>/g, "");
        }

        // 6. WordPress 更新（autoUpdate の場合）
        let updated = false;
        if (autoUpdate) {
          await wp.updatePost(postId, {
            title: article.title,
            content: htmlContent,
            meta: {
              _seo_description: article.metaDescription,
              _yoast_wpseo_title: article.seoTitle,
              _yoast_wpseo_focuskw: article.focusKeyword,
              _yoast_wpseo_metadesc: article.metaDescription,
            },
          });
          updated = true;
        }

        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify({
          success: true,
          postId,
          updated,
          article: {
            title: article.title,
            seoTitle: article.seoTitle,
            metaDescription: article.metaDescription,
            htmlContent,
            slug: article.slug,
            focusKeyword: article.focusKeyword,
            tags: article.tags,
            keyword: article.keyword,
            themeLabel: article.themeLabel,
            faqSchema: article.faqSchema,
            seoNotes: article.seoNotes,
            internalLinks: article.internalLinks,
            externalSources: article.externalSources,
            imageSeo: article.imageSeo,
          },
          original: {
            title: existing.title,
            content: existing.content,
            meta: existing.meta || {},
          },
        })));
        controller.close();
      } catch (e: any) {
        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify({ success: false, error: `リライトエラー: ${e.message}` })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
