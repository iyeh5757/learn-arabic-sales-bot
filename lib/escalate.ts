const RULES: { re: RegExp; reason: string }[] = [
  { re: /refund|money back|chargeback/i, reason: "Refund or chargeback" },
  { re: /lawyer|solicitor|attorney|legal action/i, reason: "Legal threat" },
  { re: /scam|fraud|stolen/i, reason: "Fraud allegation" },
  { re: /complaint|complain/i, reason: "Complaint" },
  { re: /\b(manager|supervisor|owner|founder)\b/i, reason: "Asks for a manager" },
  {
    re: /payment (failed|issue|problem|declined)|double charged|charged twice/i,
    reason: "Payment problem",
  },
  { re: /unacceptable|furious|disgusted/i, reason: "Escalated tone" },
  {
    re: /\bdiscount\b|cheaper|best price|special (price|offer)|lowest price|price match/i,
    reason: "Pricing exception",
  },
  {
    re: /recorded course|workbook|ebook|textbook/i,
    reason: "Product outside the live-lesson price book",
  },
];

export function detectEscalation(text: string): { required: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const rule of RULES) {
    if (rule.re.test(text) && !reasons.includes(rule.reason)) reasons.push(rule.reason);
  }
  return { required: reasons.length > 0, reasons };
}
