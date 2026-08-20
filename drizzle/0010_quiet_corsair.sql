-- Backfill default categories for existing organizations
-- id, name, slug, sort_order
INSERT INTO categories (organization_id, name, slug, sort_order, is_active)
SELECT o.id, v.name, v.slug, v.sort_order, true
FROM organizations o
CROSS JOIN (VALUES
  ('Makanan', 'makanan', 1),
  ('Minuman', 'minuman', 2),
  ('Snack', 'snack', 3),
  ('Dessert', 'dessert', 4),
  ('Add-on', 'add-on', 5)
) AS v(name, slug, sort_order)
ON CONFLICT (organization_id, slug) DO NOTHING;
