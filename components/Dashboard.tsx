"use client";
import { useState, useEffect, useRef } from "react";

const SITES = [
  { id: 1, name: "ガジェットLab", theme: "tech", domain: "gadget-lab.jp", color: "#00D4FF", articles: 24, revenue: 12800, status: "active" },
  { id: 2, name: "美容の教科書", theme: "beauty", domain: "beauty-textbook.jp", color: "#FF6B9D", articles: 18, revenue: 8400, status: "active" },
  { id: 3, name: "旅するログ", theme: "travel", domain: "tabi-log.jp", color: "#00C896", articles: 0, revenue: 0, status: "setup" },
];
const AFFILIATES = [
  { id: "amazon", name: "Amazon", color: "#FF9900" },
  { id: "rakuten", name: "楽天", color: "#BF0000" },
  { id: "moshimo", name: "もしも", color: "#4CAF50" },
];
const INITIAL_QUEUE = [
  { id: 101, site: "ガジェットLab", siteColor: "#00D4FF", title: "2024年おすすめワイヤレスイヤホン比較10選", keyword: "ワイヤレスイヤホン おすすめ", generatedAt: "03/15 09:00", scheduledFor: "2024-03-16 09:00", status: "pending", content: `# 2024年おすすめワイヤレスイヤホン比較10選\n\n## はじめに\nワイヤレスイヤホン選びで迷っていませんか？この記事では2024年最新モデルを徹底比較します。\n\n## 選び方のポイント\n**① 音質**：AAC/aptX/LDACのコーデックで音質が変わります。\n**② ノイズキャンセリング**：通勤・集中作業に必須の機能です。\n**③ バッテリー持ち**：本体+ケース合計20時間以上が目安。\n\n## おすすめモデル3選\n\n### 1位：Sony WF-1000XM5\n業界最高峰のノイズキャンセリング性能。LDAC対応。\n【アフィリエイトリンク挿入予定：Amazon】\n\n### 2位：Apple AirPods Pro（第2世代）\niPhoneユーザーに最適。空間オーディオ対応。\n【アフィリエイトリンク挿入予定：Amazon】\n\n### 3位：Anker Soundcore Liberty 4\n1万円台でLDAC・ノイキャン・外音取り込み全対応。\n【アフィリエイトリンク挿入予定：もしもアフィリエイト】\n\n## まとめ\n迷ったらSony WF-1000XM5が最もバランスの取れた選択肢です。`, comment: "" },
  { id: 102, site: "美容の教科書", siteColor: "#FF6B9D", title: "敏感肌向け保湿クリームランキング【皮膚科医監修】", keyword: "保湿クリーム 敏感肌", generatedAt: "03/15 10:00", scheduledFor: "2024-03-16 10:00", status: "pending", content: `# 敏感肌向け保湿クリームランキング\n\n## はじめに\n敏感肌の方が保湿クリームを選ぶ際、成分の見落としで肌荒れが悪化することがあります。\n\n## 敏感肌が避けるべき成分\n- 香料・パラベン・鉱物油\n- アルコール / 合成着色料\n\n## ランキングTOP3\n\n### 1位：キュレル 潤浸保湿クリーム\nセラミドケア成分配合。医薬部外品で信頼性高い。\n【アフィリエイトリンク挿入予定：楽天】\n\n### 2位：ヒルドイド ソフト軟膏\nヘパリン類似物質配合。高い保湿力が特徴。\n【アフィリエイトリンク挿入予定：Amazon】\n\n### 3位：ドルチボーレ ナチュラルモイスチャークリーム\nオーガニック原料100%。無香料・無着色。\n【アフィリエイトリンク挿入予定：もしもアフィリエイト】\n\n## まとめ\n敏感肌ケアは「引き算」が基本です。`, comment: "" },
  { id: 103, site: "ガジェットLab", siteColor: "#00D4FF", title: "コスパ最強スマートウォッチ7選【2024年版】", keyword: "スマートウォッチ コスパ", generatedAt: "03/14 09:00", scheduledFor: "2024-03-17 09:00", status: "revision", content: "（差し戻し済み）", comment: "Apple Watchへの言及が薄い。競合比較を追加してください。" },
];

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: "レビュー待ち", color: "#FFB347", bg: "#FFB34722" },
  approved:  { label: "承認済み",     color: "#00C896", bg: "#00C89622" },
  revision:  { label: "差し戻し",     color: "#FF6B6B", bg: "#FF6B6B22" },
  published: { label: "公開済み",     color: "#888899", bg: "#88889922" },
};

