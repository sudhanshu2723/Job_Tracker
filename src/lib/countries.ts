// Country list for the form dropdown + a heuristic to derive a country from a
// free-text location string (used to auto-tag scanned jobs).

export const COUNTRIES: string[] = [
  "Remote",
  "India",
  "United States",
  "United Kingdom",
  "Canada",
  "Germany",
  "France",
  "Netherlands",
  "Ireland",
  "Spain",
  "Portugal",
  "Italy",
  "Poland",
  "Switzerland",
  "Sweden",
  "Norway",
  "Denmark",
  "Finland",
  "Belgium",
  "Austria",
  "Czech Republic",
  "Romania",
  "Ukraine",
  "Israel",
  "United Arab Emirates",
  "Saudi Arabia",
  "Qatar",
  "Singapore",
  "Japan",
  "South Korea",
  "China",
  "Hong Kong",
  "Taiwan",
  "Australia",
  "New Zealand",
  "Brazil",
  "Mexico",
  "Argentina",
  "Chile",
  "Colombia",
  "South Africa",
  "Nigeria",
  "Kenya",
  "Egypt",
  "Indonesia",
  "Malaysia",
  "Philippines",
  "Vietnam",
  "Thailand",
  "Bangladesh",
  "Pakistan",
  "Sri Lanka",
  "Turkey",
  "Greece",
  "Hungary",
  "Estonia",
  "Lithuania",
  "Latvia",
  "Bulgaria",
  "Croatia",
  "Serbia",
];

// Aliases / extra spellings for the trickier ones.
const SPECIAL: Record<string, string[]> = {
  "United States": ["united states", "usa", "u.s.", "u.s.a", "\\bus\\b", "america"],
  "United Kingdom": ["united kingdom", "\\buk\\b", "england", "scotland", "wales", "britain", "london"],
  "United Arab Emirates": ["united arab emirates", "\\buae\\b", "dubai", "abu dhabi"],
  "South Korea": ["south korea", "korea", "seoul"],
  "Hong Kong": ["hong kong"],
  "Czech Republic": ["czech republic", "czechia", "prague"],
};

// Full US state names → United States (covers "San Francisco, California").
const US_STATES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut",
  "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa",
  "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan",
  "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada",
  "new hampshire", "new jersey", "new mexico", "new york", "north carolina",
  "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island",
  "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
  "virginia", "washington", "wisconsin", "wyoming",
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Build ordered matchers: [country, RegExp[]].
const MATCHERS: [string, RegExp[]][] = COUNTRIES.filter((c) => c !== "Remote").map(
  (country) => {
    const aliases = SPECIAL[country] ?? [country.toLowerCase()];
    const res = aliases.map((a) =>
      a.startsWith("\\b") ? new RegExp(a, "i") : new RegExp(`\\b${esc(a)}\\b`, "i"),
    );
    return [country, res];
  },
);

const US_STATE_RE = US_STATES.map((s) => new RegExp(`\\b${esc(s)}\\b`, "i"));

// Case-SENSITIVE 2-letter ISO codes (e.g. "MH, IN" → India). CA/US-state codes
// are excluded to avoid confusing California with Canada.
const ISO_CODES: Record<string, string> = {
  IN: "India", US: "United States", GB: "United Kingdom", UK: "United Kingdom",
  AE: "United Arab Emirates", SG: "Singapore", DE: "Germany", FR: "France",
  NL: "Netherlands", IE: "Ireland", AU: "Australia", NZ: "New Zealand",
  JP: "Japan", BR: "Brazil", ES: "Spain", PT: "Portugal", SE: "Sweden",
  CH: "Switzerland", PL: "Poland", PH: "Philippines", ID: "Indonesia",
  MY: "Malaysia", PK: "Pakistan", BD: "Bangladesh", LK: "Sri Lanka",
};
const ISO_RE: [RegExp, string][] = Object.entries(ISO_CODES).map(([code, country]) => [
  new RegExp(`\\b${code}\\b`),
  country,
]);

// Well-known tech cities → country, for locations that name only a city.
const CITY_TO_COUNTRY: Record<string, string> = {
  "United States": [
    "san francisco", "mountain view", "san jose", "palo alto", "sunnyvale",
    "menlo park", "cupertino", "redmond", "bellevue", "new york", "nyc",
    "brooklyn", "manhattan", "seattle", "austin", "boston", "los angeles",
    "san diego", "chicago", "denver", "boulder", "atlanta", "dallas",
    "houston", "miami", "philadelphia", "pittsburgh", "portland", "phoenix",
    "bay area", "silicon valley",
  ].join("|"),
  Canada: ["toronto", "vancouver", "montreal", "montréal", "ottawa", "waterloo", "calgary"].join("|"),
  India: [
    "bengaluru", "bangalore", "hyderabad", "pune", "mumbai", "new delhi",
    "gurugram", "gurgaon", "noida", "chennai", "kolkata", "ahmedabad",
  ].join("|"),
  "United Kingdom": ["london", "manchester", "edinburgh", "bristol"].join("|"),
  Germany: ["berlin", "munich", "münchen", "hamburg"].join("|"),
  Netherlands: ["amsterdam", "rotterdam", "utrecht"].join("|"),
  Ireland: ["dublin"].join("|"),
};
const CITY_RE: [RegExp, string][] = Object.entries(CITY_TO_COUNTRY).map(([country, alt]) => [
  new RegExp(`\\b(?:${alt})\\b`, "i"),
  country,
]);

/** Best-effort country from a location string; "" if unknown. */
export function deriveCountry(location: string): string {
  if (!location) return "";
  for (const [country, res] of MATCHERS) {
    if (res.some((re) => re.test(location))) return country;
  }
  if (US_STATE_RE.some((re) => re.test(location))) return "United States";
  for (const [re, country] of ISO_RE) {
    if (re.test(location)) return country;
  }
  for (const [re, country] of CITY_RE) {
    if (re.test(location)) return country;
  }
  return "";
}
