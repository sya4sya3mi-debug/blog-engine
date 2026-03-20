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
  { id: 101, site: "ガジェットLab", siteColor: "#00D4FF", title: "2024年おすすめワイヤレスイヤホン比較10選", keyword: "ワイヤレスイヤホン おすすめ", generatedAt: "03/15 09:00", scheduledFor: "2024-03-16 09:00", status: "pending", content: "# 2024年おすすめワイヤレスイヤホン比較10選\n\n## はじめに\nワイヤレスイヤホン選びで迷っていませんか？\n\n## おすすめモデル3選\n\n### 1位：Sony WF-1000XM5\n【アフィリエイトリンク挿入予定：Amazon】\n\n### 2位：Apple AirPods Pro\n【アフィリエイトリンク挿入予定：Amazon】\n\n### 3位：Anker Soundcore Liberty 4\n【アフィリエイトリンク挿入予定：もしもアフィリエイト】\n\n## まとめ\n迷ったらSony WF-1000XM5がおすすめです。", comment: "" },
  { id: 102, site: "美容の教科書", siteColor: "#FF6B9D", title: "敏感肌向け保湿クリームランキング【皮膚科医監修】", keyword: "保湿クリーム 敏感肌", generatedAt: "03/15 10:00", scheduledFor: "2024-03-16 10:00", status: "pending", content: "# 敏感肌向け保湿クリームランキング\n\n## はじめに\n敏感肌の方が保湿クリームを選ぶ際の注意点を解説します。\n\n## ランキングTOP3\n\n### 1位：キュレル 潤浸保湿クリーム\n【アフィリエイトリンク挿入予定：楽天】\n\n### 2位：ヒルドイド ソフト軟膏\n【アフィリエイトリンク挿入予定：Amazon】\n\n### 3位：ドルチボーレ ナチュラルモイスチャークリーム\n【アフィリエイトリンク挿入予定：もしもアフィリエイト】\n\n## まとめ\n敏感肌ケアは「引き算」が基本です。", comment: "" },
  { id: 103, site: "ガジェットLab", siteColor: "#00D4FF", title: "コスパ最強スマートウォッチ7選【2024年版】", keyword: "スマートウォッチ コスパ", generatedAt: "03/14 09:00", scheduledFor: "2024-03-17 09:00", status: "revision", content: "（差し戻し済み）", comment: "Apple Watchへの言及が薄い。競合比較を追加してください。" },
];
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: "レビュー待ち", color: "#FFB347", bg: "#FFB34722" },
  approved:  { label: "承認済み",     color: "#00C896", bg: "#00C89622" },
  revision:  { label: "差し戻し",     color: "#FF6B6B", bg: "#FF6B6B22" },
  published: { label: "公開済み",     color: "#888899", bg: "#88889922" },
};
const PUBLISHED_ARTICLES = [
  { id: 1, site: "ガジェットLab", title: "MacBook Air M3 レビュー", views: 1240, clicks: 89, date: "03/10" },
  { id: 2, site: "美容の教科書", title: "UVケア完全ガイド2024", views: 890, clicks: 62, date: "03/08" },
];

async function sendNotification(payload: Record<string, string>) {
  try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); } catch {}
}

function useDashboard() {
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

  return { activeTab, setActiveTab, selectedSite, setSelectedSite, generating, keyword, setKeyword, affiliate, setAffiliate, streamText, showGenModal, setShowGenModal, showReviewModal, setShowReviewModal, reviewItem, queue, editContent, setEditContent, revisionComment, setRevisionComment, scheduleDate, setScheduleDate, scheduleTime, setScheduleTime, sending, sendResult, streamRef, pendingCount, revisionCount, openReview, handleApprove, handleRevision, generateArticle };
}

const S = { bg: "#0A0A0F", card: "#0F0F1A", border: "#1E1E30" };

function StatusBadge({ status }: { status: string }) {
  const st = STATUS_MAP[status] ?? STATUS_MAP.published;
  return <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>;
}

