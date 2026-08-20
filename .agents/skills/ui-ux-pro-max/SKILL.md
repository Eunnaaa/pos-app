---
name: ui-ux-pro-max
description: Complete UI/UX design intelligence skill for building professional, modern, accessible interfaces. Includes design system generation, color palettes, typography, layout rules, component styling, animations, and accessibility checklists across web and mobile platforms.
---

# UI/UX Pro Max Skill

An AI skill that provides design intelligence for building professional UI/UX across multiple platforms.

## Core Capabilities

1. **Design Systems & Aesthetics**: Generate cohesive visual design systems, color tokens, font pairings, and layout structures for SaaS, E-Commerce, POS, F&B, Mobile, and Web applications.
2. **Component Libraries**: Leverage Tailwind CSS v4, shadcn/ui (Radix UI), Lucide / Phosphor icons, and design tokens for clean, responsive, dark-mode ready interfaces.
3. **Accessibility & Usability (WCAG 2.1)**: Ensure minimum touch targets (44px/48px), contrast ratios (>=4.5:1 text, >=3:1 non-text), keyboard focus indicators, and screen reader labels (`aria-*`).
4. **UX Patterns & Motion**: Implement intuitive form validations, empty/loading/error states, responsive grids, safe-area insets, and smooth CSS transitions.

## Bundled Skills & Modules

The following specialized sub-skills are installed and available in `.agents/skills/`:

- **ui-styling**: Component patterns with shadcn/ui, Tailwind CSS utilities, responsive design, and CSS variable theming.
- **design**: Overall design intelligence, typography pairings, color palette management, and visual identity.
- **design-system**: Component tokens, spacing scales (4/8px rhythm), and design token governance.
- **brand**: Logo usage rules, messaging framework, typography specs, and consistency checklists.
- **banner-design**: Banner compositions, marketing graphics, and responsive image assets.
- **slides**: Visual presentations, pitch deck layouts, and slide design systems.

## Quick Reference Rules for POS & Web Applications

### 1. Color & Contrast
- Maintain `>= 4.5:1` contrast for body text in both light and dark mode.
- Use semantic color tokens (`bg-background`, `text-foreground`, `bg-card`, `border-border`).
- Avoid hardcoded HEX values across individual components; use Tailwind theme variables.

### 2. Spacing & Rhythm
- Follow 4px / 8px spatial rhythm (`gap-2`, `gap-4`, `p-4`, `p-6`).
- Provide horizontal gutters for mobile/tablet (`px-4 md:px-6 lg:px-8`).

### 3. Touch Targets & Interaction
- Interactive controls must be at least `44x44px` on mobile/touch interfaces.
- Provide visual active/hover states within `100ms`.
- Interactive icon buttons require explicit `aria-label`.
