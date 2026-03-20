import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
      try {
              const { title, content, status = "draft" } = await req.json();
              const wpUrl = process.env.WP_URL;
              const wpUsername = process.env.WP_USERNAME;
              const wpAppPassword = process.env.WP_APP_PASSWORD;
              if (!wpUrl || !wpUsername || !wpAppPassword) {
                        return NextResponse.json({ error: "WP env vars missing" }, { status: 500 });
              }
              const credentials = Buffer.from(wpUsername + ":" + wpAppPassword).toString("base64");
              const res = await fetch(wpUrl + "/wp-json/wp/v2/posts", {
                        method: "POST",
                        headers: {
                                    "Content-Type": "application/json",
                                    "Authorization": "Basic " + credentials,
                        },
                        body: JSON.stringify({ title, content, status }),
              });
              const responseText = await res.text();
              if (!res.ok) {
                        console.error("WP API error status:", res.status, "body:", responseText.slice(0, 500));
                        return NextResponse.json({ error: "WP post failed", status: res.status, body: responseText.slice(0, 200) }, { status: 500 });
              }
              let data;
              try {
                        data = JSON.parse(responseText);
              } catch {
                        console.error("WP JSON parse error:", responseText.slice(0, 500));
                        return NextResponse.json({ error: "WP returned invalid JSON", body: responseText.slice(0, 200) }, { status: 500 });
              }
              return NextResponse.json({
                        ok: true,
                        postId: data.id,
                        postUrl: data.link,
                        editUrl: wpUrl + "/wp-admin/post.php?post=" + data.id + "&action=edit",
              });
      } catch (err: any) {
              console.error("WP route error:", err.message || err);
              return NextResponse.json({ error: "Internal server error: " + (err.message || "unknown") }, { status: 500 });
      }
}
