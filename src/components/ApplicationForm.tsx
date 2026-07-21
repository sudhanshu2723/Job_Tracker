"use client";

import { useEffect, useState } from "react";
import {
  SOURCES,
  STATUSES,
  type Application,
  type ApplicationDraft,
} from "@/lib/types";
import { today } from "@/lib/storage";
import { IconClose } from "./icons";

function emptyDraft(): ApplicationDraft {
  return {
    company: "",
    role: "",
    location: "",
    source: "LinkedIn",
    dateApplied: today(),
    referral: false,
    referrer: "",
    status: "applied",
    ctc: "",
    link: "",
    followUp: "",
    notes: "",
  };
}

interface Props {
  initial: Application | null;
  onSave: (draft: ApplicationDraft) => void;
  onClose: () => void;
}

export function ApplicationForm({ initial, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<ApplicationDraft>(
    initial ? stripId(initial) : emptyDraft(),
  );
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function set<K extends keyof ApplicationDraft>(
    key: K,
    value: ApplicationDraft[K],
  ) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.company.trim() || !draft.role.trim()) {
      setError("Company and role are required.");
      return;
    }
    onSave({ ...draft, company: draft.company.trim(), role: draft.role.trim() });
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={initial ? "Edit application" : "Add application"}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{initial ? "Edit application" : "Add application"}</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="company">Company *</label>
              <input
                id="company"
                value={draft.company}
                onChange={(e) => set("company", e.target.value)}
                placeholder="Stripe"
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="role">Role *</label>
              <input
                id="role"
                value={draft.role}
                onChange={(e) => set("role", e.target.value)}
                placeholder="Software Engineer, Backend"
              />
            </div>

            <div className="field">
              <label htmlFor="source">Source</label>
              <input
                id="source"
                list="source-list"
                value={draft.source}
                onChange={(e) => set("source", e.target.value)}
              />
              <datalist id="source-list">
                {SOURCES.map((s) => (
                  <option value={s} key={s} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="location">Location</label>
              <input
                id="location"
                value={draft.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Bengaluru, India"
              />
            </div>

            <div className="field">
              <label htmlFor="status">Status</label>
              <select
                id="status"
                value={draft.status}
                onChange={(e) =>
                  set("status", e.target.value as ApplicationDraft["status"])
                }
              >
                {STATUSES.map((s) => (
                  <option value={s.key} key={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="dateApplied">Date applied</label>
              <input
                id="dateApplied"
                type="date"
                value={draft.dateApplied}
                onChange={(e) => set("dateApplied", e.target.value)}
              />
            </div>

            <div className="field check">
              <input
                id="referral"
                type="checkbox"
                checked={draft.referral}
                onChange={(e) => set("referral", e.target.checked)}
              />
              <label htmlFor="referral">Got a referral</label>
            </div>
            <div className="field">
              <label htmlFor="referrer">Referrer name</label>
              <input
                id="referrer"
                value={draft.referrer}
                onChange={(e) => set("referrer", e.target.value)}
                placeholder="Who referred you?"
                disabled={!draft.referral}
              />
            </div>

            <div className="field">
              <label htmlFor="ctc">Salary / CTC</label>
              <input
                id="ctc"
                value={draft.ctc}
                onChange={(e) => set("ctc", e.target.value)}
                placeholder="₹48 LPA"
              />
            </div>
            <div className="field">
              <label htmlFor="followUp">Follow-up date</label>
              <input
                id="followUp"
                type="date"
                value={draft.followUp}
                onChange={(e) => set("followUp", e.target.value)}
              />
            </div>

            <div className="field full">
              <label htmlFor="link">Job link</label>
              <input
                id="link"
                type="url"
                value={draft.link}
                onChange={(e) => set("link", e.target.value)}
                placeholder="https://…"
              />
            </div>

            <div className="field full">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                value={draft.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Interview prep, recruiter name, next steps…"
              />
            </div>

            {error && (
              <div className="field full" style={{ color: "var(--bad)", fontSize: 12.5 }}>
                {error}
              </div>
            )}
          </div>

          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {initial ? "Save changes" : "Add application"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function stripId(a: Application): ApplicationDraft {
  const { id: _id, ...rest } = a;
  void _id;
  return rest;
}
