# Finara Frontend — UI Reference

> Generated: May 3, 2026  
> Source: `frontend/src/`

---

## Design System

### Color Tokens (`globals.css`)

| Token | Hex | Role |
|-------|-----|------|
| `--brand` | `#4d8eff` | Primary action, active states, links |
| `--brand-dark` | `#3b7af0` | Button hover |
| `--brand-light` | `rgba(77,142,255,0.12)` | Tinted backgrounds, AI badges |
| `--bg` | `#10131a` | Deepest background (page body) |
| `--surface` | `#1d2027` | Card / panel |
| `--surface-2` | `#272a31` | Elevated card, hover state |
| `--surface-3` | `#32353c` | Highest elevation |
| `--border` | `rgba(255,255,255,0.08)` | Default border |
| `--border-2` | `rgba(255,255,255,0.14)` | Stronger border |
| `--text` | `#e1e2ec` | Primary text |
| `--text-2` | `#c2c6d6` | Secondary text |
| `--text-3` | `#8c909f` | Muted / labels |

Sidebar background is hardcoded to `#0b0e15` — slightly darker than `--bg`.

### Typography

| Context | Font stack |
|---------|-----------|
| Body | `'DM Sans', 'Manrope', sans-serif` |
| Headings (`h1`–`h4`) | `'Manrope', 'DM Sans', sans-serif` |
| Narrative / AI text | `'Plus Jakarta Sans', 'DM Sans', sans-serif` |
| Monospace amounts | `ui-monospace, monospace` |

### Category Colour Map

Used consistently in charts, badges, and transaction rows across all pages.

| Category | Colour |
|----------|--------|
| Food & Drink | `#6366F1` (indigo) |
| Groceries | `#8B5CF6` (violet) |
| Transport | `#0EA5E9` (sky) |
| Shopping | `#F59E0B` (amber) |
| Entertainment | `#10B981` (emerald) |
| Healthcare | `#EF4444` (red) |
| Utilities | `#6366F1` |
| Rent & Housing | `#84CC16` (lime) |
| Travel | `#F97316` (orange) |
| Financial | `#64748B` (slate) |
| Subscriptions | `#A78BFA` (purple) |
| Personal Care | `#EC4899` (pink) |
| Other / fallback | `#94A3B8` |

### Global CSS Classes

| Class | Description |
|-------|-------------|
| `.card` | `var(--surface)` background, `var(--border)` 1px border, 16px border-radius, 20px padding, shadow |
| `.btn-primary` | Brand-blue filled button, glow on hover |
| `.btn-ghost` | Transparent button with border, subtle hover |
| `.narrative-text` | Larger line-height prose text for AI outputs |
| `.tr-hover` | Table row hover: `var(--surface-2)` |
| `.glow-brand` | `box-shadow: 0 0 24px rgba(77,142,255,0.2)` |
| `.ai-pulse-icon` | CSS keyframe pulse/rotate animation (2.6s) |
| `.ai-orbit-ring` | Rotating ring animation (4s linear) |
| `.ai-bar` | Progress bar fill animation (8s, for compact loaders) |
| `.ai-bar-slow` | Progress bar fill animation (45s, for full loaders) |
| `.ai-msg-in` | Fade-in + translateY for cycling messages |
| `.chat-message` | `fadeInUp` animation for new chat bubbles |
| `.thinking-dot` | Pulsing dot for AI thinking indicator |

---

## Application Shell

### Routing (`App.jsx`)

```
/login          → LoginPage          (public)
/register       → RegisterPage       (public)
/               → Layout (private, wrapped in TimeFilterProvider)
  index         → DashboardPage
  /upload       → UploadPage
  /story        → StoryPage
  /transactions → TransactionsPage
  /anomalies    → AnomaliesPage
  /forecast     → ForecastPage
  /budget       → BudgetPage
  /compare      → ComparePage
  /savings      → SavingsPage
  /chat         → ChatPage
  /coach        → CoachPage
```

Unauthenticated users are redirected to `/login` via a `PrivateRoute` wrapper that reads from `AuthContext`.

### Layout (`components/Layout.jsx`)

The authenticated shell is a full-height flex row:

```
┌──────────────────────────────────────────────────┐
│  Sidebar (w-56, fixed)   │  Main area (flex-1)   │
│  ┌────────────────────┐  │  ┌──────────────────┐ │
│  │  Logo + "Fiana"    │  │  │  TopBar (h-54px) │ │
│  │  "AI Finance"      │  │  └──────────────────┘ │
│  ├────────────────────┤  │  ┌──────────────────┐ │
│  │  Nav section       │  │  │                  │ │
│  │  (unlabelled)      │  │  │  <Outlet />      │ │
│  │  · Dashboard       │  │  │  max-w-5xl       │ │
│  │  · Upload Data     │  │  │  px-7 py-6       │ │
│  ├────────────────────┤  │  │                  │ │
│  │  AI Features       │  │  │                  │ │
│  │  · My Story        │  │  │                  │ │
│  │  · Ask Fiana       │  │  │                  │ │
│  │  · Weekly Coach    │  │  │                  │ │
│  │  · Savings Plan    │  │  └──────────────────┘ │
│  ├────────────────────┤  │                        │
│  │  Analytics         │  │                        │
│  │  · Transactions    │  │                        │
│  │  · Anomalies       │  │                        │
│  │  · Forecast        │  │                        │
│  │  · Budget          │  │                        │
│  │  · Compare         │  │                        │
│  ├────────────────────┤  │                        │
│  │  HealthIndicator   │  │                        │
│  └────────────────────┘  │                        │
└──────────────────────────────────────────────────┘
```

**Sidebar nav active state:** left border `2.5px solid var(--brand)`, `rgba(77,142,255,0.12)` background, text `#adc6ff`.  
**Sidebar nav inactive:** text `#8c909f`, hover adds `rgba(255,255,255,0.04)` background.

### TopBar (`components/TopBar.jsx`)

Fixed 54px height bar at the top of the main area.

```
┌────────────────────────────────────────────────────┐
│  Page label (w-36)  │  DateRangePicker (centred)  │  Avatar · Name · LogOut │
└────────────────────────────────────────────────────┘
```

- Page label is derived from a `PAGE_LABELS` map keyed on `location.pathname`.
- `DateRangePicker` is only shown on pages in `RANGE_PAGES`: `/`, `/story`, `/transactions`, `/anomalies`, `/chat`, `/savings`, `/budget`.
- The picker is hidden if `minDate` is not yet loaded (no transactions).
- Avatar is first letter of `user.firstName`, blue circle.

---

## Global State

### `AuthContext` (`hooks/useAuth.jsx`)

Provides: `{ user, login, register, logout }`

- `user` is persisted in `localStorage` as `fiana_user` (JSON).
- JWT token stored separately as `fiana_token`.
- Both are cleared on `logout()`.

### `TimeFilterContext` (`hooks/useTimeFilter.jsx`)

Provides: `{ months, startDate, endDate, startMonth, endMonth, minDate, maxDate, setRange }`

- On mount, fetches `GET /api/transactions/months` to get available months (descending).
- Defaults `startDate`/`endDate` to the most recent full month.
- `startMonth` / `endMonth` are derived `YYYY-MM` slices of the dates.
- `setRange({ startDate, endDate })` updates both.
- Consumed by Dashboard, Transactions, Story, Anomalies, Chat, Savings, Budget.

### `useCategories` (`hooks/useCategories.js`)

Provides: `{ categories, getColor, addCategory }`

- Holds the master list of spending categories.
- `getColor(name)` returns the category colour from the colour map.
- `addCategory(name)` appends a custom category to the list.
- Used in TransactionsPage (add/edit modal), BudgetPage (set tab), and for colouring charts everywhere.

---

## Pages

### LoginPage / RegisterPage

Full-screen centred card with no sidebar. No `useTimeFilter` dependency.  
Both use `useAuth().login` / `.register`, redirect to `/` on success.  
RegisterPage includes optional `monthlyIncome` field.

---

### DashboardPage (`/`)

**Purpose:** Overview of spending for the selected date range.

**Data fetched:**
- `txnApi.summary(startMonth, endMonth)` → totals, category breakdown, anomaly count, creditTotal
- `txnApi.list(startDate, endDate)` → recent transactions

**Layout (stacked, `space-y-5`):**

1. **Header** — greeting (time-of-day aware), date, months-of-data count.

2. **6 Stat Cards (grid)** — shown only when months > 0.
   - Money out (red), Money in (green), Net flow (contextual colour), Transactions, Anomalies, Avg/day
   - Each is a `StatCard` component: icon with tinted background, label, bold value, subtitle.
   - Most link to `/transactions` or `/anomalies`.