function QueueItem({ item, onReview, mobile = false }: { item: any; onReview: (item: any) => void; mobile?: boolean }) {
  return (
    <div style={{ background: S.card, border: `1px solid ${item.status === "pending" ? item.siteColor + "33" : item.status === "revision" ? "#FF6B6B33" : S.border}`, borderRadius: 14, padding: mobile ? "14px 16px" : "18px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 4, height: 48, borderRadius: 2, background: item.status === "pending" ? item.siteColor : item.status === "revision" ? "#FF6B6B" : "#333344", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" as const }}><StatusBadge status={item.status} /><span style={{ fontSize: 11, color: "#555570" }}>{item.site}</span></div>
          <div style={{ fontSize: mobile ? 13 : 14, fontWeight: 700, whiteSpace: mobile ? "normal" : "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.4 }}>{item.title}</div>
          <div style={{ fontSize: 11, color: "#555570", marginTop: 4 }}>投稿予定：{item.scheduledFor} <span style={{ color: "#00C89688" }}>· 期限なし</span></div>
          {item.status === "revision" && item.comment && (<div style={{ marginTop: 8, padding: "7px 10px", background: "#FF6B6B11", border: "1px solid #FF6B6B33", borderRadius: 6, fontSize: 12, color: "#FF9999" }}>💬 {item.comment}</div>)}
        </div>
        {!mobile && item.status !== "published" && item.status !== "approved" && (<button onClick={() => onReview(item)} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${item.siteColor}55`, background: "transparent", color: item.siteColor, fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>{item.status === "revision" ? "再レビュー" : "レビューする"}</button>)}
        {!mobile && item.status === "approved" && <span style={{ padding: "8px 14px", borderRadius: 8, background: "#00C89622", color: "#00C896", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>✓ 予約済み</span>}
      </div>
      {mobile && item.status !== "published" && item.status !== "approved" && (<button onClick={() => onReview(item)} style={{ width: "100%", marginTop: 10, padding: "10px", borderRadius: 8, border: `1px solid ${item.siteColor}55`, background: "transparent", color: item.siteColor, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{item.status === "revision" ? "再レビューする" : "レビューする"}</button>)}
      {mobile && item.status === "approved" && (<div style={{ marginTop: 10, textAlign: "center" as const, padding: "8px", background: "#00C89622", borderRadius: 8, color: "#00C896", fontSize: 12, fontWeight: 700 }}>✓ 予約投稿済み</div>)}
    </div>
  );
}

function ReviewModal({ d, mobile = false }: { d: ReturnType<typeof useDashboard>; mobile?: boolean }) {
  if (!d.showReviewModal || !d.reviewItem) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: mobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: mobile ? 0 : 20 }}>
      <div style={{ background: S.card, border: `1px solid ${d.reviewItem.siteColor}44`, borderRadius: mobile ? "16px 16px 0 0" : 16, width: "100%", maxWidth: mobile ? "100%" : 820, maxHeight: mobile ? "92vh" : "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: mobile ? "16px" : "18px 24px", borderBottom: `1px solid ${S.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}><div style={{ fontWeight: 800, fontSize: mobile ? 14 : 16, lineHeight: 1.4, marginBottom: 4 }}>{d.reviewItem.title}</div><div style={{ fontSize: 11, color: "#555570", display: "flex", gap: 12, flexWrap: "wrap" as const }}><span>{d.reviewItem.site}</span><span>投稿予定：{d.reviewItem.scheduledFor}</span><span style={{ color: "#00C89688" }}>期限なし</span></div></div>
          <button onClick={() => d.setShowReviewModal(false)} style={{ background: "none", border: "none", color: "#555570", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: mobile ? "16px" : "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={{ fontSize: 12, color: "#888899", fontWeight: 600, display: "block", marginBottom: 8 }}>記事本文（直接編集可）</label><textarea value={d.editContent} onChange={e => d.setEditContent(e.target.value)} style={{ width: "100%", minHeight: mobile ? 200 : 300, background: "#14141F", border: "1.5px solid #2A2A3C", borderRadius: 10, padding: "12px 14px", color: "#E8E8F0", fontSize: 13, lineHeight: 1.8, outline: "none", resize: "vertical", boxSizing: "border-box" as const, fontFamily: "inherit" }} onFocus={e => e.target.style.borderColor = d.reviewItem.siteColor} onBlur={e => e.target.style.borderColor = "#2A2A3C"} /></div>
          <div><label style={{ fontSize: 12, color: "#888899", fontWeight: 600, display: "block", marginBottom: 8 }}>差し戻しコメント（差し戻す場合のみ）</label><input value={d.revisionComment} onChange={e => d.setRevisionComment(e.target.value)} placeholder="修正内容を入力..." style={{ width: "100%", background: "#14141F", border: "1.5px solid #2A2A3C", borderRadius: 10, padding: "11px 14px", color: "#E8E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" as const }} onFocus={e => e.target.style.borderColor = "#FF6B6B"} onBlur={e => e.target.style.borderColor = "#2A2A3C"} /></div>
          {d.sendResult && (<div style={{ padding: "10px 14px", background: d.sendResult === "success" ? "#00C89622" : "#FF6B6B22", border: `1px solid ${d.sendResult === "success" ? "#00C89644" : "#FF6B6B44"}`, borderRadius: 8, fontSize: 12, color: d.sendResult === "success" ? "#00C896" : "#FF6B6B" }}>{d.sendResult === "success" ? "✓ メール通知を送信しました" : "✗ メール送信に失敗しました"}</div>)}
        </div>
        <div style={{ padding: mobile ? "12px 16px" : "16px 24px", borderTop: `1px solid ${S.border}`, display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
          {!mobile && <div style={{ fontSize: 12, color: "#555570" }}>承認後：{d.reviewItem.scheduledFor} に自動投稿</div>}
          <div style={{ display: "flex", gap: 10, flex: mobile ? 1 : "none" }}>
            <button onClick={d.handleRevision} disabled={!d.revisionComment.trim() || d.sending} style={{ flex: mobile ? 1 : "none", padding: mobile ? "12px" : "10px 20px", borderRadius: 10, border: "1px solid #FF6B6B55", background: "transparent", color: !d.revisionComment.trim() || d.sending ? "#444455" : "#FF6B6B", fontSize: 13, fontWeight: 700, cursor: !d.revisionComment.trim() || d.sending ? "not-allowed" : "pointer" }}>差し戻す</button>
            <button onClick={d.handleApprove} disabled={d.sending} style={{ flex: mobile ? 2 : "none", padding: mobile ? "12px" : "10px 24px", borderRadius: 10, border: "none", background: d.sending ? "#1A1A28" : `linear-gradient(135deg,${d.reviewItem.siteColor},${d.reviewItem.siteColor}BB)`, color: d.sending ? "#444455" : "#000", fontSize: 13, fontWeight: 800, cursor: d.sending ? "not-allowed" : "pointer" }}>{d.sending ? "送信中..." : "✓ 承認して予約投稿"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GenModal({ d, mobile = false }: { d: ReturnType<typeof useDashboard>; mobile?: boolean }) {
  if (!d.showGenModal) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", flexDirection: "column", zIndex: 100 }}>
      <div style={{ background: S.card, borderBottom: `1px solid ${S.border}`, padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><div style={{ fontWeight: 800, fontSize: 14, color: d.generating ? d.selectedSite.color : "#00C896" }}>{d.generating ? "✦ 生成中..." : "✓ 生成完了"}</div><div style={{ fontSize: 11, color: "#555570", marginTop: 2 }}>{d.selectedSite.name} · {d.keyword}</div></div>
        {!d.generating && (<div style={{ display: "flex", gap: 8 }}><button onClick={() => d.setShowGenModal(false)} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${S.border}`, background: "transparent", color: "#888899", fontSize: 12, cursor: "pointer" }}>閉じる</button><button onClick={() => { d.setShowGenModal(false); d.setKeyword(""); d.setActiveTab("review"); }} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: `linear-gradient(135deg,${d.selectedSite.color},${d.selectedSite.color}BB)`, color: "#000", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>レビューへ →</button></div>)}
      </div>
      <div ref={d.streamRef} style={{ flex: 1, overflow: "auto", padding: "16px", fontSize: 13, lineHeight: 1.9, color: "#C8C8D8", whiteSpace: "pre-wrap" }}>{d.streamText}{d.generating && <span style={{ color: d.selectedSite.color }}>▋</span>}</div>
    </div>
  );
}

function GenerateForm({ d, mobile = false }: { d: ReturnType<typeof useDashboard>; mobile?: boolean }) {
  return (
    <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 16, padding: mobile ? 20 : 28, marginBottom: 16 }}>
      {!mobile && <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 800 }}>✦ AI記事生成</h2>}
      <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, color: "#888899", display: "block", marginBottom: 8, fontWeight: 600 }}>投稿サイト</label><div style={{ display: "flex", flexDirection: mobile ? "column" : "row", gap: mobile ? 8 : 10 }}>{SITES.map(site => (<button key={site.id} onClick={() => d.setSelectedSite(site)} style={{ padding: mobile ? "10px 14px" : "8px 16px", borderRadius: 8, border: `1.5px solid ${d.selectedSite.id === site.id ? site.color : "#2A2A3C"}`, background: d.selectedSite.id === site.id ? site.color + "18" : "transparent", color: d.selectedSite.id === site.id ? site.color : "#666677", fontSize: 13, fontWeight: d.selectedSite.id === site.id ? 700 : 400, cursor: "pointer", textAlign: "left" as const }}>{site.name}{mobile && <span style={{ fontSize: 11, opacity: 0.6 }}> — {site.domain}</span>}</button>))}</div></div>
      <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, color: "#888899", display: "block", marginBottom: 8, fontWeight: 600 }}>ターゲットキーワード</label><input value={d.keyword} onChange={e => d.setKeyword(e.target.value)} placeholder="例：ワイヤレスイヤホン おすすめ" style={{ width: "100%", background: "#14141F", border: "1.5px solid #2A2A3C", borderRadius: 10, padding: "12px 14px", color: "#E8E8F0", fontSize: 14, outline: "none", boxSizing: "border-box" as const }} onFocus={e => e.target.style.borderColor = d.selectedSite.color} onBlur={e => e.target.style.borderColor = "#2A2A3C"} /></div>
      <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, color: "#888899", display: "block", marginBottom: 8, fontWeight: 600 }}>アフィリエイト</label><div style={{ display: "flex", gap: 8 }}>{AFFILIATES.map(af => <button key={af.id} onClick={() => d.setAffiliate(af.id)} style={{ flex: 1, padding: "9px 8px", borderRadius: 8, border: `1.5px solid ${d.affiliate === af.id ? af.color : "#2A2A3C"}`, background: d.affiliate === af.id ? af.color + "18" : "transparent", color: d.affiliate === af.id ? af.color : "#666677", fontSize: 12, fontWeight: d.affiliate === af.id ? 700 : 400, cursor: "pointer" }}>{af.name}</button>)}</div></div>
      <div style={{ marginBottom: 20, padding: "12px 14px", background: "#14141F", borderRadius: 10, border: `1px solid ${S.border}` }}><div style={{ fontSize: 11, color: "#888899", fontWeight: 600, marginBottom: 8 }}>◷ 投稿スケジュール（承認後に有効）</div><div style={{ display: "flex", gap: 8 }}><input type="date" value={d.scheduleDate} onChange={e => d.setScheduleDate(e.target.value)} style={{ flex: 1, background: "#0F0F1A", border: `1px solid ${S.border}`, borderRadius: 8, padding: "8px 10px", color: "#E8E8F0", fontSize: 12, outline: "none", minWidth: 0 }} /><input type="time" value={d.scheduleTime} onChange={e => d.setScheduleTime(e.target.value)} style={{ width: 90, background: "#0F0F1A", border: `1px solid ${S.border}`, borderRadius: 8, padding: "8px 10px", color: "#E8E8F0", fontSize: 12, outline: "none" }} /></div><div style={{ fontSize: 11, color: "#555570", marginTop: 6 }}>※ 承認した後にのみ、この日時に投稿されます</div></div>
      <button onClick={d.generateArticle} disabled={d.generating || !d.keyword.trim()} style={{ width: "100%", background: d.generating || !d.keyword.trim() ? "#1A1A28" : `linear-gradient(135deg,${d.selectedSite.color},${d.selectedSite.color}BB)`, border: "none", borderRadius: 10, padding: "14px", color: d.generating || !d.keyword.trim() ? "#444455" : "#000", fontWeight: 800, fontSize: 14, cursor: d.generating || !d.keyword.trim() ? "not-allowed" : "pointer" }}>{d.generating ? "✦ 生成中..." : "✦ 記事を生成する"}</button>
    </div>
  );
}

function DesktopLayout({ d }: { d: ReturnType<typeof useDashboard> }) {
  const totalRevenue = SITES.reduce((s, x) => s + x.revenue, 0);
  const badgeCount = d.pendingCount + d.revisionCount;
  return (
    <div style={{ fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif", background: S.bg, minHeight: "100vh", color: "#E8E8F0", display: "flex" }}>
      <aside style={{ width: 220, background: S.card, borderRight: `1px solid ${S.border}`, display: "flex", flexDirection: "column", padding: "24px 0", flexShrink: 0 }}>
        <div style={{ padding: "0 20px 24px", borderBottom: `1px solid ${S.border}` }}><div style={{ fontSize: 18, fontWeight: 800, background: "linear-gradient(135deg,#00D4FF,#00C896)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>● BlogEngine</div><div style={{ fontSize: 11, color: "#555570", marginTop: 2 }}>Affiliate Automation</div></div>
        <nav style={{ padding: "16px 12px", flex: 1 }}>
          {[{ id: "overview", label: "ダッシュボード", icon: "⬡" },{ id: "review", label: "レビュー待ち", icon: "◈", badge: badgeCount },{ id: "generate", label: "記事生成", icon: "✦" },{ id: "articles", label: "記事一覧", icon: "≡" },{ id: "affiliate", label: "アフィリエイト", icon: "◎" }].map(item => (
            <button key={item.id} onClick={() => d.setActiveTab(item.id)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: d.activeTab === item.id ? 700 : 400, background: d.activeTab === item.id ? "rgba(0,212,255,0.08)" : "transparent", color: d.activeTab === item.id ? "#00D4FF" : "#888899" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 16, width: 20, textAlign: "center" as const }}>{item.icon}</span>{item.label}</span>
              {"badge" in item && (item.badge as number) > 0 && <span style={{ background: "#FF6B6B", color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 10, padding: "2px 6px" }}>{item.badge}</span>}
            </button>
          ))}
        </nav>
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${S.border}` }}>{SITES.map(site => (<div key={site.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: site.status === "active" ? site.color : "#333344" }} /><span style={{ fontSize: 12, color: "#666677" }}>{site.name}</span></div>))}</div>
      </aside>
      <main style={{ flex: 1, overflow: "auto" }}>
        <header style={{ padding: "20px 32px", borderBottom: `1px solid ${S.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: S.bg, position: "sticky", top: 0, zIndex: 10 }}>
          <div><h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px" }}>{d.activeTab === "overview" ? "ダッシュボード" : d.activeTab === "review" ? "レビュー待ち" : d.activeTab === "generate" ? "AI記事生成" : d.activeTab === "articles" ? "記事一覧" : "アフィリエイト設定"}</h1><p style={{ margin: "2px 0 0", fontSize: 12, color: "#555570" }}>{new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}</p></div>
          <button onClick={() => d.setActiveTab("generate")} style={{ background: "linear-gradient(135deg,#00D4FF,#00C896)", border: "none", borderRadius: 10, padding: "10px 20px", color: "#000", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>✦ 記事を生成する</button>
        </header>
        <div style={{ padding: "28px 32px" }}>
          {d.activeTab === "overview" && (<div><div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 28 }}>{[{ label: "総収益", value: `¥${totalRevenue.toLocaleString()}`, color: "#00C896" },{ label: "公開記事数", value: SITES.reduce((s, x) => s + x.articles, 0), color: "#00D4FF" },{ label: "レビュー待ち", value: d.pendingCount, color: "#FFB347" },{ label: "差し戻し中", value: d.revisionCount, color: "#FF6B6B" }].map((kpi, i) => (<div key={i} style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 14, padding: "20px 22px", position: "relative", overflow: "hidden" }}><div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: kpi.color }} /><div style={{ fontSize: 11, color: "#555570", marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{kpi.label}</div><div style={{ fontSize: 28, fontWeight: 800, color: kpi.color }}>{kpi.value}</div></div>))}</div><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>{SITES.map(site => (<div key={site.id} style={{ background: S.card, border: `1px solid ${site.color}33`, borderRadius: 14, padding: 20 }}><div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{site.name}</div><div style={{ fontSize: 11, color: "#555570", marginBottom: 14 }}>{site.domain}</div><div style={{ display: "flex", gap: 20 }}><div><div style={{ fontSize: 20, fontWeight: 800, color: site.color }}>{site.articles}</div><div style={{ fontSize: 10, color: "#555570" }}>記事</div></div><div><div style={{ fontSize: 20, fontWeight: 800, color: site.color }}>¥{site.revenue.toLocaleString()}</div><div style={{ fontSize: 10, color: "#555570" }}>収益</div></div></div></div>))}</div></div>)}
          {d.activeTab === "review" && (<div><div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 12, padding: "14px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#666677" }}><span style={{ color: "#00D4FF" }}>✦ AI生成</span><span>→</span><span style={{ color: "#FFB347", fontWeight: 700 }}>◈ あなたがレビュー</span><span>→</span><span style={{ color: "#00C896" }}>✓ 承認で自動投稿</span><span style={{ marginLeft: "auto", color: "#555570" }}>承認するまで投稿されません</span></div><div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{d.queue.map(item => <QueueItem key={item.id} item={item} onReview={d.openReview} />)}</div></div>)}
          {d.activeTab === "generate" && (<div style={{ maxWidth: 720 }}><GenerateForm d={d} /><div style={{ padding: "14px 18px", background: "#0F1A14", border: "1px solid #00C89633", borderRadius: 12, fontSize: 12, color: "#00C896", lineHeight: 1.9 }}>✓ 生成後はレビューキューに追加されます<br />✓ 承認するまで投稿されません（期限なし）<br />✓ kopperian432432@gmail.com にメール通知</div></div>)}
          {d.activeTab === "articles" && (<div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 14, overflow: "hidden" }}>{PUBLISHED_ARTICLES.map((a, i) => (<div key={a.id} style={{ display: "flex", alignItems: "center", padding: "14px 20px", borderBottom: i < PUBLISHED_ARTICLES.length - 1 ? "1px solid #1A1A28" : "none", gap: 14 }}><span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, fontWeight: 700, background: "#00C89622", color: "#00C896", flexShrink: 0 }}>公開中</span><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{a.title}</div><div style={{ fontSize: 11, color: "#555570", marginTop: 2 }}>{a.site} · {a.date}</div></div><div style={{ display: "flex", gap: 20 }}><div style={{ textAlign: "right" as const }}><div style={{ fontSize: 13, fontWeight: 700 }}>{a.views.toLocaleString()}</div><div style={{ fontSize: 10, color: "#555570" }}>PV</div></div><div style={{ textAlign: "right" as const }}><div style={{ fontSize: 13, fontWeight: 700 }}>{a.clicks}</div><div style={{ fontSize: 10, color: "#555570" }}>クリック</div></div></div></div>))}</div>)}
          {d.activeTab === "affiliate" && (<div style={{ maxWidth: 640 }}>{[{ id: "amazon", name: "Amazon アソシエイト", color: "#FF9900" },{ id: "rakuten", name: "楽天アフィリエイト", color: "#BF0000" },{ id: "moshimo", name: "もしもアフィリエイト", color: "#4CAF50" }].map(af => (<div key={af.id} style={{ background: S.card, border: `1px solid ${af.color}33`, borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}><div style={{ display: "flex", alignItems: "center", gap: 14 }}><div style={{ width: 10, height: 10, borderRadius: "50%", background: af.color }} /><div><div style={{ fontWeight: 700, fontSize: 15 }}>{af.name}</div><div style={{ fontSize: 11, color: "#555570", marginTop: 2 }}>自動挿入ON</div></div></div><span style={{ padding: "7px 14px", borderRadius: 8, background: af.color + "22", color: af.color, fontSize: 12, fontWeight: 700 }}>有効</span></div>))}</div>)}
        </div>
      </main>
      <GenModal d={d} />
      <ReviewModal d={d} />
    </div>
  );
}

function MobileLayout({ d }: { d: ReturnType<typeof useDashboard> }) {
  const totalRevenue = SITES.reduce((s, x) => s + x.revenue, 0);
  const badgeCount = d.pendingCount + d.revisionCount;
  const NAV = [{ id: "overview", label: "ホーム", icon: "⬡" },{ id: "review", label: "レビュー", icon: "◈" },{ id: "generate", label: "生成", icon: "✦" },{ id: "articles", label: "記事", icon: "≡" },{ id: "affiliate", label: "AF", icon: "◎" }];
  return (
    <div style={{ fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif", background: S.bg, minHeight: "100vh", color: "#E8E8F0", paddingBottom: 72 }}>
      <header style={{ padding: "14px 16px", borderBottom: `1px solid ${S.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: S.bg, position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 800, background: "linear-gradient(135deg,#00D4FF,#00C896)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>● BlogEngine</div>
        <button onClick={() => d.setActiveTab("generate")} style={{ background: "linear-gradient(135deg,#00D4FF,#00C896)", border: "none", borderRadius: 20, padding: "8px 16px", color: "#000", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>✦ 記事生成</button>
      </header>
      <div style={{ padding: "16px" }}>
        {d.activeTab === "overview" && (<div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>{[{ label: "総収益", value: `¥${totalRevenue.toLocaleString()}`, color: "#00C896" },{ label: "公開記事", value: SITES.reduce((s, x) => s + x.articles, 0), color: "#00D4FF" },{ label: "レビュー待ち", value: d.pendingCount, color: "#FFB347" },{ label: "差し戻し中", value: d.revisionCount, color: "#FF6B6B" }].map((kpi, i) => (<div key={i} style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 12, padding: "14px 16px", position: "relative", overflow: "hidden" }}><div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: kpi.color }} /><div style={{ fontSize: 10, color: "#555570", marginBottom: 6, textTransform: "uppercase" as const }}>{kpi.label}</div><div style={{ fontSize: 24, fontWeight: 800, color: kpi.color }}>{kpi.value}</div></div>))}</div><div style={{ fontSize: 12, color: "#666677", fontWeight: 600, marginBottom: 10 }}>稼働サイト</div>{SITES.map(site => (<div key={site.id} style={{ background: S.card, border: `1px solid ${site.color}33`, borderRadius: 12, padding: "14px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontWeight: 700, fontSize: 14 }}>{site.name}</div><div style={{ fontSize: 11, color: "#555570" }}>{site.domain}</div></div><div style={{ display: "flex", gap: 16, textAlign: "right" as const }}><div><div style={{ fontSize: 18, fontWeight: 800, color: site.color }}>{site.articles}</div><div style={{ fontSize: 10, color: "#555570" }}>記事</div></div><div><div style={{ fontSize: 18, fontWeight: 800, color: site.color }}>¥{site.revenue.toLocaleString()}</div><div style={{ fontSize: 10, color: "#555570" }}>収益</div></div></div></div>))}</div>)}
        {d.activeTab === "review" && (<div><div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 11, color: "#666677", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" as const }}><span style={{ color: "#00D4FF" }}>✦ AI生成</span><span>→</span><span style={{ color: "#FFB347", fontWeight: 700 }}>◈ レビュー</span><span>→</span><span style={{ color: "#00C896" }}>✓ 承認で投稿</span><span style={{ marginLeft: "auto", color: "#00C89688", fontSize: 10 }}>期限なし</span></div><div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{d.queue.map(item => <QueueItem key={item.id} item={item} onReview={d.openReview} mobile />)}</div></div>)}
        {d.activeTab === "generate" && (<div><GenerateForm d={d} mobile /><div style={{ padding: "12px 14px", background: "#0F1A14", border: "1px solid #00C89633", borderRadius: 12, fontSize: 11, color: "#00C896", lineHeight: 1.9 }}>✓ 生成後はレビューキューに追加されます<br />✓ 承認するまで投稿されません（期限なし）<br />✓ kopperian432432@gmail.com にメール通知</div></div>)}
        {d.activeTab === "articles" && (<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{PUBLISHED_ARTICLES.map(a => (<div key={a.id} style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 12, padding: "14px 16px" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 700, background: "#00C89622", color: "#00C896" }}>公開中</span><span style={{ fontSize: 11, color: "#555570" }}>{a.date}</span></div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{a.title}</div><div style={{ fontSize: 11, color: "#555570", marginBottom: 10 }}>{a.site}</div><div style={{ display: "flex", gap: 16 }}><div><span style={{ fontSize: 16, fontWeight: 800, color: "#00D4FF" }}>{a.views.toLocaleString()}</span><span style={{ fontSize: 10, color: "#555570", marginLeft: 4 }}>PV</span></div><div><span style={{ fontSize: 16, fontWeight: 800, color: "#00C896" }}>{a.clicks}</span><span style={{ fontSize: 10, color: "#555570", marginLeft: 4 }}>クリック</span></div></div></div>))}</div>)}
        {d.activeTab === "affiliate" && (<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[{ id: "amazon", name: "Amazon アソシエイト", color: "#FF9900" },{ id: "rakuten", name: "楽天アフィリエイト", color: "#BF0000" },{ id: "moshimo", name: "もしもアフィリエイト", color: "#4CAF50" }].map(af => (<div key={af.id} style={{ background: S.card, border: `1px solid ${af.color}33`, borderRadius: 12, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: af.color }} /><div><div style={{ fontWeight: 700, fontSize: 13 }}>{af.name}</div><div style={{ fontSize: 11, color: "#555570" }}>自動挿入ON</div></div></div><span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, background: af.color + "22", color: af.color, fontWeight: 700 }}>有効</span></div>))}</div>)}
      </div>
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: S.card, borderTop: `1px solid ${S.border}`, display: "flex", zIndex: 20 }}>
        {NAV.map(item => (<button key={item.id} onClick={() => d.setActiveTab(item.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 4px", border: "none", background: "transparent", cursor: "pointer", position: "relative" }}>{item.id === "review" && badgeCount > 0 && <span style={{ position: "absolute", top: 6, right: "50%", transform: "translateX(10px)", background: "#FF6B6B", color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: 8, padding: "1px 5px" }}>{badgeCount}</span>}<span style={{ fontSize: 18, color: d.activeTab === item.id ? "#00D4FF" : "#555570" }}>{item.icon}</span><span style={{ fontSize: 10, color: d.activeTab === item.id ? "#00D4FF" : "#555570", fontWeight: d.activeTab === item.id ? 700 : 400 }}>{item.label}</span></button>))}
      </nav>
      <GenModal d={d} mobile />
      <ReviewModal d={d} mobile />
    </div>
  );
}

export default function Dashboard() {
  const d = useDashboard();
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile ? <MobileLayout d={d} /> : <DesktopLayout d={d} />;
}
