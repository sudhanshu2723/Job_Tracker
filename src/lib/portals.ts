// Company job boards to scan, plus the role keyword filter.
// Ported/adapted from the MIT-licensed career-ops project (santifer/career-ops).
// Only Greenhouse / Ashby / Lever boards are API-scannable. Add your own freely —
// a wrong slug just errors out for that one company (non-fatal).

export interface Portal {
  name: string;
  /** Greenhouse boards API URL. */
  api?: string;
  /** Ashby or Lever public careers URL (the scanner derives the API from it). */
  careersUrl?: string;
}

const gh = (slug: string): string =>
  `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;
const ashby = (slug: string): string => `https://jobs.ashbyhq.com/${slug}`;
const lever = (slug: string): string => `https://jobs.lever.co/${slug}`;

export const PORTALS: Portal[] = [
  // --- Greenhouse ---
  { name: "Anthropic", api: gh("anthropic") },
  { name: "Intercom", api: gh("intercom") },
  { name: "Airtable", api: gh("airtable") },
  { name: "Vercel", api: gh("vercel") },
  { name: "Temporal", api: gh("temporal") },
  { name: "Glean", api: gh("gleanwork") },
  { name: "Arize AI", api: gh("arizeai") },
  { name: "RunPod", api: gh("runpod") },
  { name: "Hume AI", api: gh("humeai") },
  { name: "PolyAI", api: gh("polyai") },
  { name: "Parloa", api: gh("parloa") },
  { name: "Speechmatics", api: gh("speechmatics") },
  { name: "Databricks", api: gh("databricks") },
  { name: "Discord", api: gh("discord") },
  { name: "Reddit", api: gh("reddit") },
  { name: "Robinhood", api: gh("robinhood") },
  { name: "Figma", api: gh("figma") },
  { name: "Samsara", api: gh("samsara") }, // IoT / connected devices

  // --- Ashby ---
  { name: "ElevenLabs", careersUrl: ashby("elevenlabs") },
  { name: "Deepgram", careersUrl: ashby("deepgram") },
  { name: "Vapi", careersUrl: ashby("vapi") },
  { name: "Sierra", careersUrl: ashby("sierra") },
  { name: "Decagon", careersUrl: ashby("decagon") },
  { name: "Lindy", careersUrl: ashby("lindy") },
  { name: "n8n", careersUrl: ashby("n8n") },
  { name: "Zapier", careersUrl: ashby("zapier") },
  { name: "Cohere", careersUrl: ashby("cohere") },
  { name: "LangChain", careersUrl: ashby("langchain") },
  { name: "Pinecone", careersUrl: ashby("pinecone") },
  { name: "Notion", careersUrl: ashby("notion") },
  { name: "Ramp", careersUrl: ashby("ramp") },
  { name: "Linear", careersUrl: ashby("linear") },
  { name: "Mercury", careersUrl: ashby("mercury") },
  { name: "Vanta", careersUrl: ashby("vanta") },

  // --- Lever ---
  { name: "Netlify", careersUrl: lever("netlify") },
  { name: "Voiceflow", careersUrl: lever("voiceflow") },
];

// Role keyword filter: a title must contain at least one positive keyword and
// no negative keyword (case-insensitive).
export const TITLE_FILTER = {
  positive: [
    // SDE / general
    "Software Engineer",
    "Software Development",
    "SDE",
    "Software Developer",
    // Backend
    "Backend",
    "Back-End",
    "Back End",
    "Server",
    "Distributed Systems",
    "Platform Engineer",
    "Infrastructure Engineer",
    // Full stack
    "Full Stack",
    "Full-Stack",
    "Fullstack",
    // Frontend
    "Frontend",
    "Front-End",
    "Front End",
    "Web Engineer",
    "Web Developer",
    "UI Engineer",
    // IoT / embedded
    "IoT",
    "Embedded",
    "Firmware",
    "Device",
    "Hardware",
    // AI / ML
    "AI",
    "ML",
    "Machine Learning",
    "Deep Learning",
    "LLM",
    "GenAI",
    "Generative AI",
    "NLP",
    "MLOps",
    "AI Engineer",
    "ML Engineer",
    "Applied AI",
    "Applied Scientist",
    "Data Engineer",
  ],
  negative: [
    "Intern",
    "Internship",
    "Manager",
    "Director",
    "VP",
    "Vice President",
    "Head of",
    "Sales",
    "Business Development",
    "Marketing",
    "Recruiter",
    "Recruiting",
    "Account Executive",
    "Designer",
    "Counsel",
    "Legal",
    "Finance",
    "People Partner",
    "Talent",
  ],
};

// JobSpy scanner — pulls LinkedIn + Indeed (best-effort; may be blocked on
// datacenter IPs). Runs in addition to the reliable ATS scan.
export const JOBSPY = {
  // Off by default — set ENABLE_JOBSPY=true in .env to turn on (best run locally).
  enabled: process.env.ENABLE_JOBSPY === "true",
  sites: ["linkedin", "indeed"] as const,
  location: "India",
  countryIndeed: "india",
  resultsWanted: 20,
  // Search terms for the target role families (fresher level is filtered after).
  searchTerms: [
    "Software Engineer",
    "Backend Developer",
    "Full Stack Developer",
    "Frontend Developer",
    "Machine Learning Engineer",
  ],
};

// Experience-level filter — keep only fresher / entry-level roles.
export const EXPERIENCE = {
  // Master switch. Set false to keep all experience levels.
  fresherOnly: true,
  // A role passes if its required experience is <= this (years).
  maxYears: 2,
  // Seniority markers in the TITLE → excluded outright.
  seniorMarkers: [
    "Senior",
    "Sr",
    "Staff",
    "Principal",
    "Lead",
    "Distinguished",
    "Expert",
    "Architect",
    "II",
    "III",
    "IV",
  ],
  // Phrases (title or description) that clearly signal entry-level → kept.
  entrySignals: [
    "new grad",
    "new-grad",
    "entry level",
    "entry-level",
    "recent graduate",
    "recent grad",
    "early career",
    "early-career",
    "university graduate",
    "university grad",
    "graduate engineer",
    "graduate program",
    "campus hire",
    "junior",
    "associate",
    "apprentice",
    "0-1 years",
    "0-2 years",
    "no prior experience",
    "no experience required",
  ],
};
