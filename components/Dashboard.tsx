"use client";
import { useState, useEffect, useRef } from "react";

const SITES = [
  { id: 1, name: "ガジェットLab", theme: "tech", domain: "gadget-lab.jp", color: "#00D4FF", articles: 24, revenue: 12800, status: "active" },
  { id: 2, name: "美容の教科書", theme: "beauty", domain: "beauty-textbook.jp", color: "#FF6B9D", articles: 18, revenue: 8400, status: "active" },
  { id: 3, name: "旅するログ", theme: "travel", domain: "tabi-log.jp", color: "#00C896", articles: 0, revenue: 0, status: "setup" },
];
const AFFILIATES = [
  { id: "amazon", name: "Amazon アソシエイト", color: "#FF9900" },
  { id: "rakuten", name: "楽天アフィリエイト", color: "#BF0000" },
  { id: "moshimo", name: "もしもアフィリエイト", color: "#4CAF50" },
];
const INITIAL_QUEUE = [
  { id: 101, site: "ガジェットLab", siteColor: "#00D4FF", title: "2024年おすすめワイヤレスイヤホン比較10選", keyword: "ワイヤレスイヤホン おすすめ", generatedAt: "2024-03-15 09:00", scheduledFor: "2024-03-16 09:00", status: "pending", content: `# 2024年おすすめワイヤレスイヤホン比較10選\n\n## はじめに\nワイヤレスイヤホン選びで「音質・バッテリー・ノイキャン」のどれを重視すべきか迷っていませんか？\n\n## 選び方のポイント\n\n**① 音質**：AAC/aptX/LDACのコーデックで音質が変わります。\n**② ノイズキャンセリング**：通勤・集中作業に必須の機能です。\n**③ バッテリー持ち**：本体+ケース合計20時間以上が目安。\n\n## おすすめモデル3選\n\n### 1位：Sony WF-1000XM5\n業界最高峰のノイズキャンセリング性能。LDAC対応。\n【アフィリエイトリンク挿入予定：Amazon】\n\n### 2位：Apple AirPods Pro（第2世代）\niPhoneユーザーに最適。空間オーディオ対応。\n【アフィリエイトリンク挿入予定：Amazon】\n\n### 3位：Anker Soundcore Liberty 4\n1万円台でLDAC・ノイキャン・外音取り込み全対応。\n【アフィリエイトリンク挿入予定：もしもアフィリエイト】\n\n## まとめ\n迷ったらSony WF-1000XM5が最もバランスの取れた選択肢です。\n\n---\n※ SEOメタディスクリプション：2024年最新ワイヤレスイヤホンおすすめ10選を徹底比較。音質・ノイキャン・コスパ重視別にランキング形式で紹介します。`, comment: "" },
  { id: 102, site: "美容の教科書", siteColor: "#FF6B9D", title: "敏感肌向け保湿クリームランキング【皮膚科医監修】", keyword: "保湿クリーム 敏感肌 おすすめ", generatedAt: "2024-03-15 10:00", scheduledFor: "2024-03-16 10:00", status: "pending", content: `# 敏感肌向け保湿クリームランキング【皮膚科医監修】\n\n## はじめに\n敏感肌の方が保湿クリームを選ぶ際、成分の見落としで肌荒れが悪化することがあります。\n\n## 敏感肌が避けるべき成分\n- 香料・パラベン・鉱物油 / アルコール / 合成着色料\n\n## ランキングTOP3\n\n### 1位：キュレル 潤浸保湿クリーム\nセラミドケア成分配合。医薬部外品で信頼性高い。\n【アフィリエイトリンク挿入予定：楽天】\n\n### 2位：ヒルドイド ソフト軟膏\nヘパリン類似物質配合。高い保湿力が特徴。\n【アフィリエイトリンク挿入予定：Amazon】\n\n### 3位：ドルチボーレ ナチュラルモイスチャークリーム\nオーガニック原料100%。無香料・無着色。\n【アフィリエイトリンク挿入予定：もしもアフィリエイト】\n\n## まとめ\n敏感肌ケアは「引き算」が基本。余分な成分を削ぎ落とした製品を選ぶことが最善策です。`, comment: "" },
];

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: "レビュー待ち",      color: "#FFB347", bg: "#FFB34722" },
  approved:  { label: "承認済み・予約投稿", color: "#00C896", bg: "#00C89622" },
  revision:  { label: "差し戻し",          color: "#FF6B6B", bg: "#FF6B6B22" },
  published: { label: "公開済み",          color: "#888899", bg: "#88889922" },
};

