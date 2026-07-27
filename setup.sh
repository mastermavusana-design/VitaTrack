#!/usr/bin/env bash
# ============================================================
# VitaTrack — Local Development Quick-Start
# Run from inside the vitatrack/ folder:
#   chmod +x setup.sh && ./setup.sh
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
info() { echo -e "${YELLOW}→ $*${NC}"; }
err()  { echo -e "${RED}✗ $*${NC}"; exit 1; }

echo ""
echo "╔══════════════════════════════════════╗"
echo "║    VitaTrack — Local Setup Script    ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Check prerequisites ───────────────────────────────────
info "Checking prerequisites..."

command -v node  >/dev/null 2>&1 || err "Node.js ≥ 20 is required. Install from https://nodejs.org"
NODE_V=$(node -e "process.exit(parseInt(process.version.slice(1)) < 20 ? 1 : 0)" && echo "ok" || echo "old")
[[ "$NODE_V" == "old" ]] && err "Node.js ≥ 20 required (you have $(node -v))"

command -v pnpm >/dev/null 2>&1 || err "pnpm is required: npm install -g pnpm@9"
ok "Node $(node -v) · pnpm $(pnpm -v)"

# ── 2. Install dependencies ──────────────────────────────────
info "Installing dependencies (pnpm install)..."
# Use --frozen-lockfile only if a lockfile already exists (CI); first-run generates it
if [[ -f pnpm-lock.yaml ]]; then
  pnpm install --frozen-lockfile
else
  pnpm install
fi
ok "Dependencies installed"

# ── 3. Create env files if missing ──────────────────────────
if [[ ! -f apps/web/.env.local ]]; then
  info "Creating apps/web/.env.local from example..."
  cp apps/web/.env.example apps/web/.env.local
  echo ""
  echo -e "${YELLOW}  ⚠️  Edit apps/web/.env.local and fill in your Supabase keys before running dev.${NC}"
  echo ""
fi

if [[ ! -f apps/mobile/.env ]]; then
  info "Creating apps/mobile/.env from example..."
  cp .env.example apps/mobile/.env
  echo -e "${YELLOW}  ⚠️  Edit apps/mobile/.env and fill in your Supabase keys before running dev.${NC}"
fi

# ── 4. Type-check ─────────────────────────────────────────────
info "Running type-check (this may take 30–60 seconds)..."
pnpm --filter @vitatrack/shared type-check && ok "shared: OK"
EXPO_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=placeholder \
  pnpm --filter @vitatrack/web type-check && ok "web: OK"

# ── 5. Done ───────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅  Setup complete!                                          ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Next steps:                                                  ║"
echo "║                                                               ║"
echo "║  1. Create a Supabase project at https://app.supabase.com    ║"
echo "║  2. Run migrations in SQL Editor (see Local Setup guide)      ║"
echo "║  3. Fill in apps/web/.env.local with your Supabase keys       ║"
echo "║  4. pnpm --filter @vitatrack/web dev   → http://localhost:3000 ║"
echo "║  5. cd apps/mobile && npx expo start   → scan QR with Expo Go ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
