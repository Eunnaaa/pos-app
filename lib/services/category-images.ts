export const CATEGORY_EMOJIS: Record<string, string> = {
  makanan: "🍛",
  minuman: "🥤",
  snack: "🍿",
  dessert: "🍰",
  "add-on": "🧂",
  default: "📦",
};

export const CATEGORY_COLORS: Record<string, string> = {
  makanan: "bg-amber-100 dark:bg-amber-950",
  minuman: "bg-blue-100 dark:bg-blue-950",
  snack: "bg-orange-100 dark:bg-orange-950",
  dessert: "bg-pink-100 dark:bg-pink-950",
  "add-on": "bg-gray-100 dark:bg-gray-950",
  default: "bg-violet-100 dark:bg-violet-950",
};

export function getCategorySlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

export function getCategoryEmoji(categoryName: string): string {
  const slug = getCategorySlug(categoryName);
  return CATEGORY_EMOJIS[slug] ?? CATEGORY_EMOJIS.default;
}

export function getCategoryColor(categoryName: string): string {
  const slug = getCategorySlug(categoryName);
  return CATEGORY_COLORS[slug] ?? CATEGORY_COLORS.default;
}