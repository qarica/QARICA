"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

type Result = { id: string; label: string; title: string; code: string; href: string };

export function TopSearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const json = await res.json();
        if (json.ok) setResults(json.results);
      } catch {
        // silent - search is a convenience, not critical path
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <div className="top-search" ref={boxRef}>
      <Icon name="search" size={16} />
      <input
        placeholder="Tìm kiếm sự cố, RCA, CAPA, audit, tài liệu..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      <span className="top-search-kbd">Ctrl+K</span>
      {open && query.trim().length >= 2 ? (
        <div className="top-search-panel">
          {loading ? <div className="top-search-empty">Đang tìm...</div> : results.length === 0 ? (
            <div className="top-search-empty">Không tìm thấy kết quả cho &quot;{query}&quot;.</div>
          ) : results.map((r) => (
            <button type="button" key={r.id} className="top-search-item" onClick={() => go(r.href)}>
              <span className="top-search-item-label">{r.label}</span>
              <strong>{r.code} · {r.title}</strong>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
