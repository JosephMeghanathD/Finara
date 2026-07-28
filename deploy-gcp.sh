#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Finara — one-command deploy to GCP.
#
#   ./deploy-gcp.sh                 build + push backend & ml-service, roll out on the VM
#   ./deploy-gcp.sh --backend       only the backend
#   ./deploy-gcp.sh --ml            only the ml-service
#   ./deploy-gcp.sh --frontend      also push to GitHub so Netlify rebuilds the frontend
#   ./deploy-gcp.sh --restart       no build — re-pull :latest on the VM and apply
#                                   (a no-op if the image digest hasn't changed)
#   ./deploy-gcp.sh --logs          tail VM logs and exit
#   ./deploy-gcp.sh --status        show VM container status + health and exit
#   ./deploy-gcp.sh --help
#
# What it does (default run):
#   1. preflight  — docker daemon, gcloud auth/project, VM reachable
#   2. build      — linux/amd64 images via buildx (Apple Silicon safe)
#   3. push       — to Artifact Registry, tagged :latest AND :<git-sha>-<ts>
#   4. sync       — copy docker-compose.vm.yml + the VM-side deploy script up
#   5. deploy     — AR login on the VM, compose pull, compose up -d
#   6. verify     — poll /actuator/health on the VM and through the Netlify proxy
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config (override via env) ────────────────────────────────────────────────
PROJECT_ID="${PROJECT_ID:-finera-503501}"
REGION="${REGION:-us-east1}"
VM_NAME="${VM_NAME:-finara-vm}"
VM_ZONE="${VM_ZONE:-us-east1-b}"
VM_IP="${VM_IP:-34.138.231.191}"
REPO="${REPO:-${REGION}-docker.pkg.dev/${PROJECT_ID}/finara}"
NETLIFY_URL="${NETLIFY_URL:-https://jd-finera.netlify.app}"
GIT_BRANCH="${GIT_BRANCH:-main}"

BACKEND_IMAGE="${REPO}/backend"
ML_IMAGE="${REPO}/ml-service"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ── Flags ────────────────────────────────────────────────────────────────────
DO_BACKEND=true
DO_ML=true
DO_FRONTEND=false
DO_BUILD=true
NO_CACHE=""
MODE="deploy"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend|--backend-only) DO_BACKEND=true;  DO_ML=false ;;
    --ml|--ml-only)           DO_ML=true;       DO_BACKEND=false ;;
    --frontend)               DO_FRONTEND=true ;;
    --frontend-only)          DO_FRONTEND=true; DO_BACKEND=false; DO_ML=false; DO_BUILD=false; MODE="frontend" ;;
    --restart|--restart-only) DO_BUILD=false ;;
    --no-cache)               NO_CACHE="--no-cache" ;;
    --logs)                   MODE="logs" ;;
    --status)                 MODE="status" ;;
    -h|--help)                sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown flag: $1  (try --help)" >&2; exit 2 ;;
  esac
  shift
done

# ── Pretty output ────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; D=$'\033[2m'; N=$'\033[0m'
else B=""; G=""; Y=""; R=""; D=""; N=""; fi
step() { echo; echo "${B}▸ $*${N}"; }
ok()   { echo "${G}✓${N} $*"; }
warn() { echo "${Y}!${N} $*"; }
die()  { echo "${R}✗ $*${N}" >&2; exit 1; }

START_TS=$(date +%s)
elapsed() { local s=$(( $(date +%s) - START_TS )); printf '%dm%02ds' $((s/60)) $((s%60)); }

vm_ssh() {
  gcloud compute ssh "$VM_NAME" --zone "$VM_ZONE" --project "$PROJECT_ID" \
    --quiet --command "$1"
}

# ── Short-circuit modes ──────────────────────────────────────────────────────
if [[ "$MODE" == "logs" ]]; then
  echo "${D}Ctrl-C to stop.${N}"
  vm_ssh 'sudo docker compose -f ~/docker-compose.vm.yml --env-file ~/.env.prod logs -f --tail=100'
  exit 0
