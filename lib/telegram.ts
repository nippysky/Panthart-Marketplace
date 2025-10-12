// lib/telegram.ts
/**
 * Telegram notify helper with simple, editable templates.
 *
 * Required env:
 *  - TELEGRAM_BOT_TOKEN
 *  - TELEGRAM_GROUP_CHAT_ID             (supergroup id, e.g., -1002243945802)
 *
 * Optional env (threaded topics):
 *  - TELEGRAM_TOPIC_APPROVED_ID         (string, thread id)
 *  - TELEGRAM_TOPIC_REJECTED_ID         (string, thread id)
 *  - TELEGRAM_TOPIC_DEPLOYED_ID         (string, thread id — for ERC-721 Drop deployed)
 *  - TELEGRAM_TOPIC_SINGLE721_ID        (string, thread id — for Single ERC-721 created)
 *  - TELEGRAM_TOPIC_SINGLE1155_ID       (string, thread id — for Single ERC-1155 created)
 *
 * Optional env (links):
 *  - NEXT_PUBLIC_BASE_URL               (e.g., https://panth.art)
 *  - EXPLORER_BASE_URL                  (e.g., https://blockexplorer.electroneum.com/address/)
 *
 * Notes:
 *  - All send* functions are best-effort. They never throw; errors are logged.
 *  - If a topic id is not set, messages go to the group root.
 *  - Edit the template renderers below to change copy/formatting.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID || "";

// Optional per-topic threads
const TOPIC_APPROVED = process.env.TELEGRAM_TOPIC_APPROVED_ID || "";
const TOPIC_REJECTED = process.env.TELEGRAM_TOPIC_REJECTED_ID || "";
const TOPIC_DEPLOYED = process.env.TELEGRAM_TOPIC_DEPLOYED_ID || "";
const TOPIC_SINGLE721 = process.env.TELEGRAM_TOPIC_SINGLE721_ID || "";
const TOPIC_SINGLE1155 = process.env.TELEGRAM_TOPIC_SINGLE1155_ID || "";

// Optional link bases
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "";
const EXPLORER_BASE_URL = process.env.EXPLORER_BASE_URL || "";

/* ───────────────── types ───────────────── */

export type MiniSubmission = {
  id: string;
  name?: string | null;
  symbol?: string | null;
  contract: string;
  supply?: number | null; // optional in some contexts
};

type TopicKind =
  | "approved"
  | "rejected"
  | "deployed" // ERC-721 Drop deployed (factory clone)
  | "single721" // Single ERC-721 created
  | "single1155"; // Single ERC-1155 created

/* ───────────────── helpers ───────────────── */

export function telegramEnabled() {
  return Boolean(BOT_TOKEN && CHAT_ID);
}

