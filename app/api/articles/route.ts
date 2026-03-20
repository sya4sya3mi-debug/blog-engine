import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ articles: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await supabase
    .from("articles")
    .insert([{
      site: body.site,
      site_color: body.siteColor,
      title: body.title,
      keyword: body.keyword,
      generated_at: body.generatedAt,
      scheduled_for: body.scheduledFor,
      status: body.status ?? "pending",
      content: body.content ?? "",
      comment: body.comment ?? "",
    }])
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ article: data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;
  const dbUpdates: Record<string, string> = {};
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.content !== undefined) dbUpdates.content = updates.content;
  if (updates.comment !== undefined) dbUpdates.comment = updates.comment;
  const { data, error } = await supabase
    .from("articles")
    .update(dbUpdates)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ article: data });
}
