'use client';

import { useMemo, useRef, useState } from 'react';
import { DOTTED_CIRCLE, KEY_GROUPS, PHRASES, SCHEME, transliterate } from '@/lib/odia';

const TABS = [
  { id: 'write', label: 'Keyboard', odia: 'ଲେଖନ୍ତୁ' },
  { id: 'convert', label: 'Convert a block', odia: 'ରୂପାନ୍ତର' },
];

const keyClass =
  'flex min-w-11 flex-col items-center rounded-lg border border-sand-200 bg-white px-2 py-1.5 leading-none transition hover:border-forest-600 hover:bg-forest-50 active:bg-forest-100';
const actionClass =
  'rounded-lg border border-sand-300 bg-sand-100 px-3 py-2 text-sm font-semibold text-ink-700 transition hover:border-forest-600 hover:bg-forest-50';

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * An Odia writing pad: tap the letters, or type Roman and let the phonetic
 * engine generate the script. The document itself is a plain textarea, so
 * selection, undo and the device keyboard all keep working.
 */
export default function OdiaKeyboard() {
  const [tab, setTab] = useState('write');
  const [text, setText] = useState('');
  const [roman, setRoman] = useState('');
  const [block, setBlock] = useState('');
  const [groupId, setGroupId] = useState(KEY_GROUPS[0].id);
  const [odiaDigits, setOdiaDigits] = useState(true);
  const [copied, setCopied] = useState(null);
  const editor = useRef(null);

  const group = KEY_GROUPS.find((candidate) => candidate.id === groupId) ?? KEY_GROUPS[0];
  const preview = useMemo(() => transliterate(roman, { digits: odiaDigits }), [roman, odiaDigits]);
  const converted = useMemo(() => transliterate(block, { digits: odiaDigits }), [block, odiaDigits]);
  const letters = useMemo(() => [...text].filter((ch) => ch.trim()).length, [text]);
  const words = useMemo(() => text.trim().split(/\s+/).filter(Boolean).length, [text]);

  /** Drop a chunk in at the caret and leave the caret just after it. */
  const insert = (chunk) => {
    const field = editor.current;
    if (!field) {
      setText((current) => current + chunk);
      return;
    }
    const { selectionStart: start, selectionEnd: end } = field;
    const next = text.slice(0, start) + chunk + text.slice(end);
    setText(next);
    const caret = start + chunk.length;
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(caret, caret);
    });
  };

  /** Backspace at the caret, one whole character — matras included. */
  const backspace = () => {
    const field = editor.current;
    if (!field) {
      setText((current) => [...current].slice(0, -1).join(''));
      return;
    }
    const { selectionStart: start, selectionEnd: end } = field;
    if (start === end && start === 0) return;
    const from = start === end ? start - [...text.slice(0, start)].at(-1).length : start;
    const next = text.slice(0, from) + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(from, from);
    });
  };

  /** Commit what is in the compose bar as Odia, with an optional space or newline. */
  const commit = (trailing = '') => {
    const chunk = transliterate(roman, { digits: odiaDigits }) + trailing;
    if (!chunk) return;
    insert(chunk);
    setRoman('');
  };

  const onComposeKey = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit(event.shiftKey ? '\n' : ' ');
    } else if (event.key === ' ' && roman) {
      event.preventDefault();
      commit(' ');
    } else if (event.key === 'Escape') {
      setRoman('');
    }
  };

  const copy = async (value, which) => {
    if (!value) return;
    setCopied((await copyText(value)) ? which : 'failed');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-pressed={tab === entry.id}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === entry.id
                ? 'bg-forest-700 text-white'
                : 'border border-sand-200 bg-white text-ink-700 hover:border-forest-600'
            }`}
          >
            {entry.label} <span className="odia opacity-70">{entry.odia}</span>
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-ink-500">
          <input
            type="checkbox"
            checked={odiaDigits}
            onChange={(event) => setOdiaDigits(event.target.checked)}
            className="size-4 accent-[#126a41]"
          />
          Odia numerals <span className="odia">୦୧୨</span>
        </label>
      </div>

      {tab === 'write' ? (
        <>
          <section className="rounded-xl border border-sand-200 bg-white p-3">
            <label htmlFor="odia-editor" className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-ink-400">
              Your text <span className="odia">ଲେଖା</span>
            </label>
            <textarea
              id="odia-editor"
              ref={editor}
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              spellCheck={false}
              placeholder="ଏଠାରେ ଲେଖନ୍ତୁ — tap the letters below, or type Roman in the bar underneath."
              className="odia mt-1.5 w-full resize-y rounded-lg border border-sand-300 bg-sand-50 px-3 py-2.5 text-xl leading-relaxed text-ink-900 outline-none focus:border-forest-600 focus:ring-2 focus:ring-forest-200"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => insert(' ')} className={`${actionClass} grow sm:grow-0 sm:px-10`}>
                Space
              </button>
              <button type="button" onClick={() => insert('\n')} className={actionClass}>
                ⏎
              </button>
              <button type="button" onClick={backspace} className={actionClass}>
                ⌫ Backspace
              </button>
              <button
                type="button"
                onClick={() => copy(text, 'text')}
                className="rounded-lg bg-forest-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-forest-600 disabled:opacity-40"
                disabled={!text}
              >
                {copied === 'text' ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() => setText('')}
                className={actionClass}
                disabled={!text}
              >
                Clear
              </button>
              <span className="ml-auto text-xs text-ink-400">
                {words} {words === 1 ? 'word' : 'words'} · {letters}{' '}
                {letters === 1 ? 'letter' : 'letters'}
              </span>
            </div>
          </section>

          <section className="rounded-xl border border-sand-200 bg-white p-3">
            <label htmlFor="odia-compose" className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-ink-400">
              Type in Roman <span className="odia">ଫୋନେଟିକ୍</span>
            </label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <input
                id="odia-compose"
                value={roman}
                onChange={(event) => setRoman(event.target.value)}
                onKeyDown={onComposeKey}
                spellCheck={false}
                autoComplete="off"
                placeholder="namaskaara"
                className="min-w-0 flex-1 rounded-lg border border-sand-300 bg-sand-50 px-3 py-2.5 outline-none focus:border-forest-600 focus:ring-2 focus:ring-forest-200"
              />
              <output
                className="odia min-w-24 rounded-lg border border-dashed border-sand-300 px-3 py-2 text-xl text-forest-700"
                aria-live="polite"
              >
                {preview || <span className="text-sm text-ink-400">preview</span>}
              </output>
              <button type="button" onClick={() => commit(' ')} className={actionClass} disabled={!roman}>
                Insert ↵
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-400">
              Space or Enter drops the word into your text. Capitals are the retroflex letters —
              <span className="odia"> T ଟ, D ଡ, N ଣ, S ଷ, L ଳ, R ଡ଼</span> — and doubled letters stay
              doubled, so <code>uttara</code> gives <span className="odia">ଉତ୍ତର</span>.
            </p>
          </section>

          <section className="rounded-xl border border-sand-200 bg-white p-3">
            <div className="flex flex-wrap gap-1.5">
              {KEY_GROUPS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setGroupId(entry.id)}
                  aria-pressed={entry.id === groupId}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    entry.id === groupId
                      ? 'bg-saffron-500 text-forest-800'
                      : 'border border-sand-200 text-ink-500 hover:border-forest-600'
                  }`}
                >
                  {entry.title} <span className="odia">{entry.odia}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {group.keys.map((key) => (
                <button
                  key={`${group.id}-${key.ch}-${key.hint}`}
                  type="button"
                  onClick={() => insert(key.ch)}
                  title={key.roman ? `${key.hint} — ${key.roman}` : key.hint}
                  className={keyClass}
                >
                  <span className="odia text-xl">
                    {key.combining ? DOTTED_CIRCLE : ''}
                    {key.ch}
                  </span>
                  <span className="mt-1 text-[0.6rem] text-ink-400">{key.hint}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-sand-200 bg-white p-3">
            <h2 className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-ink-400">
              Ready phrases <span className="odia">ବାକ୍ୟ</span>
            </h2>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {PHRASES.map((phrase) => (
                <button
                  key={phrase.roman}
                  type="button"
                  onClick={() => insert(phrase.odia)}
                  className="rounded-lg border border-sand-200 px-3 py-2 text-left transition hover:border-forest-600 hover:bg-forest-50"
                >
                  <span className="odia block text-lg">{phrase.odia}</span>
                  <span className="block text-xs text-ink-400">
                    {phrase.english} · {phrase.roman}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-xl border border-sand-200 bg-white p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="odia-block" className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-ink-400">
                Roman
              </label>
              <textarea
                id="odia-block"
                value={block}
                onChange={(event) => setBlock(event.target.value)}
                rows={10}
                spellCheck={false}
                placeholder={'namaskaara. mo naama ...\nodishaa bhaarataraa eka raajYa.'}
                className="mt-1.5 w-full resize-y rounded-lg border border-sand-300 bg-sand-50 px-3 py-2.5 outline-none focus:border-forest-600 focus:ring-2 focus:ring-forest-200"
              />
            </div>
            <div>
              <span className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-ink-400">
                Odia <span className="odia">ଓଡ଼ିଆ</span>
              </span>
              <div className="odia mt-1.5 h-[calc(100%-1.75rem)] min-h-56 whitespace-pre-wrap rounded-lg border border-sand-200 bg-sand-50 px-3 py-2.5 text-xl leading-relaxed">
                {converted}
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copy(converted, 'block')}
              className="rounded-lg bg-forest-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-forest-600 disabled:opacity-40"
              disabled={!converted}
            >
              {copied === 'block' ? 'Copied' : 'Copy Odia'}
            </button>
            <button
              type="button"
              onClick={() => {
                setText((current) => (current ? `${current}\n${converted}` : converted));
                setTab('write');
              }}
              className={actionClass}
              disabled={!converted}
            >
              Send to the keyboard
            </button>
            <button type="button" onClick={() => setBlock('')} className={actionClass} disabled={!block}>
              Clear
            </button>
          </div>
        </section>
      )}

      {copied === 'failed' ? (
        <p className="text-sm text-saffron-700">
          The browser blocked the clipboard — select the text and copy it by hand.
        </p>
      ) : null}

      <details className="rounded-xl border border-sand-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          The whole scheme — every letter and the Roman that types it
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-1.5 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-ink-400">
              Vowels and their matras
            </h3>
            <ul className="grid grid-cols-2 gap-1 text-sm">
              {SCHEME.vowels.map((row) => (
                <li key={row.ch} className="flex items-baseline gap-2">
                  <span className="odia text-lg">
                    {row.ch} {row.matra ? `${DOTTED_CIRCLE}${row.matra}` : ''}
                  </span>
                  <code className="text-xs text-ink-500">{row.keys.join(' / ')}</code>
                </li>
              ))}
            </ul>
            <h3 className="mt-3 mb-1.5 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-ink-400">
              Marks
            </h3>
            <ul className="grid grid-cols-2 gap-1 text-sm">
              {SCHEME.signs.map((row) => (
                <li key={row.ch} className="flex items-baseline gap-2">
                  <span className="odia text-lg">
                    {DOTTED_CIRCLE}
                    {row.ch}
                  </span>
                  <code className="text-xs text-ink-500">{row.keys.join(' / ')}</code>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1.5 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-ink-400">
              Consonants
            </h3>
            <ul className="grid grid-cols-3 gap-1 text-sm sm:grid-cols-4">
              {SCHEME.consonants.map((row) => (
                <li key={row.keys[0]} className="flex items-baseline gap-1.5">
                  <span className="odia text-lg">{row.ch}</span>
                  <code className="text-xs text-ink-500">{row.keys[0]}</code>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </div>
  );
}
