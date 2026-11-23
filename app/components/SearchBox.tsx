import { Form, useLocation, useNavigate, useNavigationType } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { rememberSearch } from '../lib/client/search-cache';
import type { CatalogPage } from '../lib/types.server';
import type { Tag } from '../lib/db.server';
export function SearchBox() {
  const location = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const [value, setValue] = useState(() => new URLSearchParams(location.search).get('q') || '');
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef<AbortController | null>(null);
  const composing = useRef(false);
  const lastTyped = useRef(value);
  const previousLocation = useRef(location.key);
  useEffect(() => {
    if (previousLocation.current === location.key) return;
    previousLocation.current = location.key;
    if (navType === 'POP' || location.pathname !== '/search') {
      active.current?.abort();
      if (timer.current) clearTimeout(timer.current);
      const q =
        location.pathname === '/search' ? new URLSearchParams(location.search).get('q') || '' : '';
      setValue(q);
      lastTyped.current = q;
      setError('');
    }
  }, [location.key, location.pathname, location.search, navType]);
  useEffect(
    () => () => {
      active.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function search(q: string) {
    const controller = new AbortController();
    active.current = controller;
    const p = new URLSearchParams(location.pathname === '/search' ? location.search : '');
    p.set('q', q);
    p.delete('page');
    p.set('live', '1');
    setError('');
    try {
      const response = await fetch('/api/search?' + p, { signal: controller.signal });
      if (!response.ok) throw new Error('Search unavailable');
      const result = (await response.json()) as CatalogPage & { tags: Tag[]; type: string };
      if (controller.signal.aborted || lastTyped.current !== q) return;
      const target = '/search?' + p;
      rememberSearch(target, {
        q,
        result,
        type: result.type,
        tags: result.tags,
        current: undefined,
        title: 'Search Results for: ' + (q || 'All music'),
      });
      await navigate(target, { replace: true, preventScrollReset: true });
    } catch {
      if (!controller.signal.aborted && lastTyped.current === q)
        setError('Search could not load. Your current results are still here.');
    }
  }
  function update(q: string) {
    setValue(q);
    lastTyped.current = q;
    active.current?.abort();
    if (timer.current) clearTimeout(timer.current);
    setError('');
    if (composing.current) return;
    timer.current = setTimeout(() => {
      if (q === lastTyped.current) void search(q);
    }, 300);
  }
  return (
    <Form
      role="search"
      action="/search"
      method="get"
      className="search-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        active.current?.abort();
        void search(value);
      }}
    >
      <label htmlFor="music-search">Search sheet music</label>
      <div className="search-field">
        <input
          id="music-search"
          type="search"
          name="q"
          value={value}
          placeholder="Title, composer, or topic"
          autoComplete="off"
          onChange={(e) => update(e.target.value)}
          onCompositionStart={() => {
            composing.current = true;
            active.current?.abort();
            if (timer.current) clearTimeout(timer.current);
          }}
          onCompositionEnd={(e) => {
            composing.current = false;
            update(e.currentTarget.value);
          }}
        />
        <button type="submit" aria-label="Search">
          <Search size={18} />
        </button>
      </div>
      {error && (
        <div className="search-retry">
          <p role="status">{error}</p>
          <button type="button" onClick={() => void search(value)}>
            Retry search
          </button>
        </div>
      )}
    </Form>
  );
}
