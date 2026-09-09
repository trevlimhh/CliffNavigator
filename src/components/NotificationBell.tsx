"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface NotificationRow {
  id: string;
  type: string;
  headline: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

export function NotificationBell({ initialNotifications }: { initialNotifications: NotificationRow[] }) {
  const [notifications, setNotifications] = useState<NotificationRow[]>(initialNotifications);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function markRead(id: string) {
    const supabase = createClient();
    const readAt = new Date().toISOString();
    await supabase.from("notifications").update({ read_at: readAt }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: readAt } : n)));
  }

  async function deleteNotification(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const supabase = createClient();
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  }

  useEffect(() => {
    function handleClickOutside() {
      setOpen(false);
    }
    if (open) document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full bg-slate-100 p-2 text-sm hover:bg-slate-200"
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`group relative border-b border-slate-100 last:border-0 hover:bg-slate-50 ${n.read_at ? "opacity-50" : ""}`}
                >
                  <button onClick={() => markRead(n.id)} className="block w-full p-3 pr-8 text-left">
                    <p className="text-sm font-medium text-slate-900">{n.headline}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{n.message}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{new Date(n.created_at).toLocaleDateString()}</p>
                  </button>
                  <button
                    onClick={(e) => deleteNotification(n.id, e)}
                    aria-label="Delete notification"
                    className="absolute right-2 top-2 rounded p-1 text-sm text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