fi

if [[ "$MODE" == "status" ]]; then
  vm_ssh 'sudo docker compose -f ~/docker-compose.vm.yml --env-file ~/.env.prod ps'
  echo
  echo "backend health: $(curl -s -m 10 "http://${VM_IP}:8080/actuator/health" || echo unreachable)"
  echo "via Netlify:    $(curl -s -m 20 "${NETLIFY_URL}/api/health" || echo unreachable)"
  exit 0
fi

# ── 1. Preflight ─────────────────────────────────────────────────────────────
step "Preflight"

command -v gcloud >/dev/null || die "gcloud not on PATH"

if $DO_BUILD; then
  command -v docker >/dev/null || die "docker not on PATH"
  docker info >/dev/null 2>&1 || die "Docker daemon isn't running — start Docker Desktop and retry."
  docker buildx inspect >/dev/null 2>&1 || die "docker buildx unavailable"
  ok "docker + buildx ready"
fi

gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | grep -q . \
  || die "no active gcloud account — run:  gcloud auth login"
ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -1)
ok "gcloud account: $ACCOUNT"

CUR_PROJECT=$(gcloud config get-value project 2>/dev/null)
[[ "$CUR_PROJECT" == "$PROJECT_ID" ]] || warn "gcloud project is '$CUR_PROJECT'; this script targets '$PROJECT_ID' explicitly"

VM_STATUS=$(gcloud compute instances describe "$VM_NAME" --zone "$VM_ZONE" --project "$PROJECT_ID" \
  --format='value(status)' 2>/dev/null) || die "VM '$VM_NAME' not found in $VM_ZONE"
if [[ "$VM_STATUS" != "RUNNING" ]]; then
  warn "VM is $VM_STATUS — starting it"
  gcloud compute instances start "$VM_NAME" --zone "$VM_ZONE" --project "$PROJECT_ID" >/dev/null
  sleep 20
fi
ok "VM $VM_NAME is RUNNING ($VM_IP)"

[[ -f docker-compose.vm.yml ]] || die "docker-compose.vm.yml missing"

# Version tag: git sha + timestamp, so every rollout is addressable / rollback-able.
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo nogit)
DIRTY=""
git diff --quiet 2>/dev/null || DIRTY="-dirty"
TAG="${GIT_SHA}${DIRTY}-$(date +%Y%m%d-%H%M%S)"
ok "version tag: $TAG"

# ── 2 + 3. Build & push ──────────────────────────────────────────────────────
build_push() {
  local name="$1" ctx="$2" image="$3"
  step "Building $name (linux/amd64)"
  docker buildx build \
    --platform linux/amd64 \
    $NO_CACHE \
    -t "${image}:latest" \
    -t "${image}:${TAG}" \
    --push \
    "$ctx" || die "$name build/push failed"
  ok "pushed ${image}:{latest,${TAG}}"
}

if $DO_BUILD; then
  step "Authenticating Docker to Artifact Registry"
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet >/dev/null 2>&1 \
    || die "gcloud auth configure-docker failed"
  ok "configured ${REGION}-docker.pkg.dev"

  $DO_ML      && build_push "ml-service" ./ml-service "$ML_IMAGE"
  $DO_BACKEND && build_push "backend"    ./backend    "$BACKEND_IMAGE"
else
  warn "skipping build (--restart) — VM will pull whatever :latest currently is"
fi

# ── 4. Sync compose + VM deploy script ───────────────────────────────────────
step "Syncing deploy files to VM"

VM_DEPLOY=$(mktemp -t finara-vmdeploy)
trap 'rm -f "$VM_DEPLOY"' EXIT
cat > "$VM_DEPLOY" <<'REMOTE'
#!/bin/bash
# Generated by deploy-gcp.sh — pulls prebuilt images from Artifact Registry and restarts.
set -euo pipefail
cd "$HOME"

