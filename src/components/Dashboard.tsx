"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  STATUSES,
  STATUS_BY_KEY,
  type Application,
  type ApplicationDraft,
  type StatusKey,
} from "@/lib/types";
import {
  loadTheme,
  saveTheme,
  downloadJSON,
  downloadCSV,
  parseImportedJSON,
  today as todayISO,
} from "@/lib/storage";
import {
  apiList,
  apiCreate,
  apiUpdate,
  apiDelete,
  apiClear,
  apiReplace,
} from "@/lib/api";
import { computeKpis, countByStatus, daysAgo, isFollowUpDue } from "@/lib/stats";
import { ApplicationForm } from "./ApplicationForm";
import {
  IconPlus,
  IconSearch,
  IconEdit,
  IconTrash,
  IconLink,
  IconDownload,
  IconUpload,
  IconSun,
  IconMoon,
  IconBell,
  IconLogout,
  IconUsers,
} from "./icons";
import { PeoplePanel } from "./PeoplePanel";
import { getInvites, getFriends } from "@/lib/social";

type SortKey = "recent" | "oldest" | "company" | "followup";
type Theme = "light" | "dark";

export default function Dashboard({ username }: { username: string }) {
  const router = useRouter();
  const [apps, setApps] = useState<Application[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusKey | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [refFilter, setRefFilter] = useState<"all" | "yes" | "no">("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

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
    } catch {
      alert("Save failed — the database didn't accept the change.");
    }
  }

  async function remove(id: string) {
    const app = apps.find((a) => a.id === id);
    if (app && !confirm(`Delete the ${app.company} — ${app.role} application?`)) return;
    const prev = apps;
    setApps((list) => list.filter((a) => a.id !== id));
    try {
      await apiDelete(id);
    } catch {
      setApps(prev);
      alert("Delete failed.");
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
      alert("Couldn't update status.");
    }
  }

  async function clearAll() {
    if (!confirm("Remove ALL applications? Export a backup first if you need one.")) return;
    const prev = apps;
    setApps([]);
    try {
      await apiClear();
    } catch {
      setApps(prev);
      alert("Clear failed.");
    }
  }

  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(async (text) => {
      const parsed = parseImportedJSON(text);
      if (!parsed) {
        alert("That file isn't a valid applications export.");
        return;
      }
      if (
        apps.length &&
        !confirm(`Import ${parsed.length} applications and REPLACE the current list?`)
      )
        return;
      try {
        const saved = await apiReplace(parsed);
        setApps(saved);
      } catch {
        alert("Import failed.");
      }
    });
    e.target.value = "";
  }

  // ---- Derived data ----
  const kpis = useMemo(() => computeKpis(apps, today), [apps, today]);
  const statusCounts = useMemo(() => countByStatus(apps), [apps]);

  const sources = useMemo(
    () => [...new Set(apps.map((a) => a.source).filter(Boolean))].sort(),
    [apps],
  );

  const countries = useMemo(
    () => [...new Set(apps.map((a) => a.country).filter(Boolean))].sort(),
    [apps],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = apps.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (sourceFilter !== "all" && a.source !== sourceFilter) return false;
      if (countryFilter !== "all" && a.country !== countryFilter) return false;
      if (refFilter === "yes" && !a.referral) return false;
      if (refFilter === "no" && a.referral) return false;
      if (q) {
        const hay = `${a.company} ${a.role} ${a.location}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
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
    return list;
  }, [apps, search, statusFilter, sourceFilter, countryFilter, refFilter, sort]);

  if (!loaded) {
    return <div className="app" aria-busy="true" />;
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

        <button className="btn" onClick={() => downloadCSV(apps)} title="Export CSV">
          <IconDownload /> CSV
        </button>
        <button className="btn" onClick={() => downloadJSON(apps)} title="Export JSON backup">
          <IconDownload /> JSON
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()} title="Import JSON">
          <IconUpload /> Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          onChange={onImportFile}
          hidden
        />
        <button
          className="btn btn-icon"
          onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
          title="Toggle light / dark"
        >
          {theme === "dark" ? <IconSun /> : <IconMoon />}
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
            <span className="sub">{apps.length} total</span>
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
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          aria-label="Filter by source"
        >
          <option value="all">All sources</option>
          {sources.map((s) => (
            <option value={s} key={s}>
              {s}
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
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort"
        >
          <option value="recent">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="company">Company A–Z</option>
          <option value="followup">Follow-up soonest</option>
        </select>
      </div>

      {/* Table */}
      <div className="table-wrap">
        {visible.length === 0 ? (
          <div className="empty">
            <h3>{apps.length ? "No matches" : "No applications yet"}</h3>
            <p>
              {apps.length
                ? "Try clearing a filter or the search box."
                : "Add your first application to start tracking your pipeline."}
            </p>
          </div>
        ) : (
          <table className="apps">
            <thead>
              <tr>
                <th>Company / Role</th>
                <th>Source</th>
                <th>Country</th>
                <th>Applied</th>
                <th>Referral</th>
                <th>Status</th>
                <th>Follow-up</th>
                <th>Link</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="cell-company">{a.company}</div>
                    <div className="cell-role">
                      {a.role}
                      {a.sharedFrom && (
                        <span className="badge-shared" title={`Shared by ${a.sharedFrom}`}>
                          · via {a.sharedFrom}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div>{a.source || "—"}</div>
                    {a.location && <div className="cell-sub">{a.location}</div>}
                  </td>
                  <td>{a.country ? a.country : <span className="cell-sub">—</span>}</td>
                  <td className="tnum">
                    {a.dateApplied ? (
                      <>
                        <div>{formatDate(a.dateApplied)}</div>
                        <div className="cell-sub">{agoLabel(a.dateApplied, today)}</div>
                      </>
                    ) : (
                      <span className="cell-sub">—</span>
                    )}
                  </td>
                  <td>
                    {a.referral ? (
                      <span className="badge badge-ref" title={a.referrer || "Referral"}>
                        {a.referrer ? a.referrer.split(" ")[0] : "Yes"}
                      </span>
                    ) : (
                      <span className="badge badge-none">—</span>
                    )}
                  </td>
                  <td>
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
                  <td className="tnum">
                    {a.followUp ? (
                      <span className={isFollowUpDue(a, today) ? "due" : ""}>
                        {formatDate(a.followUp)}
                      </span>
                    ) : (
                      <span className="cell-sub">—</span>
                    )}
                  </td>
                  <td>
                    {a.link ? (
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
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="hint">
        <IconBell width={13} height={13} />
        Data is saved privately in this browser. Use{" "}
        <strong style={{ color: "var(--ink-2)" }}>Export JSON</strong> for a backup.
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