3. **Bento row (12-col grid):**
   - **Left (7 cols) — Spending Snapshot card:**
     - Auto-generated narrative sentence (no AI, computed from summary data)
     - Anomaly warning banner (if any anomalies exist) with link to `/anomalies`
     - Cash flow mini bar (credits vs debits, green/red proportional fill)
     - "Generate full story →" link to `/story`
   - **Right (5 cols) — Donut chart:**
     - Recharts `PieChart` with `innerRadius=52 outerRadius=78`
     - Top 4 category legend below the chart
     - Total badge in top-right corner

4. **RangeForecastCard** — embedded forecast vs actual chart (amber line + blue bars + confidence band).

5. **Lower bento (12-col grid):**
   - **Left (7 cols) — Recent Transactions** (last 6): description, category pill, date, anomaly flag, amount. Skeleton loaders while loading.
   - **Right (5 cols) — Explore panel**: 6 quick-action links (Story, Anomalies, Forecast, Budget, Savings, Chat).

6. **Spending Breakdown card** — horizontal progress bars for every category, sorted by amount. 2-col grid on md+.

7. **Empty states** — "No transactions for period" or "No data yet — upload first".

---

### UploadPage (`/upload`)

**Purpose:** Upload CSV or PDF bank statements, manage existing batches.

**Layout:**

1. **Header** — title + subtitle.
2. **Dropzone** — `react-dropzone`, dashed border that fills with brand colour on drag-over. Shows filename + size once a file is selected. Accepts `.csv` and `.pdf`.
3. **Upload button** — appears after file is selected (before result).
4. **AiLoader** — full variant shown while processing.
5. **Success card** — green border, `CheckCircle`, counts (total transactions, flagged anomalies). CTAs: "Generate my story" and "View transactions".
6. **Supported formats card** — PDF bank statement description + CSV format code block.
7. **Your uploads section** — list of `BatchCard` components.
8. **Danger zone** — "Delete all data" button with two-step confirm.

**BatchCard:** shows date range, upload time, transaction count, money in/out mini stats. Has inline confirm-to-delete for individual batches.

---

### TransactionsPage (`/transactions`)

**Purpose:** Full transaction table with charts, search, filtering, CRUD.

**Data fetched:** `txnApi.list(startDate, endDate)`

**Layout:**

1. **Header** + "Add Transaction" button (blue, opens `TxnModal`).

2. **Stats + Pie (3-col grid, only when transactions exist):**
   - Left col: "Money out" card + "Money in" card (stacked)
   - Right 2 cols: "Spending by category" — donut chart (140×140) + scrollable category legend

3. **Spending & Income line chart** — adaptive aggregation:
   - ≤1 month: daily
   - ≤3 months: weekly
   - >3 months: monthly
   - Purple = spending, green = income, amber dashed = average reference line

4. **RangeForecastCard** — inline forecast card (compact, 180px height).

5. **Transaction table card:**
   - **Filter row:** All/Debit/Credit toggle, transaction count, search input
   - **Table columns:** Date · Description · Category · Type · Amount · Actions
   - Actions per row (right-aligned):
     - "Why?" button (anomaly explain, only shown if `isAnomaly`)
     - Flag/unflag anomaly icon
     - Edit pencil icon (opens `TxnModal`)
     - Delete trash icon (opens `ConfirmDialog`)
   - Expanded rows (inline below the row):
     - Merchant insight panel (sky blue left border) — toggled via `ℹ` icon on description
     - Anomaly explanation panel (brand blue left border) — `AiText` component

**TxnModal:** Full-screen blur overlay, `max-w-md` card. Fields: description, amount, date, type toggle (Debit/Credit), category dropdown with "Add new category" option. Add/edit modes.

**ConfirmDialog:** Overlay modal for delete confirmations.

---

### AnomaliesPage (`/anomalies`)

**Purpose:** List of ML-flagged unusual transactions with AI explanations.

**Data fetched:** `txnApi.anomalies(startDate, endDate)`

**Layout:**

