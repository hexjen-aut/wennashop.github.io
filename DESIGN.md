# Design System Document: The Afro-Mediterranean Editorial

## 1. Overview & Creative North Star
**Creative North Star: "The Cultural Curator"**
This design system rejects the "cookie-cutter" e-commerce grid in favor of a high-end editorial experience. It serves as a bridge between the lush, organic landscapes of Gabon and the intricate, royal heritage of Morocco. 

To break the "template" look, we employ **Intentional Asymmetry**. Images are rarely perfectly centered; they overlap container boundaries to create a sense of movement. We use a **High-Contrast Typographic Scale**, where massive display serifs sit alongside tiny, precision-engineered labels, creating an authoritative, boutique feel that feels more like a luxury magazine than a standard shop.

---

## 2. Colors & Surface Architecture

### The Palette
- **Primary (`#006b2a`):** A deep forest green representing Gabonese vitality. Use for primary actions and brand moments.
- **Secondary (`#1a5fa8`):** A royal Moroccan blue. Use for navigational elements and depth.
- **Tertiary (`#745b00`):** A golden yellow accent. Use sparingly for highlights, ratings, and "New In" badges.

### The "No-Line" Rule
**Explicit Instruction:** 1px solid borders are strictly prohibited for sectioning. We define boundaries through **Tonal Transitions**. A section shift is signaled by moving from `surface` to `surface-container-low`. This creates a seamless, infinite feel that doesn't "trap" the user’s eye in boxes.

### Surface Hierarchy & Glassmorphism
Treat the UI as physical layers of fine paper and frosted glass.
- **Base Layer:** `surface` (#f5fbf1).
- **Nested Content:** Use `surface-container-low` for large content blocks.
- **Elevated Cards:** Use `surface-container-lowest` (pure white) to make products "pop" against the off-white base.
- **The Glass Rule:** For mobile navigation bars or floating headers, use `surface` at 80% opacity with a `24px` backdrop-blur. This allows product imagery to bleed through subtly, maintaining a high-end, integrated feel.

### Signature Textures
Avoid flat blocks of color. For Hero backgrounds or large CTAs, apply a subtle linear gradient: 
*From `primary` (#006b2a) to `primary_container` (#0f8739) at a 135-degree angle.*

---

## 3. Typography
The typography strategy relies on the tension between the heritage-rich **Playfair Display** (Noto Serif) and the utilitarian **Inter**.

- **Display & Headlines (Noto Serif):** These are your "Editorial Voices." Use `display-lg` for hero sections and `headline-md` for product categories. The goal is to feel like a title in a fashion journal.
- **Body & Labels (Inter):** These are your "Functional Voices." Use `body-lg` for product descriptions to ensure readability. `label-sm` should be used for metadata (e.g., "Sourced from Libreville") with increased letter-spacing (0.05em) for a premium touch.

---

## 4. Elevation & Depth

### The Layering Principle
Instead of shadows, use **Tonal Stacking**:
1. **Background:** `surface`
2. **Section:** `surface-container-low`
3. **Card/Element:** `surface-container-lowest`

### Ambient Shadows
When an element must float (e.g., a "Buy Now" bottom sheet), use an **Ambient Glow**:
- **Color:** `on-surface` at 6% opacity.
- **Blur:** 40px.
- **Spread:** 0px.
- **Offset:** Y: 8px.
This creates a soft lift that mimics natural gallery lighting.

### The "Ghost Border" Fallback
If a divider is essential for accessibility, use the `outline_variant` token at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### Buttons
- **Primary:** Gradient from `primary` to `primary_container`. `xl` (3rem) roundedness. No border. Text in `on_primary`.
- **Secondary:** Surface-tinted. No fill, but a `Ghost Border` (15% opacity `outline`). 
- **Interaction:** On press, the button should scale down to 97% to provide tactile feedback.

### Product Cards
- **Structure:** Forbid divider lines. Use `1.5rem` (md) vertical padding between the image and the product title.
- **Style:** Use `surface-container-lowest` as the card background against a `surface` page.
- **Image:** Apply `1rem` (default) rounded corners to the image itself, nested inside the card.

### Input Fields
- **Style:** Never use a 4-sided box. Use a subtle background fill of `surface-container-high` with a bottom-only `Ghost Border`.
- **Corners:** Maintain the `1rem` scale on the top corners for a "soft-top" feel.

### Chips (Filters)
- **Unselected:** `surface-container-highest` with `on_surface_variant` text.
- **Selected:** `secondary` background with `on_secondary` text. `full` (9999px) roundedness.

---

## 6. Do's and Don'ts

### Do:
- **Focus on Imagery:** Let high-quality photography do the heavy lifting. Use `surface-dim` as a placeholder color for loading states.
- **Embrace White Space:** If you think a section needs more breathing room, double the spacing. 
- **Mobile-First Gestures:** Ensure all "Sheet" components (filters, carts) use a `2rem` (lg) corner radius on the top edges.

### Don't:
- **Don't use 100% Black:** Always use `on_surface` (#171d17) for text to maintain a soft, premium look.
- **Don't use standard Icons:** Avoid "chunky" or filled icons. Use light-stroke (1.5px or 1px) linear icons to match the Inter typeface.
- **Don't use Dividers:** If you feel the need to separate two items, use a `24px` or `32px` vertical gap instead of a line.