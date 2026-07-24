"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  STATUSES,
  STATUS_BY_KEY,
  type Application,
  type ApplicationDraft,
  type StatusKey,
} from "@/lib/types";
import { loadTheme, saveTheme, today as todayISO } from "@/lib/storage";
import { apiList, apiCreate, apiUpdate, apiDelete, apiClear } from "@/lib/api";
import { computeKpis, countByStatus, daysAgo, isFollowUpDue } from "@/lib/stats";
import { matchesLevel } from "@/lib/level";
import { isMnc } from "@/lib/mncs";
import { ApplicationForm } from "./ApplicationForm";
import {
  IconPlus,
  IconSearch,
  IconEdit,
  IconTrash,
  IconLink,
  IconSun,
  IconMoon,
  IconBell,
  IconLogout,
  IconUsers,
} from "./icons";
import { PeoplePanel } from "./PeoplePanel";
import { Pager } from "./Pager";
import { getInvites, getFriends } from "@/lib/social";
import { useToast } from "./Toast";
import { Spinner } from "./Spinner";

const PAGE_SIZE = 20;

type SortKey = "fetched" | "fetchedOld" | "recent" | "oldest" | "company" | "followup";
type FetchedFilter = "all" | "24h" | "7d" | "30d";
const FETCHED_WINDOWS: Record<Exclude<FetchedFilter, "all">, number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};
type Theme = "light" | "dark";

