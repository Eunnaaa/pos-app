export const CATEGORY_EMOJIS: Record<string, string> = {
  makanan: "🍛",
  food: "🍛",
  "main-course": "🍛",
  minuman: "🥤",
  beverage: "🥤",
  drink: "🥤",
  drinks: "🥤",
  snack: "🍿",
  cemilan: "🍿",
  appetizer: "🍿",
  bakery: "🥐",
  roti: "🥐",
  pastry: "🥐",
  dessert: "🍰",
  penutup: "🍰",
  bundling: "🍱",
  paket: "🍱",
  combo: "🍱",
  bundle: "🍱",
  "add-on": "🧂",
  addon: "🧂",
  topping: "🧂",
  default: "📦",
};

export const CATEGORY_COLORS: Record<string, string> = {
  makanan: "bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200",
  food: "bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200",
  "main-course": "bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200",
  minuman: "bg-sky-100 text-sky-900 dark:bg-sky-950/70 dark:text-sky-200",
  beverage: "bg-sky-100 text-sky-900 dark:bg-sky-950/70 dark:text-sky-200",
  drink: "bg-sky-100 text-sky-900 dark:bg-sky-950/70 dark:text-sky-200",
  drinks: "bg-sky-100 text-sky-900 dark:bg-sky-950/70 dark:text-sky-200",
  snack: "bg-orange-100 text-orange-900 dark:bg-orange-950/70 dark:text-orange-200",
  cemilan: "bg-orange-100 text-orange-900 dark:bg-orange-950/70 dark:text-orange-200",
  appetizer: "bg-orange-100 text-orange-900 dark:bg-orange-950/70 dark:text-orange-200",
  bakery: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950/70 dark:text-yellow-200",
  roti: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950/70 dark:text-yellow-200",
  pastry: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950/70 dark:text-yellow-200",
  dessert: "bg-pink-100 text-pink-900 dark:bg-pink-950/70 dark:text-pink-200",
  penutup: "bg-pink-100 text-pink-900 dark:bg-pink-950/70 dark:text-pink-200",
  bundling: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200",
  paket: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200",
  combo: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200",
  bundle: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200",
  "add-on": "bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-200",
  addon: "bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-200",
  topping: "bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-200",
  default: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
};

export function getCategorySlug(name: string): string {
  return (name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
}

function matchKeyword(text: string): string | null {
  const t = (text || "").toLowerCase();
  if (
    t.includes("kopi") ||
    t.includes("coffee") ||
    t.includes("espresso") ||
    t.includes("latte") ||
    t.includes("cappuccino") ||
    t.includes("americano") ||
    t.includes("teh") ||
    t.includes("tea") ||
    t.includes("matcha") ||
    t.includes("minum") ||
    t.includes("drink") ||
    t.includes("jus") ||
    t.includes("juice") ||
    t.includes("boba") ||
    t.includes("shake") ||
    t.includes("susu") ||
    t.includes("milk") ||
    t.includes("soda") ||
    t.includes("beverage")
  ) {
    return "minuman";
  }
  if (t.includes("roti") || t.includes("bread") || t.includes("croissant") || t.includes("pastry") || t.includes("bakery") || t.includes("toast")) {
    return "bakery";
  }
  if (t.includes("bundling") || t.includes("bundle") || t.includes("paket") || t.includes("combo") || t.includes("set") || t.includes("bento")) {
    return "bundling";
  }
  if (
    t.includes("dessert") ||
    t.includes("cake") ||
    t.includes("kue") ||
    t.includes("donat") ||
    t.includes("waffle") ||
    t.includes("pancake") ||
    t.includes("es krim") ||
    t.includes("ice cream") ||
    t.includes("gelato") ||
    t.includes("pudding")
  ) {
    return "dessert";
  }
  if (
    t.includes("snack") ||
    t.includes("cemilan") ||
    t.includes("kentang") ||
    t.includes("fries") ||
    t.includes("chips") ||
    t.includes("keripik") ||
    t.includes("dimsum") ||
    t.includes("gorengan") ||
    t.includes("nugget")
  ) {
    return "snack";
  }
  if (
    t.includes("makan") ||
    t.includes("food") ||
    t.includes("nasi") ||
    t.includes("mie") ||
    t.includes("ayam") ||
    t.includes("daging") ||
    t.includes("beef") ||
    t.includes("chicken") ||
    t.includes("steak") ||
    t.includes("burger") ||
    t.includes("pizza") ||
    t.includes("pasta") ||
    t.includes("soup") ||
    t.includes("soto") ||
    t.includes("bakso") ||
    t.includes("ikan") ||
    t.includes("seafood")
  ) {
    return "makanan";
  }
  if (t.includes("topping") || t.includes("extra") || t.includes("sambal") || t.includes("saus") || t.includes("sauce") || t.includes("addon") || t.includes("add-on")) {
    return "add-on";
  }
  return null;
}

export function getCategoryEmoji(categoryName?: string, productName?: string): string {
  const catSlug = categoryName ? getCategorySlug(categoryName) : "";
  if (catSlug && CATEGORY_EMOJIS[catSlug]) return CATEGORY_EMOJIS[catSlug];
  const catKey = categoryName ? matchKeyword(categoryName) : null;
  if (catKey && CATEGORY_EMOJIS[catKey]) return CATEGORY_EMOJIS[catKey];
  const prodKey = productName ? matchKeyword(productName) : null;
  if (prodKey && CATEGORY_EMOJIS[prodKey]) return CATEGORY_EMOJIS[prodKey];
  return CATEGORY_EMOJIS.default;
}

export function getCategoryColor(categoryName?: string, productName?: string): string {
  const catSlug = categoryName ? getCategorySlug(categoryName) : "";
  if (catSlug && CATEGORY_COLORS[catSlug]) return CATEGORY_COLORS[catSlug];
  const catKey = categoryName ? matchKeyword(categoryName) : null;
  if (catKey && CATEGORY_COLORS[catKey]) return CATEGORY_COLORS[catKey];
  const prodKey = productName ? matchKeyword(productName) : null;
  if (prodKey && CATEGORY_COLORS[prodKey]) return CATEGORY_COLORS[prodKey];
  return CATEGORY_COLORS.default;
}