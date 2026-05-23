import type { RiskLevel } from "./types";

export type PrivacyHit = {
  label: string;
  risk: RiskLevel;
};

type PrivacyRule = {
  label: string;
  risk: RiskLevel;
  test: (text: string, compactText: string) => boolean;
};

const phonePattern = /(^|[^\d])1[3-9](?:[\s-]?\d){9}(?!\d)/;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const idCardPattern = /(^|[^\d])\d{6}\s?\d{4}\s?\d{2}\s?\d{2}\s?\d{3}[\dXx](?!\d)/;
const bankCardPattern = /(^|[^\d])\d(?:[\s-]?\d){15,18}(?!\d)/;
const alphaNumericCodePattern = /[A-Z0-9][A-Z0-9-]{9,}/gi;
const longDigitCodePattern = /(^|[^\d])\d{10,24}(?!\d)/;
const orderContextPattern = /(订单|单号|快递|运单|物流|编号|流水|交易|支付|No\.?|SN)/i;
const addressContextPattern = /(地址|收货|寄件|所在|省|市|区|县|镇|乡|路|街|号|小区|栋|幢|单元|室)/;
const amountContextPattern = /(金额|实付|付款|支付|收款|转账|合计|总计|小计|余额|价格|费用|退款|收入|支出|优惠|押金|运费)/;
const amountValuePattern = /(?:[-−]\s*)?(?:(?:¥|￥|\$|＄|US\$|HK\$|RMB|CNY|USD)\s*)?\d{1,9}(?:,\d{3})*(?:\.\d{1,2})?\s*(?:元|块|RMB|CNY|USD|美元)?/i;
const currencyValuePattern = /(?:[-−]\s*)?(?:(?:¥|￥|\$|＄|US\$|HK\$|RMB|CNY|USD)\s*)\d{1,9}(?:,\d{3})*(?:\.\d{1,2})?|(?:[-−]\s*)?\d{1,9}(?:,\d{3})*(?:\.\d{1,2})?\s*(?:元|块|RMB|CNY|USD|美元)/i;
const nameContextPattern = /(姓名|名字|真实姓名|收件人|收货人|寄件人|联系人|客户|用户|昵称|取件人|开户名)/;
const chineseNamePattern = /[\u4e00-\u9fa5·]{2,5}/;
const addressKeywords = ["省", "市", "区", "县", "镇", "乡", "路", "街", "号", "小区", "栋", "幢", "单元", "室"];

const rules: PrivacyRule[] = [
  {
    label: "手机号",
    risk: "high",
    test: (text) => phonePattern.test(text),
  },
  {
    label: "邮箱",
    risk: "high",
    test: (text) => emailPattern.test(text),
  },
  {
    label: "身份证号",
    risk: "high",
    test: (text) => idCardPattern.test(text),
  },
  {
    label: "银行卡号疑似",
    risk: "medium",
    test: (text, compactText) => {
      if (phonePattern.test(text) || idCardPattern.test(text)) return false;
      return bankCardPattern.test(text) || /(^|[^\d])\d{16,19}(?!\d)/.test(compactText);
    },
  },
  {
    label: "订单号疑似",
    risk: "medium",
    test: (text, compactText) => {
      if (phonePattern.test(text) || idCardPattern.test(text)) return false;
      return hasLikelyOrderCode(text, compactText);
    },
  },
  {
    label: "金额疑似",
    risk: "medium",
    test: (text) => {
      if (currencyValuePattern.test(text)) return true;
      return amountContextPattern.test(text) && amountValuePattern.test(text);
    },
  },
  {
    label: "姓名疑似",
    risk: "medium",
    test: (text, compactText) => {
      if (!nameContextPattern.test(text) && !nameContextPattern.test(compactText)) return false;
      return chineseNamePattern.test(compactText);
    },
  },
  {
    label: "地址疑似",
    risk: "medium",
    test: (text) => {
      const keywordHits = addressKeywords.reduce((count, keyword) => count + Number(text.includes(keyword)), 0);
      return text.trim().length >= 6 && (addressContextPattern.test(text) || keywordHits >= 2);
    },
  },
];

export function detectPrivacyInText(rawText: string): PrivacyHit[] {
  const text = rawText.replace(/\s+/g, " ").trim();
  const compactText = rawText.replace(/\s+/g, "");
  if (!text && !compactText) return [];

  const hits = rules.filter((rule) => rule.test(text, compactText));
  return mergeHits(hits.map(({ label, risk }) => ({ label, risk })));
}

export function strongestRisk(hits: PrivacyHit[]): RiskLevel {
  if (hits.some((hit) => hit.risk === "high")) return "high";
  if (hits.some((hit) => hit.risk === "medium")) return "medium";
  return "low";
}

function mergeHits(hits: PrivacyHit[]): PrivacyHit[] {
  const seen = new Map<string, PrivacyHit>();
  for (const hit of hits) {
    seen.set(hit.label, hit);
  }
  return Array.from(seen.values());
}

function hasLikelyOrderCode(text: string, compactText: string): boolean {
  const hasOrderContext = orderContextPattern.test(text) || orderContextPattern.test(compactText);
  const longDigitMatch = compactText.match(longDigitCodePattern);

  if (longDigitMatch) {
    const digits = longDigitMatch[0].replace(/\D/g, "");
    if (bankCardPattern.test(text) && !hasOrderContext) return false;
    return hasOrderContext || digits.length >= 12;
  }

  const candidates = compactText.match(alphaNumericCodePattern) ?? [];
  return candidates.some((candidate) => {
    const normalized = candidate.replace(/-/g, "");
    const digitCount = normalized.replace(/\D/g, "").length;
    const letterCount = (normalized.match(/[A-Z]/gi) ?? []).length;

    if (digitCount === 0) return false;
    if (hasOrderContext) return digitCount >= 3 && normalized.length >= 10;
    return digitCount >= 4 && letterCount >= 2 && normalized.length >= 12;
  });
}