export default function Dashboard({ username }: { username: string }) {
  const router = useRouter();
  const toast = useToast();
  const [apps, setApps] = useState<Application[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);

  const [search, setSearch] = useState("");
  // Keep the input instant while the (potentially large) filter runs on a
  // deferred value — React's native equivalent of debouncing client-side work.
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<StatusKey | "all">("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<"all" | "fresher" | "experienced">("all");
  const [refFilter, setRefFilter] = useState<"all" | "yes" | "no">("all");
  const [companyFilter, setCompanyFilter] = useState<"all" | "mnc">("all");
  const [fetchedFilter, setFetchedFilter] = useState<FetchedFilter>("all");
  const [sort, setSort] = useState<SortKey>("fetched");
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const today = todayISO();

  // ---- Theme on mount ----
  useEffect(() => {
    const stored = loadTheme();
    const effective: Theme =
      stored ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(effective);
  }, []);

  const loadApps = useCallback(() => {
    return apiList()
      .then((rows) => setApps(rows))
      .catch(() =>
        setError("Couldn't reach the database. Check your connection and refresh."),
      );
  }, []);

  const refreshPending = useCallback(() => {
    Promise.all([getInvites(), getFriends()])
      .then(([i, f]) => setPendingCount(i.incoming.length + f.incoming.length))
      .catch(() => {});
  }, []);

  // ---- Load applications + pending requests from the database ----
  useEffect(() => {
    loadApps().finally(() => setLoaded(true));
    refreshPending();
  }, [loadApps, refreshPending]);

  function applyTheme(next: Theme) {
    setTheme(next);
    saveTheme(next);
    document.documentElement.dataset.theme = next;
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  // ---- CRUD (persists to the database) ----
  async function upsert(draft: ApplicationDraft) {
    const isEdit = !!editing;
    try {
      if (editing) {
        const row = await apiUpdate(editing.id, draft);
        setApps((prev) => prev.map((a) => (a.id === editing.id ? row : a)));
      } else {
        const row = await apiCreate(draft);
        setApps((prev) => [row, ...prev]);
      }
      setModalOpen(false);
      setEditing(null);
      toast(isEdit ? "Application updated" : "Application added", "success");
    } catch {
      toast("Save failed — please try again.", "error");
    }
  }

  async function remove(id: string) {
    const app = apps.find((a) => a.id === id);
    if (app && !confirm(`Delete the ${app.company} — ${app.role} application?`)) return;
    const prev = apps;
    setApps((list) => list.filter((a) => a.id !== id));
    try {
      await apiDelete(id);
      toast("Application deleted", "success");
    } catch {
      setApps(prev);
      toast("Delete failed.", "error");
    }
  }

  async function quickStatus(id: string, status: StatusKey) {
    const app = apps.find((a) => a.id === id);
    if (!app) return;
    const prev = apps;
    setApps((list) => list.map((a) => (a.id === id ? { ...a, status } : a)));
    try {
      const { id: _omit, ...draft } = { ...app, status };
      void _omit;
      await apiUpdate(id, draft);
    } catch {
      setApps(prev);
      toast("Couldn't update status.", "error");
    }
  }

  async function clearAll() {
    if (!confirm("Remove ALL applications? Export a backup first if you need one.")) return;
    const prev = apps;
    setApps([]);
    try {
      await apiClear();
      toast("All applications cleared", "success");
    } catch {
      setApps(prev);
      toast("Clear failed.", "error");
    }
  }

  // ---- Derived data ----
  // Apply every filter EXCEPT the status filter. The KPIs and the pipeline-by-
  // stage breakdown are computed from this set, so they reflect the current
  // filters (e.g. "MNCs only" → only those jobs' interviews/offers/etc.), while
  // the status filter still just narrows the table below.
  const filteredBase = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return apps.filter((a) => {
      if (countryFilter !== "all" && a.country !== countryFilter) return false;
      if (!matchesLevel(a.role, levelFilter)) return false;
      if (companyFilter === "mnc" && !isMnc(a.company)) return false;
      if (refFilter === "yes" && !a.referral) return false;
      if (refFilter === "no" && a.referral) return false;
      if (fetchedFilter !== "all") {
        if (!a.createdAt) return false;
        if (Date.now() - Date.parse(a.createdAt) > FETCHED_WINDOWS[fetchedFilter]) return false;
      }
      if (q) {
        const hay = `${a.company} ${a.role} ${a.location}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [apps, deferredSearch, countryFilter, levelFilter, companyFilter, refFilter, fetchedFilter]);

  const kpis = useMemo(() => computeKpis(filteredBase, today), [filteredBase, today]);
  const statusCounts = useMemo(() => countByStatus(filteredBase), [filteredBase]);

  const countries = useMemo(
    () => [...new Set(apps.map((a) => a.country).filter(Boolean))].sort(),
    [apps],
  );

  const visible = useMemo(() => {
    const list =
      statusFilter === "all"
        ? filteredBase
        : filteredBase.filter((a) => a.status === statusFilter);
    return [...list].sort((a, b) => {
      switch (sort) {
        case "fetched":
          return (b.createdAt || "").localeCompare(a.createdAt || "");
        case "fetchedOld":
          return (a.createdAt || "").localeCompare(b.createdAt || "");
        case "oldest":
          return (a.dateApplied || "9999").localeCompare(b.dateApplied || "9999");
        case "company":
          return a.company.localeCompare(b.company);
        case "followup":
          return (a.followUp || "9999").localeCompare(b.followUp || "9999");
        default:
          return (b.dateApplied || "").localeCompare(a.dateApplied || "");
      }
    });
  }, [filteredBase, statusFilter, sort]);

  // Reset to page 1 whenever the filtered result set changes.
  useEffect(() => {
    setPage(1);
  }, [deferredSearch, statusFilter, countryFilter, levelFilter, companyFilter, refFilter, fetchedFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (!loaded) {
    return (
      <div className="app">
        <Spinner label="Loading your applications…" full />
      </div>
    );
  }

  return (
    <div className="app">
      {/* Top bar */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">JT</div>
          <div>
            <h1>JobTrack</h1>
            <p>Your applications, pipeline, and follow-ups — in one place.</p>
          </div>
        </div>

        <button
          className="btn btn-icon"
          onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
          title="Toggle light / dark"
        >
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>

        <button
          className="btn btn-icon people-btn"
          onClick={() => setPeopleOpen(true)}
          aria-label="People and sharing"
          title="People & sharing"
        >
          <IconUsers />
          {pendingCount > 0 && <span className="badge-count">{pendingCount}</span>}
        </button>

        <span className="user-chip" title={`Signed in as ${username}`}>
          <span className="avatar">{username.slice(0, 1)}</span>
          {username}
          <button
            className="btn btn-icon btn-ghost"
            onClick={logout}
            aria-label="Log out"
            title="Log out"
          >
            <IconLogout width={15} height={15} />
          </button>
        </span>
      </header>

      {error && (
        <div
          role="alert"
          style={{
            background: "color-mix(in srgb, var(--bad) 12%, transparent)",
            color: "var(--bad)",
            border: "1px solid color-mix(in srgb, var(--bad) 35%, transparent)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 14px",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* KPI tiles */}
      <section className="kpi-grid">
        <Kpi label="Total applied" value={kpis.totalApplied} meta={`${kpis.active} active`} />
        <Kpi
          label="Response rate"
          value={`${Math.round(kpis.responseRate * 100)}%`}
          meta="replies + rejections"
        />
        <Kpi label="Interviews" value={kpis.interviews} meta="reached screen+" />
        <Kpi label="Offers" value={kpis.offers} meta={kpis.offers ? "🎉 nice" : "keep going"} />
        <Kpi label="Referrals" value={kpis.referrals} meta="warm intros" />
        <Kpi
          label="Follow-ups due"
          value={kpis.followUpsDue}
          meta={kpis.followUpsDue ? "needs action" : "all clear"}
          alert={kpis.followUpsDue > 0}
        />
      </section>

      {/* Pipeline — single horizontal line */}
      <section style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-head">
            <h2>Pipeline by stage</h2>
            <span className="sub">
              {filteredBase.length} {filteredBase.length === apps.length ? "total" : "filtered"}
            </span>
          </div>
          <div className="pipeline-strip">
            {STATUSES.map((s) => (
              <div className="pipe-stage" key={s.key}>
                <span className="pipe-bar" style={{ background: `var(${s.varName})` }} />
                <span className="pipe-count tnum">{statusCounts[s.key]}</span>
                <span className="pipe-name">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Controls */}
      <div className="controls">
        <div className="search">
          <IconSearch style={{ color: "var(--muted)", flex: "none" }} />
          <input
            placeholder="Search company, role, location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search applications"
          />
        </div>
        <select
          className="select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusKey | "all")}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option value={s.key} key={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          aria-label="Filter by country"
        >
          <option value="all">All countries</option>
          {countries.map((c) => (
            <option value={c} key={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as "all" | "fresher" | "experienced")}
          aria-label="Filter by experience level"
        >
          <option value="all">All levels</option>
          <option value="fresher">Fresher / entry</option>
          <option value="experienced">Experienced / senior</option>
        </select>
        <select
          className="select"
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value as "all" | "mnc")}
          aria-label="Filter by company type"
          title="Show only top product-based companies (≈₹12L+ for software in India)"
        >
          <option value="all">All companies</option>
          <option value="mnc">Top product cos (₹12L+)</option>
        </select>
        <select
          className="select"
          value={refFilter}
          onChange={(e) => setRefFilter(e.target.value as "all" | "yes" | "no")}
          aria-label="Filter by referral"
        >
          <option value="all">Referral: any</option>
          <option value="yes">Referral: yes</option>
          <option value="no">Referral: no</option>
        </select>
        <select
          className="select"
          value={fetchedFilter}
          onChange={(e) => setFetchedFilter(e.target.value as FetchedFilter)}
          aria-label="Filter by when fetched"
        >
          <option value="all">Fetched: any time</option>
          <option value="24h">Fetched: last 24h</option>
          <option value="7d">Fetched: last 7 days</option>
          <option value="30d">Fetched: last 30 days</option>
        </select>
        <select
          className="select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort"
        >
          <option value="fetched">Fetched: newest first</option>
          <option value="fetchedOld">Fetched: oldest first</option>
          <option value="recent">Newest applied</option>
          <option value="oldest">Oldest applied</option>
          <option value="company">Company A–Z</option>
          <option value="followup">Follow-up soonest</option>
        </select>
      </div>

      {/* Action row: Subscribe (left) · Add application (right) */}
      <div className="table-actions">
        <button className="btn" onClick={() => router.push("/channels")}>
          <IconUsers width={15} height={15} /> Subscribe to feeds
        </button>
        <button className="btn" onClick={() => router.push("/friends")}>
          <IconUsers width={15} height={15} /> Friends
        </button>
        <button className="btn" onClick={() => router.push("/resume")}>
          📄 Résumé tailor
        </button>
        <button className="btn" onClick={() => router.push("/referral")}>
          ✉️ Referral to Recruiters
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <IconPlus /> Add application
        </button>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="apps">
          <thead>
            <tr>
              <th>Company</th>
              <th>Role</th>
              <th>Shared by</th>
              <th>Country</th>
              <th>Applied</th>
              <th>Fetched</th>
              <th>Referral</th>
              <th>Status</th>
              <th>Follow-up</th>
              <th>Link</th>
              <th>Edit / Delete</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={11}>
                  <div className="empty">
                    <h3>{apps.length ? "No matches" : "No applications yet"}</h3>
                    <p>
                      {apps.length
                        ? "Try clearing a filter or the search box."
                        : "Add your first application to start tracking your pipeline."}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              paged.map((a) => (
                <tr key={a.id}>
                  <td data-label="Company">
                    <div className="cell-company">{a.company}</div>
                  </td>
                  <td data-label="Role">
                    <div className="cell-role">{a.role}</div>
                  </td>
                  <td data-label="Shared by">
                    {a.sharedFrom ? (
                      <span className="badge-shared" title={`Shared by ${a.sharedFrom}`}>
                        {a.sharedFrom}
                      </span>
                    ) : (
                      <span className="cell-sub">You</span>
                    )}
                  </td>
                  <td data-label="Country">
                    <div>{a.country || "—"}</div>
                    {a.location && <div className="cell-sub">{a.location}</div>}
                  </td>
                  <td className="tnum" data-label="Applied">
                    {a.dateApplied ? (
                      <>
                        <div>{formatDate(a.dateApplied)}</div>
                        <div className="cell-sub">{agoLabel(a.dateApplied, today)}</div>
                      </>
                    ) : (
                      <span className="cell-sub">—</span>
                    )}
                  </td>
                  <td className="tnum" data-label="Fetched">
                    {a.createdAt ? (
                      <>
                        <div>{fetchedAgo(a.createdAt)}</div>
                        <div className="cell-sub">{formatDate(a.createdAt.slice(0, 10))}</div>
                      </>
                    ) : (
                      <span className="cell-sub">—</span>
                    )}
                  </td>
                  <td data-label="Referral">
                    {a.referral ? (
                      <span className="badge badge-ref" title={a.referrer || "Referral"}>
                        {a.referrer ? a.referrer.split(" ")[0] : "Yes"}
                      </span>
                    ) : (
                      <span className="badge badge-none">—</span>
                    )}
                  </td>
                  <td data-label="Status">
                    <select
                      className="status-select"
                      value={a.status}
                      onChange={(e) => quickStatus(a.id, e.target.value as StatusKey)}
                      style={{ background: `var(${STATUS_BY_KEY[a.status].varName})` }}
                      aria-label={`Status for ${a.company}`}
                    >
                      {STATUSES.map((s) => (
                        <option value={s.key} key={s.key} style={{ color: "#000" }}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="tnum" data-label="Follow-up">
                    {a.followUp ? (
                      <span className={isFollowUpDue(a, today) ? "due" : ""}>
                        {formatDate(a.followUp)}
                      </span>
                    ) : (
                      <span className="cell-sub">—</span>
                    )}
                  </td>
                  <td data-label="Link">
                    {a.link && /^https?:\/\//i.test(a.link) ? (
                      <a
                        className="open-link"
                        href={a.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open job posting"
                      >
                        <IconLink width={13} height={13} />
                        Open link
                      </a>
                    ) : (
                      <span className="cell-sub">—</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                      <button
                        className="btn btn-icon btn-ghost"
                        onClick={() => {
                          setEditing(a);
                          setModalOpen(true);
                        }}
                        aria-label="Edit"
                        title="Edit"
                      >
                        <IconEdit width={15} height={15} />
                      </button>
                      <button
                        className="btn btn-icon btn-ghost btn-danger"
                        onClick={() => remove(a.id)}
                        aria-label="Delete"
                        title="Delete"
                      >
                        <IconTrash width={15} height={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pager
        page={safePage}
        totalPages={totalPages}
        pageSize={PAGE_SIZE}
        totalItems={visible.length}
        onPage={setPage}
      />

      <div className="hint">
        <IconBell width={13} height={13} />
        Your applications are saved privately to your account and synced across
        your devices.
        {apps.length > 0 && (
          <button
            className="btn btn-ghost btn-danger"
            style={{ marginLeft: "auto", fontSize: 12 }}
            onClick={clearAll}
          >
            Clear all
          </button>
        )}
      </div>

      {modalOpen && (
        <ApplicationForm
          initial={editing}
          onSave={upsert}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
        />
      )}

      {peopleOpen && (
        <PeoplePanel
          onClose={() => setPeopleOpen(false)}
          onChanged={() => {
            loadApps();
            refreshPending();
          }}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  meta,
  alert,
}: {
  label: string;
  value: string | number;
  meta?: string;
  alert?: boolean;
}) {
  return (
    <div className={`kpi${alert ? " alert" : ""}`}>
      <span className="rail" />
      <div className="label">{label}</div>
      <div className="value tnum">{value}</div>
      {meta && <div className="meta">{meta}</div>}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function agoLabel(iso: string, today: string): string {
  const n = daysAgo(iso, today);
  if (n <= 0) return "today";
  if (n === 1) return "1 day ago";
  if (n < 30) return `${n} days ago`;
  const w = Math.round(n / 7);
  return `${w} weeks ago`;
}

/** Relative time from a full ISO timestamp: "just now", "5 min ago", "3 hrs ago", "2 days ago". */
function fetchedAgo(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const wks = Math.floor(days / 7);
  return `${wks} wk${wks === 1 ? "" : "s"} ago`;
}