1. **Header** — "Unusual Purchases", subtitle, "Fiana AI" badge, "Recheck Anomalies" button (spins while loading).
2. **AiLoader** — full variant while loading.
3. **Empty state** — green circle + "No anomalies detected" if list is empty.
4. **Anomaly cards** — one per flagged transaction:
   - Amber left border (3px), amber icon
   - Description + `ℹ` merchant button, amount · date · category, `anomalyReason` text
   - "Ask why?" button → calls `aiApi.explainAnomaly(id)` → renders `AiText` below
   - Delete button (red hover)
   - Merchant insight panel (sky blue) when toggled

---

### StoryPage (`/story`)

**Purpose:** AI-generated monthly narrative via Gemma.

**Data:** Checks `reportApi.get(key)` on load for a cached narrative. Generates on demand via `aiApi.story(startMonth, endMonth)`.

**Layout:**

1. **Header** — title, subtitle, "Fiana AI" badge.
2. **Action card** — single row with Generate/Regenerate button.
3. **AiLoader** — full variant (slow progress bar, 45s) while Gemma runs.
4. **Story card** (after generation):
   - Header: BookOpen icon, period label, "powered by Gemma 3", "saved" or timing badge
   - Horizontal divider
   - `<AiText content={story} narrative />` — full narrative rendering with `Plus Jakarta Sans` font
   - Footer row: "Ask a follow-up" (navigates to ChatPage with story context) + "Regenerate" ghost button
5. **Empty state** — "Your story awaits" placeholder when no story yet.

---

### ChatPage (`/chat`)

**Purpose:** Freeform conversational AI about the user's finances.

**Entry modes:**
- Default: empty chat, global time filter context, STARTERS suggestion chips
- From StoryPage: initial assistant message with story context, `storyFollowups()` suggestion chips

**Layout (full viewport minus TopBar, flex-col):**

1. **Header** — "Ask Fiana", subtitle, "Fiana AI" badge.
2. **Message area (flex-1, scrollable):**
   - Empty state: centred icon, contextual subtitle
   - `UserBubble` — right-aligned, brand blue fill, rounded (6px bottom-right)
   - `AssistantBubble` — left-aligned, `var(--surface)` fill, Sparkles icon, `AiText` + optional `InlineChart`
   - `ThinkingBubble` — cycling phrase + 3 bouncing dots
   - `<div ref={bottomRef} />` — auto-scroll target
3. **Suggestion chips** — horizontally scrollable row (no scrollbar), brand hover state
4. **Input row:**
   - Full-width rounded input (`py-3.5`)
   - Send button (disabled + 45% opacity when empty or loading)
   - Enter key sends message

**InlineChart** — renders inline Recharts charts when the AI response includes structured `chart` data:
- `type: 'pie'` → PieChart with donut
- `type: 'bar'` → horizontal BarChart
- `type: 'line'` → LineChart for monthly trends

---

### ForecastPage (`/forecast`)

**Purpose:** ML-powered spending predictions (future and backtest modes).

**Two view modes (toggle):** Month · Date Range

**Month mode:**
- **Future month** (default — next 3 months offered):
  - Hero card: projected total, trend badge, confidence band, model label
  - Daily forecast chart (ComposedChart: amber line + indigo confidence band)
  - Historical + forecast line chart (history points + amber forecast dot)
  - Category bar chart (forecast vs historical average, dual bars)
  - Category breakdown rows (progress bars, trend badges, model names)
- **Past month / backtest** (last 6 months offered, cyan styling):
  - Backtest hero card: forecast was vs actual spend, error %, within-band indicator
  - Daily forecast vs actual chart
  - Cumulative spend vs forecast trajectory chart
  - Daily spending bar chart (actual bars + forecast dashed line)
  - Category forecast vs actual table (dual progress bars)

**Date Range mode:**
- From/To date inputs
- Debounced (400ms) fetch on date change
- Past ranges: backtest hero + day-by-day chart
- Future ranges: forecast hero + day-by-day chart
- Per-day table shown for ranges ≤14 days

**AiLoader** shown while loading, "Not enough data" empty state if < 2 months.

---

### BudgetPage (`/budget`)

**Purpose:** Set monthly budgets and compare against actuals.

**Two tabs:** Set budget · vs Actual

**Set tab:**
- Month selector dropdown (top right)
- Running total mini-cards: spent this month, total budgeted, monthly income, remaining/over
- Budget entry form (2-col grid): one input per category (with `$` prefix block), shows `spent X` label, red border if over
- "Fill from actuals" quick-fill button
- "Pre-filled from previous month" info banner when auto-copied
- "Add category" inline text input
- "Save budget" full-width primary button

