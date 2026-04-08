/**
 * WordPress SEO クリーンアップスクリプト
 * 1. 全記事のpost_contentからJSON-LDスクリプトタグを除去
 * 2. 記事1件以下の薄いタグを削除
 */

const WP_URL = "https://blog-engine.com";
const WP_USER = "kopperian";
const WP_PASS = "vW1v 7TNI XMds 9o7S sUNe 4d0X";
const AUTH = Buffer.from(`${WP_USER}:${WP_PASS}`).toString("base64");

const authHeaders = {
  Authorization: `Basic ${AUTH}`,
  "Content-Type": "application/json",
};

// ─────────────────────────────────────────
// 1. 記事のJSON-LD重複スキーマを除去
// ─────────────────────────────────────────
async function cleanupSchemas() {
  console.log("\n=== Phase 1: JSON-LDスキーマ除去 ===");
  let page = 1;
  let total = 0;
  let cleaned = 0;

  while (true) {
    const res = await fetch(
      `${WP_URL}/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=id,title,content&context=edit&status=publish,draft,future,pending`,
      { headers: authHeaders }
    );

    if (!res.ok) {
      console.error(`投稿取得エラー: HTTP ${res.status}`);
      break;
    }

    const posts = await res.json();
    if (!posts.length) break;

    for (const post of posts) {
      total++;
      const raw = post.content?.raw ?? "";
      if (!raw.includes("application/ld+json")) continue;

      // JSON-LDスクリプトタグをすべて除去
      const cleaned_content = raw.replace(
        /<script\s+type=["']application\/ld\+json["'][\s\S]*?<\/script>\s*/gi,
        ""
      );

      if (cleaned_content === raw) continue;

      const updateRes = await fetch(
        `${WP_URL}/wp-json/wp/v2/posts/${post.id}`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ content: cleaned_content }),
        }
      );

      const title = post.title?.rendered ?? `ID:${post.id}`;
      if (updateRes.ok) {
        console.log(`  ✓ クリーン済み: ${title}`);
        cleaned++;
      } else {
        console.error(`  ✗ 更新失敗 (${updateRes.status}): ${title}`);
      }
    }

    page++;
  }

  console.log(`\n  合計 ${total} 記事をチェック → ${cleaned} 記事をクリーンアップ`);
}

// ─────────────────────────────────────────
// 2. 薄いタグを削除（記事1件以下）
// ─────────────────────────────────────────
async function cleanupTags() {
  console.log("\n=== Phase 2: 薄いタグ削除 ===");

  const res = await fetch(
    `${WP_URL}/wp-json/wp/v2/tags?per_page=100&_fields=id,name,count&hide_empty=false`,
    { headers: authHeaders }
  );

  if (!res.ok) {
    console.error(`タグ取得エラー: HTTP ${res.status}`);
    return;
  }

  const tags = await res.json();
  console.log(`  合計 ${tags.length} タグを確認中...`);

  let deleted = 0;
  let kept = [];

  for (const tag of tags) {
    if (tag.count <= 1) {
      const delRes = await fetch(
        `${WP_URL}/wp-json/wp/v2/tags/${tag.id}?force=true`,
        { method: "DELETE", headers: authHeaders }
      );
      if (delRes.ok) {
        console.log(`  ✓ 削除: "${tag.name}" (${tag.count}記事)`);
        deleted++;
      } else {
        console.error(`  ✗ 削除失敗 (${delRes.status}): "${tag.name}"`);
      }
    } else {
      kept.push(`${tag.name}(${tag.count})`);
    }
  }

  console.log(`\n  ${deleted} タグ削除 / ${kept.length} タグ保持`);
  if (kept.length) {
    console.log(`  保持されたタグ: ${kept.join(", ")}`);
  }
}

// ─────────────────────────────────────────
// メイン実行
// ─────────────────────────────────────────
async function main() {
  console.log("WordPress SEO クリーンアップ開始");
  console.log(`対象サイト: ${WP_URL}`);

  await cleanupSchemas();
  await cleanupTags();

  console.log("\n=== 完了 ===");
}

main().catch(console.error);
