"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/icon";
import { formatDateTime } from "@/lib/format";
import { routeForRecord } from "@/lib/record-route";

type N = {
  id: string;
  title: string;
  message: string | null;
  priority: string;
  is_read: boolean;
  created_at: string;
  target_record_id: string | null;
  target_route: string | null;
};

type RecordInfo = { id: string; record_type: string };
type RecordTypeInfo = { code: string; route_template: string | null };

const QUALITY_SYNC_INTERVAL_MS = 60_000;

export function NotificationBell() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<N[]>([]);\n  const [unreadTotal, setUnreadTotal] = useState(0);
  const [recordMap, setRecordMap] = useState<Record<string, string>>({});
  const [routeMap, setRouteMap] = useState<Record<string, string | null>>({});
  const [ringing, setRinging] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread" | "urgent">("all");
  const rootRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const latestCreatedAtRef = useRef<string | null>(null);
  const ringTimerRef = useRef<number | null>(null);
  const lastQualitySyncRef = useRef(0);

  const triggerRing = useCallback(() => {
    setRinging(false);
    window.requestAnimationFrame(() => setRinging(true));
    try {
      if ("vibrate" in navigator) navigator.vibrate([140, 80, 140, 80, 180]);
    } catch {
      // Vibration is optional and may be blocked by the browser/device.
    }
    if (ringTimerRef.current) window.clearTimeout(ringTimerRef.current);
    ringTimerRef.current = window.setTimeout(() => setRinging(false), 3000);
  }, []);

  const load = useCallback(async () => {
    // 5S recheck deadlines need a fast synchronization loop. Broader quality
    // attention and assigned Action reminders are synchronized at most once
    // per minute to avoid unnecessary DB load.
    let syncedNew = false;
    try {
      const syncRes = await fetch("/api/notifications/sync-monitoring-overdue", {
        method: "POST",
        cache: "no-store",
      });
      if (syncRes.ok) {
        const sync = await syncRes.json();
        syncedNew = Number(sync?.created || 0) > 0;
      }
    } catch {
      // Keep the bell usable even if deadline synchronization temporarily fails.
    }

    const now = Date.now();
    if (now - lastQualitySyncRef.current >= QUALITY_SYNC_INTERVAL_MS) {
      lastQualitySyncRef.current = now;
      try {
        const [qualityRes, actionRes] = await Promise.all([
          fetch("/api/notifications/sync-quality-attention", {
            method: "POST",
            cache: "no-store",
          }),
          fetch("/api/notifications/sync-action-reminders", {
            method: "POST",
            cache: "no-store",
          }),
        ]);
        if (qualityRes.ok) {
          const quality = await qualityRes.json();
          syncedNew = syncedNew || Number(quality?.created || 0) > 0;
        }
        if (actionRes.ok) {
          const actions = await actionRes.json();
          syncedNew = syncedNew || Number(actions?.created || 0) > 0;
        }
      } catch {
        // Cross-module attention is supplemental; never block the notification bell.
      }
    }

    const [{ data }, { count: unreadCount }] = await Promise.all([
      supabase
        .from("notifications")
        .select("id,title,message,priority,is_read,created_at,target_record_id,target_route")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false),
    ]);

    const notifications = (data ?? []) as N[];
    const newest = notifications[0] ?? null;
    const hasUnread = notifications.some((item) => !item.is_read);

    if (syncedNew) triggerRing();

    if (!initializedRef.current) {
      initializedRef.current = true;
      latestCreatedAtRef.current = newest?.created_at ?? null;
      if (hasUnread && !syncedNew) triggerRing();
    } else if (newest?.created_at && (!latestCreatedAtRef.current || newest.created_at > latestCreatedAtRef.current)) {
      latestCreatedAtRef.current = newest.created_at;
      if (!newest.is_read && !syncedNew) triggerRing();
    }

    setRows(notifications);\n    setUnreadTotal(unreadCount ?? notifications.filter((item) => !item.is_read).length);

    const ids = notifications.map((x) => x.target_record_id).filter(Boolean) as string[];
    if (ids.length) {
      const { data: records } = await supabase.from("records").select("id,record_type").in("id", ids);
      const rm: Record<string, string> = {};
      (records as RecordInfo[] | null)?.forEach((r) => {
        rm[r.id] = r.record_type;
      });
      setRecordMap(rm);

      const types = Array.from(new Set(Object.values(rm)));
      if (types.length) {
        const { data: rt } = await supabase.from("record_types").select("code,route_template").in("code", types);
        const tm: Record<string, string | null> = {};
        (rt as RecordTypeInfo[] | null)?.forEach((r) => {
          tm[r.code] = r.route_template;
        });
        setRouteMap(tm);
      }
    }
  }, [supabase, triggerRing]);

  useEffect(() => {
    // Keep notifications responsive while the user is active, but do not
    // poll or trigger server-side synchronization in a hidden browser tab.
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    const onFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (ringTimerRef.current) window.clearTimeout(ringTimerRef.current);
    };
  }, [load]);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  const unread = unreadTotal;
  const urgent = rows.filter((r) => !r.is_read && ["HIGH", "URGENT", "CRITICAL"].includes(String(r.priority).toUpperCase())).length;
  const visibleRows = rows.filter((r) => filter === "all" || (filter === "unread" && !r.is_read) || (filter === "urgent" && !r.is_read && ["HIGH", "URGENT", "CRITICAL"].includes(String(r.priority).toUpperCase())));

  async function openNotification(n: N) {
    if (!n.is_read) {
      await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", n.id);
      setRows((curr) => curr.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));\n      setUnreadTotal((curr) => Math.max(0, curr - 1));
    }
    setOpen(false);
    if (n.target_record_id) {
      const type = recordMap[n.target_record_id];
      router.push(n.target_route || routeForRecord(type, n.target_record_id, routeMap[type]));
    } else if (n.target_route) {
      router.push(n.target_route);
    }
  }

  async function markAll() {
    if (!unreadTotal) return;
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("is_read", false);
    setRows((curr) => curr.map((x) => ({ ...x, is_read: true })));
    setUnreadTotal(0);
    setRinging(false);
  }

  return (
    <div className="notification-root" ref={rootRef}>
      <style>{`\n        .notification-filters{display:flex;gap:6px;padding:10px 14px;border-bottom:1px solid #edf2f2;background:#fbfdfd}
        .notification-filters button{border:1px solid transparent;background:transparent;color:#718286;border-radius:999px;padding:6px 9px;font-size:10px;cursor:pointer}
        .notification-filters button:hover{background:#e6eef8;color:#1d3f73}
        .notification-filters button.active{background:#dff4ef;border-color:#b8ded7;color:#0f655f;font-weight:800}
        .notification-filters b{font-size:9px;margin-left:3px}
      `}</style>
      <button
        className={`icon-button header-icon notification-trigger ${unread > 0 ? "has-unread" : ""} ${ringing ? "is-ringing" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Thông báo, ${unread} tin chưa đọc` : "Thông báo"}
        title={unread > 0 ? `${unread} thông báo chưa đọc` : "Không có thông báo mới"}
      >
        <Icon name="bell" size={20} />
        {unread > 0 ? <span className="notification-badge">{unread > 99 ? "99+" : unread}</span> : null}
      </button>

      {open ? (
        <div className="notification-panel">
          <div className="panel-head">
            <div>
              <strong>Thông báo</strong>
              <span>{unread} chưa đọc</span>
            </div>
            <button className="link-button" onClick={markAll}>Đánh dấu tất cả đã đọc</button>
          </div>
          <div className="notification-filters" role="tablist" aria-label="Lọc thông báo">
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Tất cả <b>{rows.length}</b></button>
            <button className={filter === "unread" ? "active" : ""} onClick={() => setFilter("unread")}>Chưa đọc <b>{unread}</b></button>
            <button className={filter === "urgent" ? "active" : ""} onClick={() => setFilter("urgent")}>Ưu tiên <b>{urgent}</b></button>
          </div>
          <div className="notification-list">
            {visibleRows.length === 0 ? (
              <div className="empty-state compact">Chưa có thông báo.</div>
            ) : (
              visibleRows.map((n) => (
                <button key={n.id} className={`notification-item ${n.is_read ? "read" : "unread"}`} onClick={() => openNotification(n)}>
                  <span className={`priority-dot ${n.priority.toLowerCase()}`} />
                  <span className="notification-copy">
                    <strong>{n.title}</strong>
                    {n.message ? <span>{n.message}</span> : null}
                    <small>{formatDateTime(n.created_at)}</small>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