async function sendNotification(payload: {
  type: "pending" | "approved" | "revision";
  title: string; site: string; siteColor: string;
  keyword: string; scheduledFor: string; revisionComment?: string;
}) {
  const res = await fetch("/api/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("review");
  const [selectedSite, setSelectedSite] = useState(SITES[0]);
  const [generating, setGenerating] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [affiliate, setAffiliate] = useState("amazon");
  const [streamText, setStreamText] = useState("");
  const [showGenModal, setShowGenModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewItem, setReviewItem] = useState<any>(null);
  const [queue, setQueue] = useState(INITIAL_QUEUE);
  const [editContent, setEditContent] = useState("");
  const [revisionComment, setRevisionComment] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<"success" | "error" | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    setScheduleDate(d.toISOString().split("T")[0]);
  }, []);

  const pendingCount = queue.filter(q => q.status === "pending").length;
  const revisionCount = queue.filter(q => q.status === "revision").length;

  function openReview(item: any) {
    setReviewItem({ ...item });
    setEditContent(item.content);
    setRevisionComment("");
    setSendResult(null);
    setShowReviewModal(true);
  }

  async function handleApprove() {
    setSending(true);
    const updated = { ...reviewItem, status: "approved", content: editContent };
    setQueue(prev => prev.map(q => q.id === reviewItem.id ? updated : q));
    const ok = await sendNotification({ type: "approved", title: updated.title, site: updated.site, siteColor: updated.siteColor, keyword: updated.keyword, scheduledFor: updated.scheduledFor });
    setSendResult(ok ? "success" : "error");
    setSending(false);
  }

  async function handleRevision() {
    if (!revisionComment.trim()) return;
    setSending(true);
    const updated = { ...reviewItem, status: "revision", comment: revisionComment };
    setQueue(prev => prev.map(q => q.id === reviewItem.id ? updated : q));
    const ok = await sendNotification({ type: "revision", title: updated.title, site: updated.site, siteColor: updated.siteColor, keyword: updated.keyword, scheduledFor: updated.scheduledFor, revisionComment });
    setSendResult(ok ? "success" : "error");
    setSending(false);
  }

  async function generateArticle() {
    if (!keyword.trim()) return;
    setGenerating(true);
    setStreamText("");
    setShowGenModal(true);
    const siteTheme = selectedSite.theme === "tech" ? "ガジェット・テクノロジー" : selectedSite.theme === "beauty" ? "美容・コスメ" : "旅行";
    const afName = AFFILIATES.find(a => a.id === affiliate)?.name ?? "";
    const prompt = `SEOに精通したアフィリエイトブログライターとして記事を作成してください。\n【テーマ】${siteTheme}\n【キーワード】${keyword}\n【アフィリエイト】${afName}\n【文字数】1200字程度\n\n# [タイトル]\n## はじめに\n[導入]\n## [見出し]\n[内容]\n## おすすめ商品3選\n[各商品の後に【アフィリエイトリンク挿入予定：${afName}】と記載]\n## まとめ\n[CTA]\n---\n※ SEOメタディスクリプション（120字以内）：[メタ]`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text ?? "生成に失敗しました";
      let i = 0;
      const iv = setInterval(async () => {
        if (i <= text.length) {
          setStreamText(text.slice(0, i)); i += 10;
          if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
        } else {
          clearInterval(iv);
          setGenerating(false);
          const title = text.match(/^#\s+(.+)/m)?.[1] ?? keyword;
          const newItem = { id: Date.now(), site: selectedSite.name, siteColor: selectedSite.color, title, keyword, generatedAt: new Date().toLocaleString("ja-JP"), scheduledFor: `${scheduleDate} ${scheduleTime}`, status: "pending", content: text, comment: "" };
          setQueue(prev => [newItem, ...prev]);
          setStreamText(text);
          // 生成完了時に通知送信
          await sendNotification({ type: "pending", title, site: selectedSite.name, siteColor: selectedSite.color, keyword, scheduledFor: `${scheduleDate} ${scheduleTime}` });
        }
      }, 16);
    } catch (e: any) {
      setStreamText("エラー: " + e.message);
      setGenerating(false);
    }
  }

  const totalRevenue = SITES.reduce((s, x) => s + x.revenue, 0);

  return (
    <div style={{ fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif", background: "#0A0A0F", minHeight: "100vh", color: "#E8E8F0", display: "flex" }}>

      {/* Sidebar */}
      <aside style={{ width: 220, background: "#0F0F1A", borderRight: "1px solid #1E1E30", display: "flex", flexDirection: "column", padding: "24px 0", flexShrink: 0 }}>
        <div style={{ padding: "0 20px 24px", borderBottom: "1px solid #1E1E30" }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.5px", background: "linear-gradient(135deg,#00D4FF,#00C896)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>● BlogEngine</div>
          <div style={{ fontSize: 11, color: "#555570", marginTop: 2 }}>Affiliate Automation</div>
        </div>
        <nav style={{ padding: "16px 12px", flex: 1 }}>
          {[
            { id: "overview", label: "ダッシュボード", icon: "⬡" },
            { id: "review", label: "レビュー待ち", icon: "◈", badge: pendingCount + revisionCount },
            { id: "generate", label: "記事生成", icon: "✦" },
            { id: "articles", label: "記事一覧", icon: "≡" },
            { id: "affiliate", label: "アフィリエイト", icon: "◎" },
          ].map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: activeTab === item.id ? 700 : 400, background: activeTab === item.id ? "rgba(0,212,255,0.08)" : "transparent", color: activeTab === item.id ? "#00D4FF" : "#888899", transition: "all 0.15s" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{item.icon}</span>{item.label}
              </span>
              {"badge" in item && (item.badge as number) > 0 && <span style={{ background: "#FF6B6B", color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 10, padding: "2px 6px" }}>{item.badge}</span>}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: "auto" }}>
        <header style={{ padding: "20px 32px", borderBottom: "1px solid #1E1E30", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0A0A0F", position: "sticky", top: 0, zIndex: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px" }}>
              {activeTab === "overview" && "ダッシュボード"}
              {activeTab === "review" && <>レビュー待ち {pendingCount > 0 && <span style={{ fontSize: 13, background: "#FF6B6B22", color: "#FF6B6B", borderRadius: 8, padding: "2px 10px", marginLeft: 8 }}>{pendingCount}件</span>}</>}
              {activeTab === "generate" && "AI記事生成"}
              {activeTab === "articles" && "記事一覧"}
              {activeTab === "affiliate" && "アフィリエイト設定"}
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#555570" }}>{new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}</p>
          </div>
          <button onClick={() => setActiveTab("generate")} style={{ background: "linear-gradient(135deg,#00D4FF,#00C896)", border: "none", borderRadius: 10, padding: "10px 20px", color: "#000", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>✦ 記事を生成する</button>
        </header>

        <div style={{ padding: "28px 32px" }}>

          {/* REVIEW */}
          {activeTab === "review" && (
            <div>
              <div style={{ background: "#0F0F1A", border: "1px solid #1E1E30", borderRadius: 12, padding: "14px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#666677", flexWrap: "wrap" }}>
                <span style={{ color: "#00D4FF" }}>✦ AI生成</span><span>→</span>
                <span style={{ color: "#FFB347", fontWeight: 700 }}>◈ あなたがレビュー</span><span>→</span>
                <span style={{ color: "#00C896" }}>✓ 承認で自動投稿</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#555570" }}>承認するまで投稿されません</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {queue.map(item => {
                  const st = STATUS_MAP[item.status];
                  return (
                    <div key={item.id} style={{ background: "#0F0F1A", border: `1px solid ${item.status === "pending" ? (item as any).siteColor + "33" : item.status === "revision" ? "#FF6B6B33" : "#1E1E30"}`, borderRadius: 14, padding: "18px 22px", display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ width: 4, height: 56, borderRadius: 2, background: item.status === "pending" ? (item as any).siteColor : item.status === "revision" ? "#FF6B6B" : "#333344", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>
                          <span style={{ fontSize: 11, color: "#555570" }}>{item.site}</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</div>
                        <div style={{ fontSize: 11, color: "#555570", marginTop: 4, display: "flex", gap: 16, flexWrap: "wrap" }}>
                          <span>生成：{item.generatedAt}</span>
                          <span>投稿予定：{item.scheduledFor}</span>
                          <span style={{ color: "#00C89688" }}>期限なし</span>
                        </div>
                        {item.status === "revision" && item.comment && (
                          <div style={{ marginTop: 8, padding: "8px 12px", background: "#FF6B6B11", border: "1px solid #FF6B6B33", borderRadius: 6, fontSize: 12, color: "#FF9999" }}>💬 {item.comment}</div>
                        )}
                      </div>
                      {item.status !== "published" && item.status !== "approved" && (
                        <button onClick={() => openReview(item)} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${(item as any).siteColor}55`, background: "transparent", color: (item as any).siteColor, fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                          {item.status === "revision" ? "再レビュー" : "レビューする"}
                        </button>
                      )}
                      {item.status === "approved" && <span style={{ padding: "8px 14px", borderRadius: 8, background: "#00C89622", color: "#00C896", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>✓ 予約済み</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 28 }}>
                {[
                  { label: "総収益", value: `¥${totalRevenue.toLocaleString()}`, color: "#00C896" },
                  { label: "公開記事数", value: SITES.reduce((s, x) => s + x.articles, 0), color: "#00D4FF" },
                  { label: "レビュー待ち", value: pendingCount, color: "#FFB347" },
                  { label: "差し戻し中", value: revisionCount, color: "#FF6B6B" },
                ].map((kpi, i) => (
                  <div key={i} style={{ background: "#0F0F1A", border: "1px solid #1E1E30", borderRadius: 14, padding: "20px 22px", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: kpi.color }} />
                    <div style={{ fontSize: 11, color: "#555570", marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{kpi.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
                {SITES.map(site => (
                  <div key={site.id} style={{ background: "#0F0F1A", border: `1px solid ${site.color}33`, borderRadius: 14, padding: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{site.name}</div>
                    <div style={{ fontSize: 11, color: "#555570", marginBottom: 14 }}>{site.domain}</div>
                    <div style={{ display: "flex", gap: 20 }}>
                      <div><div style={{ fontSize: 20, fontWeight: 800, color: site.color }}>{site.articles}</div><div style={{ fontSize: 10, color: "#555570" }}>記事</div></div>
                      <div><div style={{ fontSize: 20, fontWeight: 800, color: site.color }}>¥{site.revenue.toLocaleString()}</div><div style={{ fontSize: 10, color: "#555570" }}>収益</div></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GENERATE */}
          {activeTab === "generate" && (
            <div style={{ maxWidth: 720 }}>
              <div style={{ background: "#0F0F1A", border: "1px solid #1E1E30", borderRadius: 16, padding: 28, marginBottom: 16 }}>
                <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 800 }}>✦ AI記事生成</h2>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: 12, color: "#888899", display: "block", marginBottom: 8, fontWeight: 600 }}>投稿サイト</label>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
                    {SITES.map(site => <button key={site.id} onClick={() => setSelectedSite(site)} style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${selectedSite.id === site.id ? site.color : "#2A2A3C"}`, background: selectedSite.id === site.id ? site.color + "18" : "transparent", color: selectedSite.id === site.id ? site.color : "#666677", fontSize: 13, fontWeight: selectedSite.id === site.id ? 700 : 400, cursor: "pointer" }}>{site.name}</button>)}
                  </div>
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: 12, color: "#888899", display: "block", marginBottom: 8, fontWeight: 600 }}>ターゲットキーワード</label>
                  <input value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === "Enter" && !generating && generateArticle()} placeholder="例：ワイヤレスイヤホン おすすめ" style={{ width: "100%", background: "#14141F", border: "1.5px solid #2A2A3C", borderRadius: 10, padding: "12px 16px", color: "#E8E8F0", fontSize: 14, outline: "none", boxSizing: "border-box" as const }} onFocus={e => (e.target.style.borderColor = selectedSite.color)} onBlur={e => (e.target.style.borderColor = "#2A2A3C")} />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: 12, color: "#888899", display: "block", marginBottom: 8, fontWeight: 600 }}>アフィリエイト</label>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
                    {AFFILIATES.map(af => <button key={af.id} onClick={() => setAffiliate(af.id)} style={{ padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${affiliate === af.id ? af.color : "#2A2A3C"}`, background: affiliate === af.id ? af.color + "18" : "transparent", color: affiliate === af.id ? af.color : "#666677", fontSize: 12, fontWeight: affiliate === af.id ? 700 : 400, cursor: "pointer" }}>{af.name}</button>)}
                  </div>
                </div>
                <div style={{ marginBottom: 24, padding: "14px 16px", background: "#14141F", borderRadius: 10, border: "1px solid #1E1E30" }}>
                  <div style={{ fontSize: 12, color: "#888899", fontWeight: 600, marginBottom: 10 }}>◷ 投稿スケジュール（承認後に有効）</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} style={{ background: "#0F0F1A", border: "1px solid #2A2A3C", borderRadius: 8, padding: "8px 12px", color: "#E8E8F0", fontSize: 13, outline: "none" }} />
                    <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} style={{ background: "#0F0F1A", border: "1px solid #2A2A3C", borderRadius: 8, padding: "8px 12px", color: "#E8E8F0", fontSize: 13, outline: "none" }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#555570", marginTop: 8 }}>※ 承認した後にのみ、この日時に投稿されます</div>
                </div>
                <button onClick={generateArticle} disabled={generating || !keyword.trim()} style={{ width: "100%", background: generating || !keyword.trim() ? "#1A1A28" : `linear-gradient(135deg,${selectedSite.color},${selectedSite.color}BB)`, border: "none", borderRadius: 10, padding: "14px", color: generating || !keyword.trim() ? "#444455" : "#000", fontWeight: 800, fontSize: 15, cursor: generating || !keyword.trim() ? "not-allowed" : "pointer" }}>
                  {generating ? "✦ 生成中..." : "✦ 記事を生成する"}
                </button>
              </div>
              <div style={{ padding: "14px 18px", background: "#0F1A14", border: "1px solid #00C89633", borderRadius: 12, fontSize: 12, color: "#00C896", lineHeight: 1.9 }}>
                ✓ 生成後はレビューキューに追加されます<br />
                ✓ 生成完了時・承認時・差し戻し時に kopperian432432@gmail.com へ自動メール送信<br />
                ✓ 承認するまで投稿は行われません（期限なし）
              </div>
            </div>
          )}

          {/* ARTICLES */}
          {activeTab === "articles" && (
            <div style={{ background: "#0F0F1A", border: "1px solid #1E1E30", borderRadius: 14, overflow: "hidden" }}>
              {[
                { id: 1, site: "ガジェットLab", title: "MacBook Air M3 レビュー", views: 1240, clicks: 89, date: "2024-03-10" },
                { id: 2, site: "美容の教科書", title: "UVケア完全ガイド2024", views: 890, clicks: 62, date: "2024-03-08" },
              ].map((article, i) => (
                <div key={article.id} style={{ display: "flex", alignItems: "center", padding: "14px 20px", borderBottom: i === 0 ? "1px solid #1A1A28" : "none", gap: 14 }}>
                  <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, fontWeight: 700, background: "#00C89622", color: "#00C896", flexShrink: 0 }}>公開中</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{article.title}</div>
                    <div style={{ fontSize: 11, color: "#555570", marginTop: 2 }}>{article.site} · {article.date}</div>
                  </div>
                  <div style={{ display: "flex", gap: 20 }}>
                    <div style={{ textAlign: "right" as const }}><div style={{ fontSize: 13, fontWeight: 700 }}>{article.views.toLocaleString()}</div><div style={{ fontSize: 10, color: "#555570" }}>PV</div></div>
                    <div style={{ textAlign: "right" as const }}><div style={{ fontSize: 13, fontWeight: 700 }}>{article.clicks}</div><div style={{ fontSize: 10, color: "#555570" }}>クリック</div></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* AFFILIATE */}
          {activeTab === "affiliate" && (
            <div style={{ maxWidth: 640 }}>
              {AFFILIATES.map(af => (
                <div key={af.id} style={{ background: "#0F0F1A", border: `1px solid ${af.color}33`, borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: af.color }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{af.name}</div>
                      <div style={{ fontSize: 11, color: "#555570", marginTop: 2 }}>連携設定済み · 自動挿入ON</div>
                    </div>
                  </div>
                  <span style={{ padding: "7px 14px", borderRadius: 8, background: af.color + "22", color: af.color, fontSize: 12, fontWeight: 700 }}>有効</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 記事生成モーダル */}
      {showGenModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "#0F0F1A", border: `1px solid ${selectedSite.color}44`, borderRadius: 16, width: "100%", maxWidth: 720, maxHeight: "82vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #1E1E30", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>
                  {generating ? <span style={{ color: selectedSite.color }}>✦ 記事を生成中...</span> : <span style={{ color: "#00C896" }}>✓ 生成完了 — メール通知を送信しました</span>}
                </div>
                <div style={{ fontSize: 11, color: "#555570", marginTop: 2 }}>{selectedSite.name} · {keyword}</div>
              </div>
              {!generating && (
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setShowGenModal(false)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #2A2A3C", background: "transparent", color: "#888899", fontSize: 13, cursor: "pointer" }}>閉じる</button>
                  <button onClick={() => { setShowGenModal(false); setKeyword(""); setActiveTab("review"); }} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: `linear-gradient(135deg,${selectedSite.color},${selectedSite.color}BB)`, color: "#000", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>レビューへ進む →</button>
                </div>
              )}
            </div>
            <div ref={streamRef} style={{ flex: 1, overflow: "auto", padding: "20px 24px", fontSize: 13, lineHeight: 1.9, color: "#C8C8D8", whiteSpace: "pre-wrap" }}>
              {streamText}{generating && <span style={{ color: selectedSite.color }}>▋</span>}
            </div>
          </div>
        </div>
      )}

      {/* レビューモーダル */}
      {showReviewModal && reviewItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "#0F0F1A", border: `1px solid ${reviewItem.siteColor}44`, borderRadius: 16, width: "100%", maxWidth: 820, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #1E1E30", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{reviewItem.title}</div>
                <div style={{ fontSize: 11, color: "#555570", display: "flex", gap: 16 }}>
                  <span>{reviewItem.site}</span><span>投稿予定：{reviewItem.scheduledFor}</span><span style={{ color: "#00C89688" }}>期限なし</span>
                </div>
              </div>
              <button onClick={() => setShowReviewModal(false)} style={{ background: "none", border: "none", color: "#555570", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: "#888899", fontWeight: 600, display: "block", marginBottom: 8 }}>記事本文（直接編集可）</label>
                <textarea value={editContent} onChange={e => setEditContent(e.target.value)} style={{ width: "100%", minHeight: 300, background: "#14141F", border: "1.5px solid #2A2A3C", borderRadius: 10, padding: "14px 16px", color: "#E8E8F0", fontSize: 13, lineHeight: 1.8, outline: "none", resize: "vertical", boxSizing: "border-box" as const, fontFamily: "inherit" }} onFocus={e => (e.target.style.borderColor = reviewItem.siteColor)} onBlur={e => (e.target.style.borderColor = "#2A2A3C")} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#888899", fontWeight: 600, display: "block", marginBottom: 8 }}>差し戻しコメント（差し戻す場合のみ）</label>
                <input value={revisionComment} onChange={e => setRevisionComment(e.target.value)} placeholder="例：競合比較の情報が不足しています。Apple Watchとの比較を追加してください。" style={{ width: "100%", background: "#14141F", border: "1.5px solid #2A2A3C", borderRadius: 10, padding: "12px 16px", color: "#E8E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" as const }} onFocus={e => (e.target.style.borderColor = "#FF6B6B")} onBlur={e => (e.target.style.borderColor = "#2A2A3C")} />
              </div>
              {sendResult && (
                <div style={{ padding: "10px 14px", background: sendResult === "success" ? "#00C89622" : "#FF6B6B22", border: `1px solid ${sendResult === "success" ? "#00C89644" : "#FF6B6B44"}`, borderRadius: 8, fontSize: 12, color: sendResult === "success" ? "#00C896" : "#FF6B6B" }}>
                  {sendResult === "success" ? "✓ kopperian432432@gmail.com にメール通知を送信しました" : "✗ メール送信に失敗しました。RESEND_API_KEYを確認してください。"}
                </div>
              )}
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #1E1E30", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#555570" }}>承認後：{reviewItem.scheduledFor} に自動投稿</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={handleRevision} disabled={!revisionComment.trim() || sending} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #FF6B6B55", background: "transparent", color: !revisionComment.trim() || sending ? "#444455" : "#FF6B6B", fontSize: 13, fontWeight: 700, cursor: !revisionComment.trim() || sending ? "not-allowed" : "pointer" }}>差し戻す</button>
                <button onClick={handleApprove} disabled={sending} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: sending ? "#1A1A28" : `linear-gradient(135deg,${reviewItem.siteColor},${reviewItem.siteColor}BB)`, color: sending ? "#444455" : "#000", fontSize: 13, fontWeight: 800, cursor: sending ? "not-allowed" : "pointer" }}>
                  {sending ? "送信中..." : "✓ 承認して予約投稿"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
