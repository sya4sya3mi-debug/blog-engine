// ==========================================
// WordPress カスタムCSS注入API
// ウィジェットREST APIを使用してCSSを追加
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

function getAuth(config: ReturnType<typeof getConfig>): string {
  return btoa(`${config.wpUsername}:${config.wpAppPassword}`);
}

// GET: 現在のカスタムCSSウィジェットを取得
export async function GET(req: NextRequest) {
  const config = getConfig();
  const auth = getAuth(config);

  try {
    // ウィジェット一覧から既存のCSS注入ウィジェットを探す
    const res = await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/widgets`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch widgets", status: res.status }, { status: 500 });
    }
    const widgets = await res.json();
    const cssWidget = widgets.find((w: any) =>
      w.id_base === "custom_html" &&
      w.rendered?.includes("blogengine-custom-css")
    );

    return NextResponse.json({
      success: true,
      exists: !!cssWidget,
      widget: cssWidget || null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: カスタムCSSを追加/更新
export async function POST(req: NextRequest) {
  const config = getConfig();
  const auth = getAuth(config);
  const { css } = await req.json();

  if (!css) {
    return NextResponse.json({ error: "CSS is required" }, { status: 400 });
  }

  const styleHtml = `<!-- blogengine-custom-css -->\n<style>\n${css}\n</style>`;

  try {
    // まずサイドバー一覧を取得
    const sidebarsRes = await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/sidebars`, {
      headers: { Authorization: `Basic ${auth}` },
    });

    let sidebarId = "sidebar-1"; // デフォルト
    if (sidebarsRes.ok) {
      const sidebars = await sidebarsRes.json();
      if (sidebars.length > 0) {
        // footerかsidebar-1を優先
        const footer = sidebars.find((s: any) => s.id.includes("footer"));
        sidebarId = footer?.id || sidebars[0].id;
      }
    }

    // 既存のCSS注入ウィジェットを探す
    const widgetsRes = await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/widgets`, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (widgetsRes.ok) {
      const widgets = await widgetsRes.json();
      const existing = widgets.find((w: any) =>
        w.id_base === "custom_html" &&
        (w.rendered?.includes("blogengine-custom-css") ||
         w.instance?.raw?.content?.includes("blogengine-custom-css"))
      );

      if (existing) {
        // 既存ウィジェットを更新
        const updateRes = await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/widgets/${existing.id}`, {
          method: "PUT",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id_base: "custom_html",
            instance: { raw: { title: "", content: styleHtml } },
            sidebar: existing.sidebar,
          }),
        });

        if (updateRes.ok) {
          return NextResponse.json({ success: true, action: "updated", widgetId: existing.id });
        }
      }
    }

    // 新規ウィジェット作成
    const createRes = await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/widgets`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id_base: "custom_html",
        instance: { raw: { title: "", content: styleHtml } },
        sidebar: sidebarId,
      }),
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      return NextResponse.json({
        error: "Failed to create widget",
        status: createRes.status,
        detail: errorText,
      }, { status: 500 });
    }

    const created = await createRes.json();
    return NextResponse.json({ success: true, action: "created", widgetId: created.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