**vs Actual tab:**
- 4 stat cards: total budgeted, total spent, under/over budget, categories over
- AI analysis card (brand-light background, `AiText`)
- Category progress bars sorted: over-budget first, then by % desc. Red gradient fill when over.
- Grouped horizontal bar chart (grey = budget, coloured = actual, red when over)

---

### ComparePage (`/compare`)

**Purpose:** Side-by-side multi-month spending comparison (up to 4 months).

**Layout:**

1. **Header** — title + subtitle.
2. **Month toggle buttons** — pill buttons for all available months, multi-select (max 4). Pre-selects last 3.
3. **AiLoader** while loading.
4. **Charts (2+ months selected):**
   - Daily spending by day-of-month (LineChart, one line per month)
   - Total spending trend — stat cards + LineChart
   - Spending by category — grouped BarChart
   - Biggest category movers — horizontal BarChart (green = decrease, red = increase, `ReferenceLine` at 0)
   - Cumulative spend through the month — LineChart (reveals front-loaded vs spread spending)
5. **Empty state** — "Select at least 2 months" when < 2 selected.

---

### SavingsPage (`/savings`)

**Purpose:** Savings goal feasibility check + AI-generated plan.

**Layout:**

1. **Header** — "Savings Planner", "Fiana AI" badge.
2. **Goal input card:**
   - "I want to save ($)" — number input
   - "In how many months?" — select (1, 2, 3, 6, 12)
   - Two buttons: "Reality check" (primary) + "Build savings plan" (ghost)
3. **Reality check result card:**
   - Green `CheckCircle` or red `XCircle` icon
   - "Goal is achievable!" or "Goal may be difficult to reach"
   - `AiText` analysis
   - If not realistic: suggestion box showing needed monthly cut, realistic target, suggested months, best opportunity category
4. **Savings plan card:**
   - PiggyBank icon, "Your savings plan", "powered by Gemma 3"
   - `AiText` plan narrative
   - "Recommended cuts" list — each cut shows category, tip, `−$X/mo`, current → target amounts
   - Total monthly savings summary row
   - "Apply as budget for [month dropdown] [Save Plan button]" — saves plan cuts as budget via `budgetApi.save`

---

### CoachPage (`/coach`)

**Purpose:** Weekly AI-generated spending tips, cached per ISO week in `localStorage`.

**Cache key:** `coach_YYYY_WNN`

**Layout:**

1. **Header** — "Weekly Coach", "Fiana AI" badge, timing badge, "cached this week" label, Refresh button.
2. **AiLoader** while loading.
3. **Tip cards** — one card per tip:
   - Rotating emoji icon (`💡 🎯 📊 💰 🏦`) with coloured background
   - TIP #N label (coloured, uppercase, tracked)
   - Tip text in `Plus Jakarta Sans`, 0.9rem
4. **Empty state** — "No tips yet — upload transaction data first."

---

## Reusable Components

### `AiLoader` (`components/AiLoader.jsx`)

Two variants controlled by `compact` prop:

**Full variant** (default): Centred card with radial gradient glow, large Sparkles icon with orbit ring, cycling step messages (2.4s interval), slow progress bar (45s), cycling financial tips (6s interval).

**Compact variant**: Smaller card with left-aligned layout, faster progress bar (8s), same cycling messages and tips.

`type` prop selects a message sequence:  
`story | anomaly | savings | reality | forecast | coach | compare | budget | upload | transactions | default`

**`FianaApiLoader`** (named export): Minimal inline loader — small blue bar with Sparkles icon and static text. Used in table loading states.

### `AiText` (`components/AiText.jsx`)

Renders AI Gemma markdown-like text with rich inline formatting. Parses:
- `**bold**` → `<strong>` in `#e1e2ec`
- `$123.45` → green monospace badge
- `42%` → brand-colour bold
- Known category names → coloured pill badges
- `## Heading` → section header with brand left-bar
- `### Subheading` → smaller heading
- `- ` / `* ` bullet lists → blue dot bullets
- `1. ` numbered lists → circular brand number badges
- Markdown tables → styled `<table>` with alternating row colours
- "Let's recap:" / "Here's a summary:" → horizontal divider with "RECAP" label

