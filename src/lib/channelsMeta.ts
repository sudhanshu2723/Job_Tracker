// Lightweight channel metadata — safe to import on the client and in any route
// (no scanner/heavy imports here). Each channel is a subscribable job feed
// backed by a bot account of the same username.

export interface ChannelMeta {
  username: string;
  label: string;
  description: string;
}

export const CHANNEL_META: ChannelMeta[] = [
  {
    username: "career_ops",
    label: "Career Ops — ATS + LinkedIn/Indeed",
    description:
      "Greenhouse/Ashby/Lever + LinkedIn/Indeed. SDE, backend, full-stack, frontend, IoT & AI/ML — fresher-filtered.",
  },
  {
    username: "remotive",
    label: "Remotive — Remote dev jobs",
    description: "Remote developer roles via Remotive's official API (all levels — filter yourself).",
  },
  {
    username: "arbeitnow",
    label: "Arbeitnow — EU / remote jobs",
    description: "European & remote tech roles via Arbeitnow's free API (all levels).",
  },
  {
    username: "remoteok",
    label: "RemoteOK — Remote jobs",
    description: "Remote tech roles from RemoteOK's public feed (all levels).",
  },
  {
    username: "jobicy",
    label: "Jobicy — Remote jobs",
    description: "Remote roles from Jobicy's free API (all levels).",
  },
  {
    username: "adzuna",
    label: "Adzuna — Worldwide (official API)",
    description:
      "Tech jobs across the US, UK, India, Canada, Australia & Germany via Adzuna's official API — all levels.",
  },
  {
    username: "jooble",
    label: "Jooble — Worldwide (aggregator)",
    description:
      "Tech jobs across the US, UK, India, Canada & Germany aggregated by Jooble — all levels.",
  },
  {
    username: "himalayas",
    label: "Himalayas — Remote jobs",
    description: "Remote roles via Himalayas' official API (all levels).",
  },
  {
    username: "weworkremotely",
    label: "We Work Remotely",
    description: "Remote programming roles from the WeWorkRemotely RSS feed (all levels).",
  },
  {
    username: "glassdoor",
    label: "Glassdoor (scraper)",
    description:
      "Jobs from Glassdoor via jobspy-js. Local-only scraper — runs when ENABLE_JOBSPY is on.",
  },
  {
    username: "themuse",
    label: "The Muse — Global",
    description:
      "Roles from thousands of companies worldwide via The Muse's free public API (all levels).",
  },
  {
    username: "workingnomads",
    label: "Working Nomads — Remote worldwide",
    description: "Remote jobs from around the world via Working Nomads' free feed (all levels).",
  },
  {
    username: "arbeitsagentur",
    label: "Arbeitsagentur — Germany / EU (official)",
    description:
      "Jobs from Germany's Federal Employment Agency — one of Europe's largest job datasets (all levels).",
  },
];

export const CHANNEL_USERNAMES = new Set(CHANNEL_META.map((c) => c.username));
