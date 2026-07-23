// Curated top-50 MNCs that hire freshers in India, ranked by brand recognition
// and fresher compensation. Deliberately weighted toward product / fintech /
// quant / hardware firms (which pay freshers well) over mass IT-services shops.
// Powers the dashboard's "MNCs only" company filter — a best-effort heuristic
// that matches a posting's company name against these brands' aliases.

export const MNC_COMPANIES: string[] = [
  "Google", "Microsoft", "Amazon", "Meta", "Apple",
  "Netflix", "Adobe", "Nvidia", "Salesforce", "Uber",
  "Atlassian", "LinkedIn", "Oracle", "SAP", "Intel",
  "Qualcomm", "Cisco", "VMware", "PayPal", "Visa",
  "Mastercard", "Samsung", "Texas Instruments", "AMD", "Micron",
  "ServiceNow", "Workday", "Twilio", "Walmart", "Flipkart",
  "Goldman Sachs", "Morgan Stanley", "JPMorgan", "American Express", "Wells Fargo",
  "D. E. Shaw", "Tower Research", "Optiver", "Jane Street", "Citadel",
  "Databricks", "Snowflake", "MongoDB", "Confluent", "Stripe",
  "Sprinklr", "Palo Alto Networks", "Arista Networks", "Nutanix", "Expedia",
];

// Lowercase, dot-free match aliases (whole-word matched against a posting's
// company name). Multiple spellings per brand to catch naming variations.
const ALIASES: string[] = [
  "google", "alphabet",
  "microsoft",
  "amazon", "aws", "amazon web services",
  "meta platforms", "facebook",
  "apple",
  "netflix",
  "adobe",
  "nvidia",
  "salesforce",
  "uber",
  "atlassian",
  "linkedin",
  "oracle",
  "sap",
  "intel",
  "qualcomm",
  "cisco",
  "vmware",
  "paypal",
  "visa",
  "mastercard",
  "samsung",
  "texas instruments",
  "amd",
  "micron",
  "servicenow", "service now",
  "workday",
  "twilio",
  "walmart", "walmart global tech",
  "flipkart",
  "goldman sachs",
  "morgan stanley",
  "jpmorgan", "jp morgan", "j p morgan",
  "american express", "amex",
  "wells fargo",
  "de shaw", "d e shaw", "deshaw",
  "tower research",
  "optiver",
  "jane street",
  "citadel",
  "databricks",
  "snowflake",
  "mongodb",
  "confluent",
  "stripe",
  "sprinklr",
  "palo alto networks", "palo alto",
  "arista",
  "nutanix",
  "expedia",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MNC_RE = new RegExp(`\\b(${ALIASES.map(escape).join("|")})\\b`, "i");

/** True when a posting's company name looks like one of the curated MNCs. */
export function isMnc(company: string | null | undefined): boolean {
  if (!company) return false;
  const c = company.toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
  return MNC_RE.test(c);
}