function escapeHtml(s?: string | null) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function short(addr: string) {
  return addr && addr.length === 42 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function siteCollectionUrl(contract: string) {
  if (!BASE_URL) return "";
  return `${BASE_URL.replace(/\/+$/, "")}/collections/${contract}`;
}

function siteTokenUrl(contract: string, tokenId: string | number) {
  if (!BASE_URL) return "";
  return `${BASE_URL.replace(/\/+$/, "")}/collections/${contract}/${tokenId}`;
}

function explorerUrl(contract: string) {
  if (!EXPLORER_BASE_URL) return "";
  const base = EXPLORER_BASE_URL.endsWith("/")
    ? EXPLORER_BASE_URL
    : `${EXPLORER_BASE_URL}/`;
  return `${base}${contract}`;
}

/**
 * Convert wei (as a decimal string) to ETN string with up to `maxDecimals` places.
 * No floating-point math; purely string-based.
 */
function weiToEtnString(wei: string, maxDecimals = 6): string {
  try {
    let s = String(wei).replace(/^0+/, "") || "0";
    let whole = "0";
    let frac = "";

    if (s.length <= 18) {
      whole = "0";
      frac = s.padStart(18, "0");
    } else {
      whole = s.slice(0, s.length - 18);
      frac = s.slice(s.length - 18);
    }

    if (maxDecimals >= 0) {
      frac = frac.slice(0, maxDecimals);
    }

    // trim trailing zeros
    frac = frac.replace(/0+$/, "");
    return frac ? `${whole}.${frac}` : whole;
  } catch {
    // fallback: raw wei if anything goes wrong
    return wei;
  }
}

/* ───────────────── templates (edit freely) ───────────────── */

export function renderApprovalHtml(
  item: MiniSubmission,
  opts: { admin?: string } = {}
) {
  const name = escapeHtml(item.name) || "—";
  const symbol = escapeHtml(item.symbol) || "—";
  const contract = escapeHtml(item.contract);
  const supply = typeof item.supply === "number" ? String(item.supply) : "—";

  const site = siteCollectionUrl(item.contract);
  const explorer = explorerUrl(item.contract);

  const lines = [
    `<b>✅ Collection Approved. It will be available on Panthart within 24 hours. If not, ping us on Telegram.</b>`,
    `<b>${name}</b> (${symbol})`,
    `<code>${contract}</code>`,
    `Supply: <b>${supply}</b>`,
  ];

  if (opts.admin) lines.push(`Reviewed by: <code>${escapeHtml(short(opts.admin))}</code>`);
  if (site) lines.push(`\n<a href="${escapeHtml(site)}">View on Panthart</a>`);
  if (explorer) lines.push(`<a href="${escapeHtml(explorer)}">View on Explorer</a>`);

  return lines.join("\n");
}

export function renderRejectionHtml(
  item: MiniSubmission,
  opts: { reason?: string; admin?: string } = {}
) {
  const name = escapeHtml(item.name) || "—";
  const symbol = escapeHtml(item.symbol) || "—";
  const contract = escapeHtml(item.contract);

  const explorer = explorerUrl(item.contract);

  const lines = [
    `<b>⛔️ Collection Rejected.</b>`,
    `<b>${name}</b> (${symbol})`,
    `<code>${contract}</code>`,
  ];

  if (opts.reason) lines.push(`Reason: <i>${escapeHtml(opts.reason)}</i>`);
  if (opts.admin) lines.push(`Reviewed by: <code>${escapeHtml(short(opts.admin))}</code>`);
  if (explorer) lines.push(`<a href="${escapeHtml(explorer)}">Explorer</a>`);

  return lines.join("\n");
}

/** ERC-721 Drop deployed (factory clone) */
export function renderDeployedHtml(
  item: MiniSubmission & { deployer?: string; txHash?: string }
) {
  const name = escapeHtml(item.name) || "—";
  const symbol = escapeHtml(item.symbol) || "—";
  const contract = escapeHtml(item.contract);
  const supply = typeof item.supply === "number" ? String(item.supply) : "—";
  const deployer = item.deployer ? escapeHtml(short(item.deployer)) : null;

  const site = siteCollectionUrl(item.contract);
  const explorer = explorerUrl(item.contract);

  const lines = [
    `<b>🚀 New ERC-721 Drop Deployed</b>`,
    `<b>${name}</b> (${symbol})`,
    `<code>${contract}</code>`,
    `Supply: <b>${supply}</b>`,
  ];

  if (deployer) lines.push(`Deployer: <code>${deployer}</code>`);
  if (site) lines.push(`\n<a href="${escapeHtml(site)}">View on Panthart</a>`);
  if (explorer) lines.push(`<a href="${escapeHtml(explorer)}">View on Explorer</a>`);

  return lines.join("\n");
}

/** Single ERC-721 created (tokenId is 1 in your flow) */
export function renderSingle721Html(
  item: MiniSubmission & { owner?: string; deployer?: string; tokenId?: string | number }
) {
  const name = escapeHtml(item.name) || "—";
  const symbol = escapeHtml(item.symbol) || "—";
  const contract = escapeHtml(item.contract);
  const tokenId = item.tokenId ?? 1;
  const owner = item.owner ? escapeHtml(short(item.owner)) : null;
  const deployer = item.deployer ? escapeHtml(short(item.deployer)) : null;

  const siteToken = siteTokenUrl(item.contract, tokenId);
  const siteCollection = siteCollectionUrl(item.contract);
  const explorer = explorerUrl(item.contract);

  const lines = [
    `<b>🎨 Single ERC-721 Created</b>`,
    `<b>${name}</b> (${symbol})`,
    `<code>${contract}</code> • Token ID: <b>${tokenId}</b>`,
  ];

  if (owner) lines.push(`Owner: <code>${owner}</code>`);
  if (deployer) lines.push(`Deployer: <code>${deployer}</code>`);

  if (siteToken) lines.push(`\n<a href="${escapeHtml(siteToken)}">View NFT on Panthart</a>`);
  else if (siteCollection) lines.push(`\n<a href="${escapeHtml(siteCollection)}">View on Panthart</a>`);

  if (explorer) lines.push(`<a href="${escapeHtml(explorer)}">View on Explorer</a>`);

  return lines.join("\n");
}

/**
 * Single ERC-1155 created (tokenId is 1 in your flow; includes max supply).
 * Optionally displays `mintPriceWei` as ETN if provided.
 */
export function renderSingle1155Html(
  item: MiniSubmission & {
    owner?: string;
    deployer?: string;
    tokenId?: string | number;
    mintPriceWei?: string | number | bigint;
  }
) {
  const name = escapeHtml(item.name) || "—";
  const symbol = escapeHtml(item.symbol) || "—";
  const contract = escapeHtml(item.contract);
  const tokenId = item.tokenId ?? 1;
  const supply = typeof item.supply === "number" ? String(item.supply) : "—";
  const owner = item.owner ? escapeHtml(short(item.owner)) : null;
  const deployer = item.deployer ? escapeHtml(short(item.deployer)) : null;

  const siteToken = siteTokenUrl(item.contract, tokenId);
  const siteCollection = siteCollectionUrl(item.contract);
  const explorer = explorerUrl(item.contract);

  const lines = [
    `<b>🧱 Single ERC-1155 Created</b>`,
    `<b>${name}</b> (${symbol})`,
    `<code>${contract}</code> • Token ID: <b>${tokenId}</b>`,
    `Max Supply: <b>${supply}</b>`,
  ];

  if (typeof item.mintPriceWei !== "undefined" && item.mintPriceWei !== null) {
    const weiStr = String(item.mintPriceWei);
    const etn = weiToEtnString(weiStr, 6);
    lines.push(`Mint Price: <b>${escapeHtml(etn)} ETN</b>`);
  }

  if (owner) lines.push(`Owner: <code>${owner}</code>`);
  if (deployer) lines.push(`Deployer: <code>${deployer}</code>`);

  if (siteToken) lines.push(`\n<a href="${escapeHtml(siteToken)}">View NFT on Panthart</a>`);
  else if (siteCollection) lines.push(`\n<a href="${escapeHtml(siteCollection)}">View on Panthart</a>`);

  if (explorer) lines.push(`<a href="${escapeHtml(explorer)}">View on Explorer</a>`);

  return lines.join("\n");
}

/** Batch summary for approved/rejected/deployed if needed later */
export function renderBatchSummaryHtml(
  kind: TopicKind,
  items: MiniSubmission[],
  opts: { admin?: string; reason?: string } = {}
) {
  const title =
    kind === "approved"
      ? "✅ Collections Approved"
      : kind === "rejected"
      ? "⛔️ Collections Rejected"
      : "🚀 Collections Deployed";

  const header = `<b>${title}</b>\n`;

  const lines = items.slice(0, 10).map((it) => {
    const n = escapeHtml(it.name) || "—";
    const s = escapeHtml(it.symbol) || "—";
    const c = escapeHtml(it.contract);
    const sup = typeof it.supply === "number" ? String(it.supply) : "—";
    return `• <b>${n}</b> (${s}) — <code>${c}</code> • supply: ${sup}`;
  });

  const extras: string[] = [];
  if (items.length > 10) extras.push(`\n…and ${items.length - 10} more.`);
  if (opts.reason && kind === "rejected") extras.push(`\nReason: <i>${escapeHtml(opts.reason)}</i>`);
  if (opts.admin) extras.push(`\nReviewed by: <code>${escapeHtml(short(opts.admin))}</code>`);
  if (BASE_URL) {
    extras.push(
      `\n\n<i>Visit Panthart:</i> <a href="${escapeHtml(BASE_URL)}">${escapeHtml(BASE_URL)}</a>`
    );
  }

  return `${header}${lines.join("\n")}${extras.join("")}`;
}

/* ───────────────── sender ───────────────── */

async function sendHtml(kind: TopicKind, html: string) {
  if (!telegramEnabled()) return;

  const thread =
    kind === "approved" && TOPIC_APPROVED
      ? Number(TOPIC_APPROVED)
      : kind === "rejected" && TOPIC_REJECTED
      ? Number(TOPIC_REJECTED)
      : kind === "deployed" && TOPIC_DEPLOYED
      ? Number(TOPIC_DEPLOYED)
      : kind === "single721" && TOPIC_SINGLE721
      ? Number(TOPIC_SINGLE721)
      : kind === "single1155" && TOPIC_SINGLE1155
      ? Number(TOPIC_SINGLE1155)
      : undefined;

  const payload: any = {
    chat_id: CHAT_ID,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (Number.isFinite(thread)) {
    payload.message_thread_id = thread;
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn("[telegram] sendMessage failed:", res.status, txt);
    }
  } catch (err) {
    console.warn("[telegram] sendMessage error:", (err as any)?.message || err);
  }
}

/* ───────────────── public helpers ───────────────── */

export async function notifyApproved(items: MiniSubmission[], opts?: { admin?: string }) {
  if (!telegramEnabled() || items.length === 0) return;
  const html =
    items.length === 1
      ? renderApprovalHtml(items[0], { admin: opts?.admin })
      : renderBatchSummaryHtml("approved", items, { admin: opts?.admin });
  await sendHtml("approved", html);
}

export async function notifyRejected(
  items: MiniSubmission[],
  opts?: { admin?: string; reason?: string }
) {
  if (!telegramEnabled() || items.length === 0) return;
  const html =
    items.length === 1
      ? renderRejectionHtml(items[0], { admin: opts?.admin, reason: opts?.reason })
      : renderBatchSummaryHtml("rejected", items, {
          admin: opts?.admin,
          reason: opts?.reason,
        });
  await sendHtml("rejected", html);
}

export async function notifyDeployed(
  item: MiniSubmission & { deployer?: string; txHash?: string }
) {
  if (!telegramEnabled()) return;
  const html = renderDeployedHtml(item);
  await sendHtml("deployed", html);
}

/** Single ERC-721 created */
export async function notifySingle721Created(
  item: MiniSubmission & { tokenId?: string | number; owner?: string; deployer?: string }
) {
  if (!telegramEnabled()) return;
  const html = renderSingle721Html(item);
  await sendHtml("single721", html);
}

/** Single ERC-1155 created */
export async function notifySingle1155Created(
  item: MiniSubmission & {
    tokenId?: string | number;
    owner?: string;
    deployer?: string;
    mintPriceWei?: string | number | bigint;
  }
) {
  if (!telegramEnabled()) return;
  const html = renderSingle1155Html(item);
  await sendHtml("single1155", html);
}
