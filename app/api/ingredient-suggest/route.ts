export const runtime = "edge";

import { listIngredientCandidates } from "@/lib/ingredient-data";

export async function GET() {
  const data = listIngredientCandidates();
  return Response.json({
    success: true,
    updatedAt: data.updatedAt,
    recommended: data.recommended,
    watchlist: data.watchlist,
    ingredients: data.ingredients,
  });
}

