const puppeteer = require("puppeteer");
const fs = require("fs");

const BASE = "https://www.alrajhibank.com.sa";
const TODAY = new Date().toISOString().split("T")[0];
const DELAY = 1200;

const CARD_URLS = [
  { path: "/en/Personal/Cards/Credit-Cards/Platinum-Credit-Card", tier: "Platinum", reward_type: "points", is_cobrand: false },
  { path: "/en/Personal/Cards/Credit-Cards/Signature-Credit-Card", tier: "Signature", reward_type: "points", is_cobrand: false },
  { path: "/en/Personal/Cards/Credit-Cards/Infinite-Credit-Card", tier: "Infinite", reward_type: "points", is_cobrand: false },
  { path: "/en/Personal/Cards/Charge-Credit-Cards/Classic-Card", tier: "Classic", reward_type: "points", is_cobrand: false, note: "Charge card" },
  { path: "/en/Personal/Cards/Charge-Credit-Cards/Platinum-Card", tier: "Platinum", reward_type: "points", is_cobrand: false, note: "Charge card" },
  { path: "/en/Personal/Cards/Charge-Credit-Cards/Signature-Card", tier: "Signature", reward_type: "points", is_cobrand: false, note: "Charge card" },
  { path: "/en/Personal/Cards/Cashback-Cards/Cashback-Platinum-Credit-Card", tier: "Platinum", reward_type: "cashback", is_cobrand: false },
  { path: "/en/Personal/Cards/Cashback-Cards/Cashback-Signature-Credit-Card", tier: "Signature", reward_type: "cashback", is_cobrand: false },
  { path: "/en/Personal/Cards/Miles-Cards/AlFursan-Visa-Infinite-Credit-Card", tier: "Infinite", reward_type: "miles", is_cobrand: true, cobrand_partner: "Saudia AlFursan" },
  { path: "/en/Personal/Cards/Miles-Cards/AlFursan-Visa-Signature-Credit-Card", tier: "Signature", reward_type: "miles", is_cobrand: true, cobrand_partner: "Saudia AlFursan" },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function firstMatch(text, patterns) {
  for (const p of patterns) { const m = text.match(p); if (m) return m; }
  return null;
}

async function extractCard(page, meta) {
  const url = BASE + meta.path;
  console.log(`  → ${meta.path}`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(DELAY);
  } catch(e) { console.log(`  ✗ ${e.message}`); return null; }

  const data = await page.evaluate(() => {
    const text = document.body.innerText;
    const h2 = document.querySelector("h2");
    const cardName = h2 ? h2.innerText.trim() : null;
    let imageUrl = null;
    for (const img of document.querySelectorAll("img[src]")) {
      const src = img.getAttribute("src") || "";
      if (src.match(/Credit|Card|Infinite|Platinum|Signature|Classic|Miles|Cashback/i)) {
        imageUrl = src.startsWith("/-/") ? "https://www.alrajhibank.com.sa" + src : src;
        break;
      }
    }
    let applyUrl = null;
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") || "";
      const txt = a.innerText.toLowerCase();
      if (txt.includes("apply") && (href.includes("arb.sa") || href.includes("alrajhibank"))) { applyUrl = href; break; }
    }
    const feesObj = {};
    for (const table of document.querySelectorAll("table")) {
      for (const row of table.querySelectorAll("tr")) {
        const cells = row.querySelectorAll("td, th");
        if (cells.length >= 2) feesObj[cells[0].innerText.trim().toLowerCase()] = cells[1].innerText.trim();
      }
    }
    const networkMatch = text.match(/\b(Visa|Mastercard)\b/i);
    return { text, cardName, imageUrl, applyUrl, feesObj, network: networkMatch ? networkMatch[1] : "Visa" };
  });

  const { text, cardName, imageUrl, applyUrl, feesObj, network } = data;

  let annualFee = null, annualFeeWaived = null, annualFeeRaw = null;
  for (const [k, v] of Object.entries(feesObj)) {
    if (k.includes("annual")) {
      annualFeeRaw = v;
      const vl = v.toLowerCase();
      if (vl.includes("zero") || vl.includes("free") || vl.includes("waived")) { annualFee = 0; annualFeeWaived = true; }
      else { const m = v.match(/SAR\s*([\d,]+)/i); if (m) { annualFee = parseInt(m[1].replace(/,/g,"")); annualFeeWaived = false; } }
      break;
    }
  }

  let profitRate = null;
  for (const [k, v] of Object.entries(feesObj)) {
    if (k.includes("profit rate")) { const m = v.match(/([\d.]+)\s*%/); if (m) { profitRate = parseFloat(m[1]); break; } }
  }

  let fxFee = null;
  for (const [k, v] of Object.entries(feesObj)) {
    if (k.includes("international transaction") || k.includes("foreign")) { const m = v.match(/([\d.]+)\s*%/); if (m) { fxFee = parseFloat(m[1]); break; } }
  }

  const aprM = text.match(/Finance APR\s*[|]?\s*([\d.]+)\s*%/);
  const bonusM = text.match(/[Ee]arn\s+([\d,]+)\s+welcome\s+(?:mokafaa\s+)?points?[^\n.]{0,100}/);
  const loungeM = text.match(/[Aa]ccess to (?:over |up to )?[\d,]+\+?\s+(?:global\s+)?airport lounges?[^\n.]*/);

  let cashbackLocal=null, cashbackIntl=null, ptsLocal=null, ptsIntl=null, milesLocal=null, milesIntl=null;
  if (meta.reward_type === "cashback") {
    const cb = firstMatch(text, [/up to\s+([\d.]+)\s*%\s*cashback/i, /([\d.]+)\s*%\s*cashback/i]);
    const cbI = text.match(/([\d.]+)\s*%.*international/i);
    if (cb) cashbackLocal = parseFloat(cb[1]);
    if (cbI) cashbackIntl = parseFloat(cbI[1]);
  } else if (meta.reward_type === "miles") {
    const ml = text.match(/(?:earn\s+)?([\d.]+)\s+miles?\s+per\s+(?:SAR\s+)?1\s+(?:domestic|local)/i);
    const mi = text.match(/([\d.]+)\s+miles?\s+(?:per|on)\s+(?:SAR\s+)?1\s+international/i);
    if (ml) milesLocal = parseFloat(ml[1]);
    if (mi) milesIntl = parseFloat(mi[1]);
  } else {
    const pl = text.match(/[Ee]arn\s+([\d.]+)\s+[Pp]oints?\s+[Pp]er\s+(?:SAR\s+)?1\s+[Dd]omestic/);
    const pi = text.match(/([\d.]+)\s+[Pp]oints?\s+on\s+[Ii]nternational/);
    if (pl) ptsLocal = parseFloat(pl[1]);
    if (pi) ptsIntl = parseFloat(pi[1]);
  }

  return {
    bank_id: 7, bank_name_en: "Al Rajhi Bank", bank_name_ar: "بنك الراجحي",
    card_name_en: cardName, card_type: "credit", network, tier: meta.tier,
    is_sharia: true, is_cobrand: meta.is_cobrand, cobrand_partner: meta.cobrand_partner || null,
    reward_type: meta.reward_type,
    reward_program: meta.reward_type === "points" ? "mokafaa" : meta.reward_type === "miles" ? "AlFursan" : null,
    cashback_local_pct: cashbackLocal, cashback_intl_pct: cashbackIntl,
    points_per_sar_local: ptsLocal, points_per_sar_intl: ptsIntl,
    miles_per_sar_local: milesLocal, miles_per_sar_intl: milesIntl,
    welcome_bonus: bonusM ? bonusM[0].trim() : null,
    annual_fee_sar: annualFee, annual_fee_waived_y1: annualFeeWaived, annual_fee_raw: annualFeeRaw,
    profit_rate_monthly_pct: profitRate, apr_pct: aprM ? parseFloat(aprM[1]) : null, fx_fee_pct: fxFee,
    min_salary_sar: null, nationality: "Both",
    lounge_access: loungeM ? loungeM[0].trim() : null,
    travel_insurance: /travel insur/i.test(text), concierge: /concierge/i.test(text), purchase_protection: /purchase protection/i.test(text),
    digital_wallets: "Apple Pay, mada Pay, Google Pay, Samsung Pay",
    installment_plan: "0% Tasaheal (3/6/9/12m via partner merchants)",
    required_docs: "Al Rajhi bank account, National ID/Iqama, Salary certificate",
    apply_url: applyUrl, card_page_url: BASE + meta.path, image_url: imageUrl,
    data_source_url: BASE + meta.path, last_verified_date: TODAY,
    verified_by: "puppeteer-v1", notes: meta.note || null,
  };
}

(async () => {
  console.log("Al Rajhi Bank — Scraper starting...\n");
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36");

  const cards = [];
  for (const meta of CARD_URLS) {
    const card = await extractCard(page, meta);
    if (card) {
      cards.push(card);
      console.log(`  ✅ ${card.card_name_en} | fee: ${card.annual_fee_sar} | profit: ${card.profit_rate_monthly_pct}%`);
    }
  }

  await browser.close();
  fs.writeFileSync("alrajhi_cards.json", JSON.stringify(cards, null, 2));
  console.log(`\n✅ Done. ${cards.length} cards → alrajhi_cards.json`);
})();