Props:
- `compact` — smaller font (0.875rem vs 0.9375rem), tighter spacing
- `narrative` — `Plus Jakarta Sans` font, larger line-height (1.9)

### `RangeForecastCard` (`components/RangeForecastCard.jsx`)

Drop-in ComposedChart card showing per-day forecast with confidence band.

Props: `startDate`, `endDate`, `actualByDay` (optional), `title`, `compact`, `bare`

Chart elements:
- Amber line — forecast
- Indigo shaded area — confidence band (dashed borders)
- Blue bars — actual spend (only if `actualByDay` is provided)

`bare` mode renders chart content without the `.card` wrapper (for embedding inside existing cards).

Used in: DashboardPage, TransactionsPage, ForecastPage.

### `HealthIndicator` (`components/HealthIndicator.jsx`)

Shown at the bottom of the sidebar. Polls `GET /api/health` every 30 seconds.

- Collapsed: Activity icon, "All systems up / Checking… / Services down" label, status dot
- Expanded (popover, above): service-by-service status rows (name, detail, status badge), refresh button, "Checked Xs ago"

Dot colours: green (up), amber (checking), red (down).

### `FinaraLogo` (`components/FinaraLogo.jsx`)

SVG logo component. Accepts `size` prop (default 28).

### `ConfirmDialog` (`components/ConfirmDialog.jsx`)

Full-screen blur overlay modal. Props: `title`, `message`, `confirmLabel`, `onConfirm`, `onCancel`.

### `DateRangePicker` (`components/DateRangePicker.jsx`)

Global date range filter shown in the TopBar. Accepts `startDate`, `endDate`, `minDate`, `maxDate`, `onChange`.

### `MonthRangePicker` (`components/MonthRangePicker.jsx`)

Month-level variant of the range picker (used in some analytics pages).

---

## API Integration (`utils/api.js`)

Axios client with base URL `/api` and `Authorization: Bearer <token>` header injected from `localStorage`.

Key API groups:
- `authApi` — login, register
- `txnApi` — list, summary, anomalies, months, upload, uploadPdf, batches, deleteBatch, deleteAll, create, update, delete, toggleAnomaly, recheckAnomalies
- `aiApi` — story, explainAnomaly, explainMerchant, chat, realityCheck, savingsPlan, coach
- `reportApi` — get, list, forecast, forecastDaily, forecastRange
- `budgetApi` — get, save
- `healthApi` — check

---

## Interaction Patterns

### Hover states
Most buttons use `onMouseEnter`/`onMouseLeave` inline handlers (not Tailwind hover) to avoid class conflicts with dynamic inline styles.

### Loading states
- Long AI calls: `AiLoader` full variant (centred card with animated icon)
- Short data fetches: `FianaApiLoader` inline bar or skeleton shimmer divs
- Buttons: disabled + opacity reduced, spinner icon replaces label

### Empty states
Every page has at least one empty state:
- No data at all → "No data yet — upload first"
- No data for selected period → "No transactions for [range] — try different dates"
- No results for filter/search → inline table message

### Toast notifications
`react-hot-toast` is used throughout for success/error feedback. Consistent voice:
- Success: "Transaction updated", "Budget saved!"
- Error: "Fiana went quiet — is the AI service up?", "Fiana couldn't place that merchant — try again"

### Page width
All page content is constrained to `max-w-5xl mx-auto`. Some AI-output pages (Story, Anomalies, Savings, Coach) use a narrower `max-w-2xl` or `max-w-3xl` for readability.

---

## Animation Summary

| Animation | Applied to | Duration |
|-----------|-----------|----------|
| `aiPulseIcon` | Sparkles icon in loaders/chat | 2.6s infinite |
| `aiOrbit` | Ring around icon in full loader | 4s infinite |
| `aiBar` | Progress bar in compact loader | 8s forwards |
| `aiBar-slow` | Progress bar in full loader | 45s forwards |
| `aiMsgIn` | Cycling message text | 0.35s per cycle |
| `fadeInUp` | New chat messages | 0.2s |
| `pulse` | Thinking dots in chat | 1.2s infinite |
| CSS `animate-spin` | Refresh/loading icons | Tailwind |
| CSS `animate-pulse` | Skeleton shimmer blocks | Tailwind |
| `duration-700` | Category spend bars fill | Tailwind transition |
| `duration-500` | Budget progress bars fill | Tailwind transition |
