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
    label: "Adzuna — India (official API)",
    description:
      "Indian tech jobs via Adzuna's official API — all levels. Needs an API key configured.",
  },
  {
    username: "jooble",
    label: "Jooble — India (aggregator)",
    description:
      "Indian tech jobs aggregated by Jooble — all levels. Needs an API key configured.",
  },
];

export const CHANNEL_USERNAMES = new Set(CHANNEL_META.map((c) => c.username));
