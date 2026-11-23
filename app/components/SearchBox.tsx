import { Form, useLocation, useNavigate, useNavigation, useNavigationType } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
export function SearchBox() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const navigationType = useNavigationType();
  const [value, setValue] = useState(() => new URLSearchParams(location.search).get('q') || '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const lastTyped = useRef(value);
  const previousLocation = useRef(location.key);
  useEffect(() => {
    if (previousLocation.current === location.key) return;
    previousLocation.current = location.key;
    if (navigationType === 'POP') {
      if (timer.current) clearTimeout(timer.current);
      const q = new URLSearchParams(location.search).get('q') || '';
      setValue(q);
      lastTyped.current = q;
    } else if (location.pathname !== '/search') {
      if (timer.current) clearTimeout(timer.current);
      setValue('');
      lastTyped.current = '';
    }
  }, [location.key, location.pathname, location.search, navigationType]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const update = (q: string) => {
    setValue(q);
    lastTyped.current = q;
    if (timer.current) clearTimeout(timer.current);
    if (composing.current) return;
    timer.current = setTimeout(() => {
      if (q !== lastTyped.current) return;
      const p = new URLSearchParams(location.pathname === '/search' ? location.search : '');
      p.set('q', q);
      p.delete('page');
      p.set('live', '1');
      void navigate('/search?' + p.toString(), {
        replace: true,
        preventScrollReset: true,
      });
    }, 300);
  };
  return (
    <Form
      role="search"
      action="/search"
      method="get"
      className="search-form"
      onSubmit={() => {
        if (timer.current) clearTimeout(timer.current);
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
      <span className="search-hint" aria-live="polite">
        {navigation.state === 'loading' ? 'Updating results…' : 'Results update as you type'}
      </span>
    </Form>
  );
}