TOKEN=$(curl -s -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
echo "$TOKEN" | sudo docker login -u oauth2accesstoken --password-stdin https://us-east1-docker.pkg.dev

COMPOSE="sudo docker compose -f docker-compose.vm.yml --env-file .env.prod"

$COMPOSE pull
$COMPOSE up -d --remove-orphans

# Reclaim disk on the 2GB VM — old image layers add up fast.
sudo docker image prune -f >/dev/null 2>&1 || true

echo "----- status -----"
$COMPOSE ps
REMOTE

gcloud compute scp docker-compose.vm.yml "$VM_DEPLOY" \
  "${VM_NAME}:~/" --zone "$VM_ZONE" --project "$PROJECT_ID" --quiet \
  || die "scp to VM failed"
vm_ssh "mv ~/$(basename "$VM_DEPLOY") ~/deploy.sh && chmod +x ~/deploy.sh"
ok "docker-compose.vm.yml + deploy.sh synced"

vm_ssh 'test -f ~/.env.prod' >/dev/null 2>&1 \
  || die ".env.prod missing on the VM — copy it up first:
     gcloud compute scp .env.prod ${VM_NAME}:~/.env.prod --zone ${VM_ZONE}"

# ── 5. Roll out ──────────────────────────────────────────────────────────────
step "Rolling out on $VM_NAME"
vm_ssh 'bash ~/deploy.sh' || die "remote deploy failed — check: ./deploy-gcp.sh --logs"

# ── 6. Verify ────────────────────────────────────────────────────────────────
step "Verifying"

health_ok=false
for i in $(seq 1 30); do
  body=$(curl -s -m 10 "http://${VM_IP}:8080/actuator/health" 2>/dev/null || true)
  if [[ "$body" == *'"status":"UP"'* ]]; then health_ok=true; break; fi
  printf '\r  waiting for backend… %ds' $((i*5)); sleep 5
done
echo
$health_ok || die "backend never reported UP. Logs:  ./deploy-gcp.sh --logs"
ok "backend UP at http://${VM_IP}:8080"

api=$(curl -s -m 25 "${NETLIFY_URL}/api/health" 2>/dev/null || true)
if [[ -n "$api" ]]; then ok "Netlify proxy → backend reachable"
else warn "Netlify proxy check inconclusive (cold start / 26s timeout) — retry in a minute"; fi

# ── Frontend (Netlify auto-deploys from GitHub) ──────────────────────────────
if $DO_FRONTEND; then
  step "Frontend → Netlify"
  if ! git diff --quiet -- frontend || ! git diff --cached --quiet -- frontend; then
    warn "frontend/ has uncommitted changes — commit them first, then rerun with --frontend"
    warn "  git add frontend && git commit -m '…'"
  else
    ahead=$(git rev-list --count "origin/${GIT_BRANCH}..${GIT_BRANCH}" 2>/dev/null || echo 0)
    if [[ "$ahead" -gt 0 ]]; then
      echo "Pushing $ahead commit(s) to origin/${GIT_BRANCH} — Netlify will rebuild."
      git push origin "$GIT_BRANCH" || die "git push failed"
      ok "pushed; watch the build at https://app.netlify.com"
    else
      ok "origin/${GIT_BRANCH} already up to date — nothing to deploy"
    fi
  fi
fi

# ── Done ─────────────────────────────────────────────────────────────────────
step "Done in $(elapsed)"
echo "  version   ${TAG}"
echo "  backend   http://${VM_IP}:8080"
echo "  app       ${NETLIFY_URL}"
echo
echo "${D}  logs:     ./deploy-gcp.sh --logs"
echo "  status:   ./deploy-gcp.sh --status"
echo "  rollback: edit BACKEND_IMAGE/ML_IMAGE in .env.prod on the VM to a :<tag> above, then ./deploy-gcp.sh --restart${N}"