const NAV_ITEMS = [
  { id: "overview", label: "ホーム",   icon: "⬡" },
  { id: "review",   label: "レビュー", icon: "◈" },
  { id: "generate", label: "生成",     icon: "✦" },
  { id: "articles", label: "記事",     icon: "≡" },
  { id: "affiliate",label: "AF",       icon: "◎" },
];

async function sendNotification(payload: Record<string, string>) {
  try {
    await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } catch {}
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("overview");
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

  useEffect(() => { const d = new Date(); d.setDate(d.getDate() + 1); setScheduleDate(d.toISOString().split("T")[0]); }, []);

  const pendingCount = queue.filter(q => q.status === "pending").length;
  const revisionCount = queue.filter(q => q.status === "revision").length;
  const badgeCount = pendingCount + revisionCount;

  function openReview(item: any) { setReviewItem({ ...item }); setEditContent(item.content); setRevisionComment(""); setSendResult(null); setShowReviewModal(true); }

  async function handleApprove() {
    setSending(true);
    const updated = { ...reviewItem, status: "approved", content: editContent };
    setQueue(prev => prev.map(q => q.id === reviewItem.id ? updated : q));
    await sendNotification({ type: "approved", title: updated.title, site: updated.site, siteColor: updated.siteColor, keyword: updated.keyword, scheduledFor: updated.scheduledFor });
    setSendResult("success"); setSending(false);
  }

  async function handleRevision() {
    if (!revisionComment.trim()) return;
    setSending(true);
    const updated = { ...reviewItem, status: "revision", comment: revisionComment };
    setQueue(prev => prev.map(q => q.id === reviewItem.id ? updated : q));
    await sendNotification({ type: "revision", title: updated.title, site: updated.site, siteColor: updated.siteColor, keyword: updated.keyword, scheduledFor: updated.scheduledFor, revisionComment });
    setSendResult("success"); setSending(false);
  }

 async function generateArticle() {
    if (!keyword.trim()) return;
    setGenerating(true); setStreamText(""); setShowGenModal(true);
    const siteTheme = selectedSite.theme === "tech" ? "ガジェット・テクノロジー" : selectedSite.theme === "beauty" ? "美容・コスメ" : "旅行";
    const afName = AFFILIATES.find(a => a.id === affiliate)?.name ?? "";
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, siteTheme, afName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成に失敗しました");
      const text = data.text ?? "生成に失敗しました";
      let i = 0;
      const iv = setInterval(async () => {
        if (i <= text.length) { setStreamText(text.slice(0, i)); i += 12; if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight; }
        else {
          clearInterval(iv); setGenerating(false);
          const title = text.match(/^#\s+(.+)/m)?.[1] ?? keyword;
          const newItem = { id: Date.now(), site: selectedSite.name, siteColor: selectedSite.color, title, keyword, generatedAt: new Date().toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }), scheduledFor: `${scheduleDate} ${scheduleTime}`, status: "pending", content: text, comment: "" };
          setQueue(prev => [newItem, ...prev]); setStreamText(text);
          await sendNotification({ type: "pending", title, site: selectedSite.name, siteColor: selectedSite.color, keyword, scheduledFor: `${scheduleDate} ${scheduleTime}` });
        }
      }, 16);
    } catch (e: any) { setStreamText("エラー: " + e.message); setGenerating(false); }
  }

  const totalRevenue = SITES.reduce((s, x) => s + x.revenue, 0);
  const bg = "#0A0A0F", card = "#0F0F1A", border = "#1E1E30";

  return (
    <div style={{ fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif", background: bg, minHeight: "100vh", color: "#E8E8F0", paddingBottom: 72 }}>
      <header style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: bg, position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 800, background: "linear-gradient(135deg,#00D4FF,#00C896)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>● BlogEngine</div>
        <button onClick={() => setActiveTab("generate")} style={{ background: "linear-gradient(135deg,#00D4FF,#00C896)", border: "none", borderRadius: 20, padding: "8px 16px", color: "#000", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>✦ 記事生成</button>
      </header>
      <div style={{ padding: "20px 16px" }}>
        {activeTab === "overview" && (<div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>{[{ label: "総収益", value: `¥${totalRevenue.toLocaleString()}`, color: "#00C896" },{ label: "公開記事", value: SITES.reduce((s, x) => s + x.articles, 0), color: "#00D4FF" },{ label: "レビュー待ち", value: pendingCount, color: "#FFB347" },{ label: "差し戻し中", value: revisionCount, color: "#FF6B6B" }].map((kpi, i) => (<div key={i} style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px", position: "relative", overflow: "hidden" }}><div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: kpi.color }} /><div style={{ fontSize: 10, color: "#555570", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{kpi.label}</div><div style={{ fontSize: 24, fontWeight: 800, color: kpi.color }}>{kpi.value}</div></div>))}</div><div style={{ marginBottom: 8, fontSize: 12, color: "#666677", fontWeight: 600 }}>稼働サイト</div><div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{SITES.map(site => (<div key={site.id} style={{ background: card, border: `1px solid ${site.color}33`, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}><div><div style={{ fontWeight: 700, fontSize: 14 }}>{site.name}</div><div style={{ fontSize: 11, color: "#555570", marginTop: 2 }}>{site.domain}</div></div><div style={{ display: "flex", gap: 16, textAlign: "right" as const }}><div><div style={{ fontSize: 18, fontWeight: 800, color: site.color }}>{site.articles}</div><div style={{ fontSize: 10, color: "#555570" }}>記事</div></div><div><div style={{ fontSize: 18, fontWeight: 800, color: site.color }}>¥{site.revenue.toLocaleString()}</div><div style={{ fontSize: 10, color: "#555570" }}>収益</div></div></div></div>))}</div></div>)}
        {activeTab === "review" && (<div><div style={{ background: card, border: `1px solid ${border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 11, color: "#666677", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}><span style={{ color: "#00D4FF" }}>✦ AI生成</span><span>→</span><span style={{ color: "#FFB347", fontWeight: 700 }}>◈ レビュー</span><span>→</span><span style={{ color: "#00C896" }}>✓ 承認で投稿</span><span style={{ marginLeft: "auto", color: "#00C89688", fontSize: 10 }}>期限なし</span></div><div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{queue.map(item => { const st = STATUS_MAP[item.status]; return (<div key={item.id} style={{ background: card, border: `1px solid ${item.status === "pending" ? item.siteColor + "33" : item.status === "revision" ? "#FF6B6B33" : border}`, borderRadius: 12, padding: "14px 16px" }}><div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}><div style={{ width: 3, height: 40, borderRadius: 2, background: item.status === "pending" ? item.siteColor : item.status === "revision" ? "#FF6B6B" : "#333344", flexShrink: 0, marginTop: 2 }} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" as const }}><span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span><span style={{ fontSize: 10, color: "#555570" }}>{item.site}</span></div><div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4, marginBottom: 4 }}>{item.title}</div><div style={{ fontSize: 10, color: "#555570" }}>生成：{item.generatedAt} · 投稿予定：{item.scheduledFor}</div>{item.status === "revision" && item.comment && (<div style={{ marginTop: 8, padding: "6px 10px", background: "#FF6B6B11", border: "1px solid #FF6B6B33", borderRadius: 6, fontSize: 11, color: "#FF9999" }}>💬 {item.comment}</div>)}</div></div>{item.status !== "published" && item.status !== "approved" && (<button onClick={() => openReview(item)} style={{ width: "100%", marginTop: 10, padding: "9px", borderRadius: 8, border: `1px solid ${item.siteColor}55`, background: "transparent", color: item.siteColor, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{item.status === "revision" ? "再レビューする" : "レビューする"}</button>)}{item.status === "approved" && (<div style={{ marginTop: 10, textAlign: "center" as const, padding: "8px", background: "#00C89622", borderRadius: 8, color: "#00C896", fontSize: 12, fontWeight: 700 }}>✓ 予約投稿済み</div>)}</div>); })}</div></div>)}
        {activeTab === "generate" && (<div><div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}><div style={{ fontSize: 15, fontWeight: 800, marginBottom: 18 }}>✦ AI記事生成</div><div style={{ marginBottom: 16 }}><div style={{ fontSize: 11, color: "#888899", marginBottom: 8, fontWeight: 600 }}>投稿サイト</div><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{SITES.map(site => (<button key={site.id} onClick={() => setSelectedSite(site)} style={{ padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${selectedSite.id === site.id ? site.color : "#2A2A3C"}`, background: selectedSite.id === site.id ? site.color + "18" : "transparent", color: selectedSite.id === site.id ? site.color : "#666677", fontSize: 13, fontWeight: selectedSite.id === site.id ? 700 : 400, cursor: "pointer", textAlign: "left" as const }}>{site.name} <span style={{ fontSize: 11, opacity: 0.6 }}>— {site.domain}</span></button>))}</div></div><div style={{ marginBottom: 16 }}><div style={{ fontSize: 11, color: "#888899", marginBottom: 8, fontWeight: 600 }}>ターゲットキーワード</div><input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="例：ワイヤレスイヤホン おすすめ" style={{ width: "100%", background: "#14141F", border: "1.5px solid #2A2A3C", borderRadius: 10, padding: "12px 14px", color: "#E8E8F0", fontSize: 14, outline: "none", boxSizing: "border-box" as const }} onFocus={e => e.target.style.borderColor = selectedSite.color} onBlur={e => e.target.style.borderColor = "#2A2A3C"} /></div><div style={{ marginBottom: 16 }}><div style={{ fontSize: 11, color: "#888899", marginBottom: 8, fontWeight: 600 }}>アフィリエイト</div><div style={{ display: "flex", gap: 8 }}>{AFFILIATES.map(af => (<button key={af.id} onClick={() => setAffiliate(af.id)} style={{ flex: 1, padding: "9px 8px", borderRadius: 8, border: `1.5px solid ${affiliate === af.id ? af.color : "#2A2A3C"}`, background: affiliate === af.id ? af.color + "18" : "transparent", color: affiliate === af.id ? af.color : "#666677", fontSize: 12, fontWeight: affiliate === af.id ? 700 : 400, cursor: "pointer" }}>{af.name}</button>))}</div></div><div style={{ marginBottom: 20, padding: "12px 14px", background: "#14141F", borderRadius: 10, border: `1px solid ${border}` }}><div style={{ fontSize: 11, color: "#888899", fontWeight: 600, marginBottom: 8 }}>◷ 投稿スケジュール（承認後に有効）</div><div style={{ display: "flex", gap: 8 }}><input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} style={{ flex: 1, background: "#0F0F1A", border: `1px solid ${border}`, borderRadius: 8, padding: "8px 10px", color: "#E8E8F0", fontSize: 12, outline: "none", minWidth: 0 }} /><input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} style={{ width: 90, background: "#0F0F1A", border: `1px solid ${border}`, borderRadius: 8, padding: "8px 10px", color: "#E8E8F0", fontSize: 12, outline: "none" }} /></div></div><button onClick={generateArticle} disabled={generating || !keyword.trim()} style={{ width: "100%", background: generating || !keyword.trim() ? "#1A1A28" : `linear-gradient(135deg,${selectedSite.color},${selectedSite.color}BB)`, border: "none", borderRadius: 10, padding: "14px", color: generating || !keyword.trim() ? "#444455" : "#000", fontWeight: 800, fontSize: 14, cursor: generating || !keyword.trim() ? "not-allowed" : "pointer" }}>{generating ? "✦ 生成中..." : "✦ 記事を生成する"}</button></div><div style={{ padding: "12px 16px", background: "#0F1A14", border: "1px solid #00C89633", borderRadius: 12, fontSize: 11, color: "#00C896", lineHeight: 1.9 }}>✓ 生成後はレビューキューに追加されます<br />✓ 承認するまで投稿されません（期限なし）<br />✓ kopperian432432@gmail.com にメール通知</div></div>)}
        {activeTab === "articles" && (<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[{ id: 1, site: "ガジェットLab", title: "MacBook Air M3 レビュー", views: 1240, clicks: 89, date: "03/10" },{ id: 2, site: "美容の教科書", title: "UVケア完全ガイド2024", views: 890, clicks: 62, date: "03/08" }].map(article => (<div key={article.id} style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}><span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 700, background: "#00C89622", color: "#00C896" }}>公開中</span><span style={{ fontSize: 11, color: "#555570" }}>{article.date}</span></div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{article.title}</div><div style={{ fontSize: 11, color: "#555570", marginBottom: 10 }}>{article.site}</div><div style={{ display: "flex", gap: 16 }}><div><span style={{ fontSize: 16, fontWeight: 800, color: "#00D4FF" }}>{article.views.toLocaleString()}</span><span style={{ fontSize: 10, color: "#555570", marginLeft: 4 }}>PV</span></div><div><span style={{ fontSize: 16, fontWeight: 800, color: "#00C896" }}>{article.clicks}</span><span style={{ fontSize: 10, color: "#555570", marginLeft: 4 }}>クリック</span></div></div></div>))}</div>)}
        {activeTab === "affiliate" && (<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[{ id: "amazon", name: "Amazon アソシエイト", color: "#FF9900" },{ id: "rakuten", name: "楽天アフィリエイト", color: "#BF0000" },{ id: "moshimo", name: "もしもアフィリエイト", color: "#4CAF50" }].map(af => (<div key={af.id} style={{ background: card, border: `1px solid ${af.color}33`, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}><div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: af.color, flexShrink: 0 }} /><div><div style={{ fontWeight: 700, fontSize: 13 }}>{af.name}</div><div style={{ fontSize: 11, color: "#555570", marginTop: 2 }}>自動挿入ON</div></div></div><span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, background: af.color + "22", color: af.color, fontWeight: 700 }}>有効</span></div>))}</div>)}
      </div>
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0F0F1A", borderTop: `1px solid ${border}`, display: "flex", zIndex: 20 }}>
        {NAV_ITEMS.map(item => (<button key={item.id} onClick={() => setActiveTab(item.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 4px", border: "none", background: "transparent", cursor: "pointer", position: "relative" }}>{item.id === "review" && badgeCount > 0 && (<span style={{ position: "absolute", top: 6, right: "50%", transform: "translateX(10px)", background: "#FF6B6B", color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: 8, padding: "1px 5px", minWidth: 14, textAlign: "center" }}>{badgeCount}</span>)}<span style={{ fontSize: 18, color: activeTab === item.id ? "#00D4FF" : "#555570" }}>{item.icon}</span><span style={{ fontSize: 10, color: activeTab === item.id ? "#00D4FF" : "#555570", fontWeight: activeTab === item.id ? 700 : 400 }}>{item.label}</span></button>))}
      </nav>
      {showGenModal && (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", flexDirection: "column", zIndex: 100 }}><div style={{ background: card, borderBottom: `1px solid ${border}`, padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontWeight: 800, fontSize: 14, color: generating ? selectedSite.color : "#00C896" }}>{generating ? "✦ 生成中..." : "✓ 生成完了"}</div><div style={{ fontSize: 11, color: "#555570", marginTop: 2 }}>{selectedSite.name} · {keyword}</div></div>{!generating && (<div style={{ display: "flex", gap: 8 }}><button onClick={() => setShowGenModal(false)} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${border}`, background: "transparent", color: "#888899", fontSize: 12, cursor: "pointer" }}>閉じる</button><button onClick={() => { setShowGenModal(false); setKeyword(""); setActiveTab("review"); }} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: `linear-gradient(135deg,${selectedSite.color},${selectedSite.color}BB)`, color: "#000", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>レビューへ →</button></div>)}</div><div ref={streamRef} style={{ flex: 1, overflow: "auto", padding: "16px", fontSize: 13, lineHeight: 1.9, color: "#C8C8D8", whiteSpace: "pre-wrap" }}>{streamText}{generating && <span style={{ color: selectedSite.color }}>▋</span>}</div></div>)}
      {showReviewModal && reviewItem && (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", flexDirection: "column", zIndex: 100 }}><div style={{ background: card, borderBottom: `1px solid ${border}`, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}><div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}><div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.4, marginBottom: 4 }}>{reviewItem.title}</div><div style={{ fontSize: 10, color: "#555570", display: "flex", gap: 10, flexWrap: "wrap" as const }}><span>{reviewItem.site}</span><span>投稿予定：{reviewItem.scheduledFor}</span><span style={{ color: "#00C89688" }}>期限なし</span></div></div><button onClick={() => setShowReviewModal(false)} style={{ background: "none", border: "none", color: "#555570", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button></div><div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}><div><div style={{ fontSize: 11, color: "#888899", fontWeight: 600, marginBottom: 8 }}>記事本文（直接編集可）</div><textarea value={editContent} onChange={e => setEditContent(e.target.value)} style={{ width: "100%", minHeight: 240, background: "#14141F", border: "1.5px solid #2A2A3C", borderRadius: 10, padding: "12px 14px", color: "#E8E8F0", fontSize: 13, lineHeight: 1.8, outline: "none", resize: "vertical", boxSizing: "border-box" as const, fontFamily: "inherit" }} onFocus={e => e.target.style.borderColor = reviewItem.siteColor} onBlur={e => e.target.style.borderColor = "#2A2A3C"} /></div><div><div style={{ fontSize: 11, color: "#888899", fontWeight: 600, marginBottom: 8 }}>差し戻しコメント（差し戻す場合のみ）</div><input value={revisionComment} onChange={e => setRevisionComment(e.target.value)} placeholder="修正内容を入力..." style={{ width: "100%", background: "#14141F", border: "1.5px solid #2A2A3C", borderRadius: 10, padding: "11px 14px", color: "#E8E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" as const }} onFocus={e => e.target.style.borderColor = "#FF6B6B"} onBlur={e => e.target.style.borderColor = "#2A2A3C"} /></div>{sendResult && (<div style={{ padding: "10px 14px", background: sendResult === "success" ? "#00C89622" : "#FF6B6B22", border: `1px solid ${sendResult === "success" ? "#00C89644" : "#FF6B6B44"}`, borderRadius: 8, fontSize: 12, color: sendResult === "success" ? "#00C896" : "#FF6B6B" }}>{sendResult === "success" ? "✓ メール通知を送信しました" : "✗ メール送信に失敗しました"}</div>)}</div><div style={{ background: card, borderTop: `1px solid ${border}`, padding: "12px 16px", display: "flex", gap: 10 }}><button onClick={handleRevision} disabled={!revisionComment.trim() || sending} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #FF6B6B55", background: "transparent", color: !revisionComment.trim() || sending ? "#444455" : "#FF6B6B", fontSize: 13, fontWeight: 700, cursor: !revisionComment.trim() || sending ? "not-allowed" : "pointer" }}>差し戻す</button><button onClick={handleApprove} disabled={sending} style={{ flex: 2, padding: "12px", borderRadius: 10, border: "none", background: sending ? "#1A1A28" : `linear-gradient(135deg,${reviewItem.siteColor},${reviewItem.siteColor}BB)`, color: sending ? "#444455" : "#000", fontSize: 13, fontWeight: 800, cursor: sending ? "not-allowed" : "pointer" }}>{sending ? "送信中..." : "✓ 承認して予約投稿"}</button></div></div>)}
    </div>
  );
}
