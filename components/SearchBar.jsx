'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { addDays, defaultStay, todayIso } from '@/lib/format';

const TYPE_TAG = { district: 'District', state: 'State' };

const inputClass =
  'w-full rounded-lg border border-sand-300 bg-sand-50 px-3 py-2.5 text-ink-900 outline-none focus:border-forest-600 focus:ring-2 focus:ring-forest-200';
const labelClass = 'text-[0.68rem] font-bold uppercase tracking-[0.08em] text-ink-400';

/** Destination, dates and party size. Searches villages, towns, cities, districts and states. */
export default function SearchBar({ initial = {} }) {
  const router = useRouter();
  const fallback = defaultStay();

  const [text, setText] = useState(initial.label ?? '');
  const [selected, setSelected] = useState(initial.selected ?? null);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [checkIn, setCheckIn] = useState(initial.checkIn ?? fallback.checkIn);
  const [checkOut, setCheckOut] = useState(initial.checkOut ?? fallback.checkOut);
  const [guests, setGuests] = useState(initial.guests ?? 2);
  const [rooms, setRooms] = useState(initial.rooms ?? 1);
  const [error, setError] = useState(null);
  const boxRef = useRef(null);
  const typed = useRef(false);

  // Debounced type-ahead; the previous request is abandoned when input changes.
  useEffect(() => {
    // Only search once the guest actually types: arriving on /search with a
    // destination already in the URL should not drop a list over the page.
    if (!typed.current || text.trim().length < 2 || selected?.label === text) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { results } = await api.suggest(text.trim(), controller.signal);
        setSuggestions(results.slice(0, 10));
        setOpen(true);
        setCursor(-1);
      } catch (err) {
        if (err.name !== 'AbortError') setSuggestions([]);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, selected]);

  useEffect(() => {
    const away = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  useEffect(() => {
    if (checkOut <= checkIn) setCheckOut(addDays(checkIn, 1));
  }, [checkIn, checkOut]);

  const choose = (item) => {
    const label =
      item.type === 'place' ? `${item.name}, ${item.district}, ${item.state}`
      : item.type === 'district' ? `${item.name}, ${item.state}`
      : item.name;
    setSelected({ ...item, label });
    setText(label);
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (!open || !suggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => (c + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => (c - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' && cursor >= 0) {
      event.preventDefault();
      choose(suggestions[cursor]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    const params = new URLSearchParams({ checkIn, checkOut, guests: String(guests), rooms: String(rooms) });
    if (selected?.type === 'place') {
      params.set('placeId', String(selected.id));
      params.set('label', selected.label);
    } else if (selected?.type === 'district') {
      params.set('districtId', String(selected.id));
      params.set('label', selected.label);
    } else if (selected?.type === 'state') {
      params.set('stateSlug', selected.slug);
      params.set('label', selected.label);
    } else if (text.trim()) {
      params.set('q', text.trim());
      params.set('label', text.trim());
    } else {
      setError('Tell us where you are going — a village, town, city, district or state.');
      return;
    }
    setError(null);
    router.push(`/search?${params}`);
  };

  return (
    <form
      ref={boxRef}
      onSubmit={submit}
      className="grid gap-3 rounded-2xl bg-white p-3 shadow-xl shadow-forest-900/10 md:grid-cols-[2fr_1fr_1fr_1.1fr_auto] md:items-end"
    >
      <div className="relative grid gap-1">
        <label htmlFor="destination" className={labelClass}>Where to</label>
        <input
          id="destination" type="text" autoComplete="off" role="combobox"
          aria-expanded={open} aria-controls="destination-list" aria-autocomplete="list"
          placeholder="Village, town, city, district or state"
          value={text}
          onChange={(e) => { typed.current = true; setText(e.target.value); setSelected(null); }}
          onFocus={() => suggestions.length && setOpen(true)}
          onKeyDown={onKeyDown}
          className={inputClass}
        />
        {open && suggestions.length > 0 ? (
          <ul
            id="destination-list" role="listbox"
            className="absolute top-full z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-sand-200 bg-white p-1 shadow-xl"
          >
            {suggestions.map((item, index) => (
              <li key={`${item.type}-${item.id}`}>
                <button
                  type="button" role="option" aria-selected={index === cursor}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => choose(item)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
                    index === cursor ? 'bg-forest-50' : ''
                  }`}
                >
                  <span className="shrink-0 rounded bg-forest-100 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-forest-800">
                    {TYPE_TAG[item.type] ?? item.kind?.toLowerCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{item.name}</span>
                    <span className="block truncate text-xs text-ink-400">
                      {item.type === 'place' ? `${item.district}, ${item.state}` : null}
                      {item.type === 'district' ? item.state : null}
                      {item.type === 'state' ? (item.kind === 'UT' ? 'Union territory' : 'State') : null}
                    </span>
                  </span>
                  {item.properties ? (
                    <span className="shrink-0 text-xs text-ink-400">{item.properties} stays</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="grid gap-1">
        <label htmlFor="checkIn" className={labelClass}>Check in</label>
        <input id="checkIn" type="date" value={checkIn} min={todayIso()}
               onChange={(e) => setCheckIn(e.target.value)} required className={inputClass} />
      </div>

      <div className="grid gap-1">
        <label htmlFor="checkOut" className={labelClass}>Check out</label>
        <input id="checkOut" type="date" value={checkOut} min={addDays(checkIn, 1)}
               onChange={(e) => setCheckOut(e.target.value)} required className={inputClass} />
      </div>

      <div className="grid gap-1">
        <span className={labelClass}>Guests &amp; rooms</span>
        <div className="flex gap-2">
          <select aria-label="Guests" value={guests} onChange={(e) => setGuests(Number(e.target.value))} className={inputClass}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n} guest{n === 1 ? '' : 's'}</option>
            ))}
          </select>
          <select aria-label="Rooms" value={rooms} onChange={(e) => setRooms(Number(e.target.value))} className={inputClass}>
            {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n} room{n === 1 ? '' : 's'}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        className="rounded-lg bg-saffron-500 px-6 py-3 font-bold text-forest-900 transition hover:bg-saffron-400 md:h-[46px] md:py-0"
      >
        Search
      </button>

      {error ? (
        <p role="alert" className="text-sm text-rose-700 md:col-span-5">{error}</p>
      ) : null}
    </form>
  );
}
