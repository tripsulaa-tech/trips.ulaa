import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MailCheck, Inbox } from 'lucide-react';
import { supabase } from '../services/supabase';
import { getNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead } from '../services/api';
import type { AdminNotification } from '../types';

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function NotificationsPanel() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const loadCount = () => {
    getUnreadNotificationCount().then(setUnreadCount).catch(console.error);
  };

  const loadList = () => {
    setLoading(true);
    getNotifications()
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  // Initial unread count + realtime subscription (new rows and read-state changes)
  useEffect(() => {
    loadCount();

    const channel = supabase
      .channel('admin-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        loadCount();
        // Keep an already-open panel in sync too
        if (panelRef.current) loadList();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Fetch the list the first time the panel is opened
  useEffect(() => {
    if (open) loadList();
  }, [open]);

  const handleToggle = () => setOpen(o => !o);

  const handleItemClick = async (n: AdminNotification) => {
    setOpen(false);
    if (!n.is_read) {
      setItems(prev => prev.map(x => (x.id === n.id ? { ...x, is_read: true } : x)));
      setUnreadCount(c => Math.max(0, c - 1));
      markNotificationRead(n.id).catch(console.error);
    }
    if (n.link) navigate(n.link);
  };

  const handleMarkAllRead = async () => {
    setItems(prev => prev.map(x => ({ ...x, is_read: true })));
    setUnreadCount(0);
    await markAllNotificationsRead().catch(console.error);
  };

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        className="relative p-2.5 rounded-full bg-background-warm text-dark hover:bg-background transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div ref={panelRef} className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-card-hover border border-background-warm z-20 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-background-warm">
              <p className="font-display font-semibold text-dark">Notifications</p>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <MailCheck size={13} /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <p className="text-center text-sm text-dark-muted py-10">Loading...</p>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-dark-muted">
                  <Inbox size={22} />
                  <p className="text-sm">You're all caught up.</p>
                </div>
              ) : (
                items.map(n => (
                  <button
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={`w-full text-left px-4 py-3 border-b border-background-warm last:border-0 hover:bg-background/60 transition-colors flex gap-2.5 ${n.is_read ? '' : 'bg-primary/5'}`}
                  >
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${n.is_read ? 'bg-transparent' : 'bg-primary'}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm truncate ${n.is_read ? 'text-dark-muted' : 'font-semibold text-dark'}`}>{n.title}</p>
                      {n.body && <p className="text-xs text-dark-muted truncate mt-0.5">{n.body}</p>}
                      <p className="text-[11px] text-dark-muted/70 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
